// mesh.js — MeshBuilder: the one factory every object in PALOMA BAY is
// built from. One vertex layout for all meshes; the material is chosen PER
// VERTEX, so a single draw call can hold glossy paint, glass, neon, foliage
// and concrete at once.
// Layout: position(3) normal(3) colour(3) uv(2) material(1) seed(1) sway(1)
// = 14 floats per vertex. Sway is the vertex-shader wind weight (0 = rigid,
// 1 = tip of a frond); seed feeds the procedural facade hash.

import { TAU, applyDir, applyPoint, m4, rng32, v3 } from './math.js';

export const MAT = {
  PLAIN: 0,   // lit diffuse (concrete, asphalt, skin, cloth)
  FACADE: 1,  // procedural building facade from UV + seed (windows, shops)
  GLASS: 2,   // sky reflection + fresnel (windows, water, car glass)
  PAINT: 3,   // clearcoat car paint (sharp spec + fresnel rim)
  FOLIAGE: 4, // wrap lighting + backlight (leaves, fronds)
  EMIT: 5,    // unlit emissive (signs, lamps, muzzle flash, beacons)
  METAL: 6,   // low diffuse, broad spec (chrome, rails, light poles)
};

export class MeshBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.col = [];
    this.uv = []; this.mat = []; this.seed = []; this.sway = [];
    this.idx = [];
    this.stack = [m4.identity()];
    this.color = [1, 1, 1];
    this.material = MAT.PLAIN;
    this.seedVal = 0;
    this.swayVal = 0;
    this.uvScale = [1, 1];
  }

  setColor(r, g, b) { this.color = [r, g, b]; return this; }
  setMat(m) { this.material = m; return this; }
  setSeed(s) { this.seedVal = s; return this; }
  setSway(s) { this.swayVal = s; return this; }
  setUvScale(u, v) { this.uvScale = [u, v]; return this; }
  push(m) { this.stack.push(m4.multiply(this.top, m)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  get top() { return this.stack[this.stack.length - 1]; }

  // One vertex, transformed by the current frame. Returns its index.
  vert(p, n, u, v) {
    const wp = applyPoint(this.top, p);
    const wn = applyDir(this.top, n);
    this.pos.push(wp[0], wp[1], wp[2]);
    this.nor.push(wn[0], wn[1], wn[2]);
    this.col.push(this.color[0], this.color[1], this.color[2]);
    this.uv.push(u * this.uvScale[0], v * this.uvScale[1]);
    this.mat.push(this.material);
    this.seed.push(this.seedVal);
    this.sway.push(this.swayVal);
    return this.pos.length / 3 - 1;
  }

  tri(a, b, c) { this.idx.push(a, b, c); return this; }

  // Quad from 4 corners in order; normal computed from the first edge pair.
  // uv is [[u0,v0]...] per corner, defaulting to the unit square.
  quad(a, b, c, d, uv) {
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(d, a)));
    const q = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const i0 = this.vert(a, n, q[0][0], q[0][1]);
    const i1 = this.vert(b, n, q[1][0], q[1][1]);
    const i2 = this.vert(c, n, q[2][0], q[2][1]);
    const i3 = this.vert(d, n, q[3][0], q[3][1]);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
    return this;
  }

  tri3(a, b, c, n) {
    const nn = n || v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    const i0 = this.vert(a, nn, 0, 0);
    const i1 = this.vert(b, nn, 1, 0);
    const i2 = this.vert(c, nn, 0.5, 1);
    this.tri(i0, i1, i2);
    return this;
  }

  // Axis-aligned box, outward faces.
  box(x0, y0, z0, x1, y1, z1) {
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]); // top
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]); // bottom
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]); // -z
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]); // +z
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]); // -x
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]); // +x
    return this;
  }

  // Tube between two points, radius r0 -> r1, capped optionally.
  tube(p0, p1, r0, r1, sides, cap) {
    sides = sides || 8;
    const dir = v3.norm(v3.sub(p1, p0));
    const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = v3.norm(v3.cross(up, dir));
    const w = v3.cross(dir, u);
    const ring = (p, r, t) => {
      const out = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * TAU;
        const nx = Math.cos(a), ny = Math.sin(a);
        const off = v3.add(v3.scale(u, nx * r), v3.scale(w, ny * r));
        const nrm = v3.norm(v3.add(v3.scale(u, nx), v3.scale(w, ny)));
        out.push(this.vert(v3.add(p, off), nrm, i / sides, t));
      }
      return out;
    };
    const rA = ring(p0, r0, 0);
    const rB = ring(p1, r1, 1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.tri(rA[i], rB[i], rB[j]);
      this.tri(rA[i], rB[j], rA[j]);
    }
    if (cap) {
      const c0 = this.vert(p0, v3.scale(dir, -1), 0.5, 0.5);
      const c1 = this.vert(p1, dir, 0.5, 0.5);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        this.tri(c0, rA[j], rA[i]);
        this.tri(c1, rB[i], rB[j]);
      }
    }
    return this;
  }

  // Flat disc fan facing normal n.
  disc(c, n, r, sides) {
    sides = sides || 20;
    const nn = v3.norm(n);
    const up = Math.abs(nn[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = v3.norm(v3.cross(up, nn));
    const w = v3.cross(nn, u);
    const ci = this.vert(c, nn, 0.5, 0.5);
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const p = v3.add(c, v3.add(v3.scale(u, Math.cos(a) * r), v3.scale(w, Math.sin(a) * r)));
      ring.push(this.vert(p, nn, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)));
    }
    for (let i = 0; i < sides; i++) this.tri(ci, ring[i], ring[(i + 1) % sides]);
    return this;
  }

  // Jittered ellipsoid — tree canopies, heads, shoulders, rocks.
  blob(cx, cy, cz, rx, ry, rz, seed) {
    const rng = rng32((seed * 1000) | 0 || 1);
    const lat = 7, lon = 10;
    const jit = [];
    for (let i = 0; i <= lat; i++) {
      jit[i] = [];
      for (let j = 0; j <= lon; j++) jit[i][j] = 0.85 + rng() * 0.3;
    }
    const grid = [];
    for (let i = 0; i <= lat; i++) {
      grid[i] = [];
      const th = (i / lat) * Math.PI;
      for (let j = 0; j <= lon; j++) {
        const ph = (j / lon) * TAU;
        const k = jit[i][j];
        const p = [
          cx + rx * k * Math.sin(th) * Math.cos(ph),
          cy + ry * k * Math.cos(th),
          cz + rz * k * Math.sin(th) * Math.sin(ph),
        ];
        const n = v3.norm([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]);
        grid[i][j] = this.vert(p, n, j / lon, i / lat);
      }
    }
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        this.tri(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1]);
        this.tri(grid[i][j], grid[i + 1][j + 1], grid[i][j + 1]);
      }
    }
    return this;
  }

  // Flat 2D polygon fan in the XY plane at z = 0, normal +Z.
  poly(pts) {
    let cx = 0, cy = 0;
    pts.forEach((p) => { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    const ci = this.vert([cx, cy, 0], [0, 0, 1], 0.5, 0.5);
    const ring = pts.map((p) => this.vert([p[0], p[1], 0], [0, 0, 1], 0.5 + p[0] * 0.1, 0.5 + p[1] * 0.1));
    for (let i = 0; i < ring.length; i++) this.tri(ci, ring[i], ring[(i + 1) % ring.length]);
    return this;
  }

  // Extrude a 2D profile (array of [x, y], CCW) into a solid from z0 to z1.
  extrude(profile, z0, z1) {
    const n = profile.length;
    for (let i = 0; i < n; i++) {
      const a = profile[i], b = profile[(i + 1) % n];
      const edge = [b[0] - a[0], b[1] - a[1]];
      const nn = v3.norm([edge[1], -edge[0], 0]);
      const i0 = this.vert([a[0], a[1], z0], nn, 0, 0);
      const i1 = this.vert([b[0], b[1], z0], nn, 1, 0);
      const i2 = this.vert([b[0], b[1], z1], nn, 1, 1);
      const i3 = this.vert([a[0], a[1], z1], nn, 0, 1);
      this.tri(i0, i1, i2);
      this.tri(i0, i2, i3);
    }
    const cap = (z, flip) => {
      let cx = 0, cy = 0;
      profile.forEach((p) => { cx += p[0]; cy += p[1]; });
      cx /= n; cy /= n;
      const nn = flip ? [0, 0, -1] : [0, 0, 1];
      const ci = this.vert([cx, cy, z], nn, 0.5, 0.5);
      const ring = profile.map((p) => this.vert([p[0], p[1], z], nn, 0.5 + p[0] * 0.05, 0.5 + p[1] * 0.05));
      for (let i = 0; i < n; i++) {
        if (flip) this.tri(ci, ring[(i + 1) % n], ring[i]);
        else this.tri(ci, ring[i], ring[(i + 1) % n]);
      }
    };
    cap(z1, false);
    cap(z0, true);
    return this;
  }

  // Append another builder's geometry under a transform (template instancing).
  append(other, mat) {
    const base = this.pos.length / 3;
    for (let i = 0; i < other.pos.length; i += 3) {
      const wp = applyPoint(mat, [other.pos[i], other.pos[i + 1], other.pos[i + 2]]);
      const wn = applyDir(mat, [other.nor[i], other.nor[i + 1], other.nor[i + 2]]);
      this.pos.push(wp[0], wp[1], wp[2]);
      this.nor.push(wn[0], wn[1], wn[2]);
    }
    for (let i = 0; i < other.col.length; i++) this.col.push(other.col[i]);
    for (let i = 0; i < other.uv.length; i++) this.uv.push(other.uv[i]);
    for (let i = 0; i < other.mat.length; i++) this.mat.push(other.mat[i]);
    for (let i = 0; i < other.seed.length; i++) this.seed.push(other.seed[i]);
    for (let i = 0; i < other.sway.length; i++) this.sway.push(other.sway[i]);
    for (let i = 0; i < other.idx.length; i++) this.idx.push(other.idx[i] + base);
    return this;
  }

  // Pack into interleaved typed arrays ready for the GPU.
  // NOTE: indices are Uint16 — a single mesh must stay under 65,536 verts.
  // The city builder splits the static world into chunks to respect that.
  build() {
    const count = this.pos.length / 3;
    const data = new Float32Array(count * 14);
    for (let i = 0; i < count; i++) {
      const o = i * 14;
      data[o] = this.pos[i * 3];
      data[o + 1] = this.pos[i * 3 + 1];
      data[o + 2] = this.pos[i * 3 + 2];
      data[o + 3] = this.nor[i * 3];
      data[o + 4] = this.nor[i * 3 + 1];
      data[o + 5] = this.nor[i * 3 + 2];
      data[o + 6] = this.col[i * 3];
      data[o + 7] = this.col[i * 3 + 1];
      data[o + 8] = this.col[i * 3 + 2];
      data[o + 9] = this.uv[i * 2];
      data[o + 10] = this.uv[i * 2 + 1];
      data[o + 11] = this.mat[i];
      data[o + 12] = this.seed[i];
      data[o + 13] = this.sway[i];
    }
    return {
      data,
      indices: new Uint16Array(this.idx),
      count: this.idx.length,
      verts: count,
    };
  }

  get vertexCount() { return this.pos.length / 3; }

  // Reset the vertex/index arrays so the builder can start a new chunk.
  // Keeps the current colour/material/seed/sway state (the next object
  // sets its own) and the transform stack — flushes only happen between
  // objects, when the stack is back at base. The builder object itself
  // stays valid, so a captured reference keeps writing into the new chunk.
  clear() {
    this.pos = []; this.nor = []; this.col = [];
    this.uv = []; this.mat = []; this.seed = []; this.sway = [];
    this.idx = [];
    return this;
  }
}
