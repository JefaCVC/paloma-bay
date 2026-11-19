// buildings.js — Paloma Bay: the chunked static builder + building extrude.
// One building record (footprint, height, style, palette, seed) becomes an
// extruded block with a procedural shader facade, plinth + cornice lines,
// balconies, a roof (hip or flat with clutter: AC, antenna, water tank,
// stepped storey), a ground floor with door + lit windows + striped awning,
// and landmark dressing (hotel pool deck, helipad). Chunked merges the
// static world into a few chunks (Uint16 index limit: a chunk flushes at
// 60,000 verts).

import { TAU, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';
import { buildLoungeChair } from './props.js';

// --- chunked static builder ---------------------------------------------------
// Flushes into a new chunk before the Uint16 vertex limit bites.
export class Chunked {
  constructor() {
    this.chunks = [];
    this.cur = new MeshBuilder();
  }
  get b() { return this.cur; }
  flushIfNearLimit() {
    if (this.cur.vertexCount > 55000) {
      this.chunks.push(this.cur.build());
      // Clear the SAME builder instead of replacing it: buildWorld holds
      // `bd = chunks.b`, and a fresh builder here would orphan every
      // later write (the dense beachfront pushed the world past 55k verts
      // mid-build, silently dropping the deep palms and the billboards).
      this.cur.clear();
    }
  }
  finish() {
    if (this.cur.vertexCount > 0) this.chunks.push(this.cur.build());
    return this.chunks;
  }
}

// --- building (one record -> extrude + shader facade + roof) ------------------
export function buildBuilding(bd, b) {
  const seed = b.style * 100 + b.seed;
  bd.setMat(MAT.FACADE).setSeed(seed).setColor(b.color[0], b.color[1], b.color[2]);
  const { x0, x1, z0, z1, h, floors, cols } = b;
  bd.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [[0, 0], [cols, 0], [cols, floors], [0, floors]]);
  bd.quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [[0, 0], [cols, 0], [cols, floors], [0, floors]]);
  const sideCols = Math.max(2, Math.round((z1 - z0) / 2.4));
  bd.quad([x0, 0, z1], [x0, 0, z0], [x0, h, z0], [x0, h, z1], [[0, 0], [sideCols, 0], [sideCols, floors], [0, floors]]);
  bd.quad([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], [[0, 0], [sideCols, 0], [sideCols, floors], [0, floors]]);
  // Plinth (darker base band) + cornice (pale trim near the top): the two
  // horizontal lines that stop a facade reading as one flat slab.
  const rng = rng32((b.seed * 777 + 13) | 0);
  bd.setMat(MAT.PLAIN).setSeed(0);
  bd.setColor(b.color[0] * 0.55, b.color[1] * 0.55, b.color[2] * 0.55);
  bd.box(x0 - 0.12, 0, z0 - 0.12, x1 + 0.12, 0.8, z1 + 0.12);
  bd.setColor(0.93, 0.90, 0.82);
  bd.box(x0 - 0.18, h - 0.75, z0 - 0.18, x1 + 0.18, h - 0.2, z1 + 0.18);
  // Balconies on the street face (south, z1) for taller buildings: slab +
  // railing, one per upper floor, spread across the face.
  if (h >= 10) {
    const nB = 2 + Math.floor(rng() * 2);
    const w = x1 - x0;
    for (let f = 1; f < floors - 1; f++) {
      const by = 0.4 + f * (h / floors) + 0.4;
      for (let i = 0; i < nB; i++) {
        const bx = x0 + ((i + 0.5) / nB) * w;
        bd.setColor(b.color[0] * 0.8, b.color[1] * 0.8, b.color[2] * 0.8);
        bd.box(bx - 0.9, by, z1, bx + 0.9, by + 0.15, z1 + 0.75);
        bd.setMat(MAT.METAL).setColor(0.75, 0.75, 0.78);
        bd.box(bx - 0.9, by + 0.15, z1 + 0.65, bx + 0.9, by + 0.95, z1 + 0.75);
        bd.setMat(MAT.PLAIN);
      }
    }
  }
  // Roof: slab + parapet for flat, hip slopes for deco.
  bd.setMat(MAT.PLAIN).setSeed(0);
  if (b.roof === 'hip') {
    const rh = h + 2.4, zc = (z0 + z1) / 2, rx0 = x0 + 1.6, rx1 = x1 - 1.6;
    bd.setColor(0.45, 0.28, 0.22);
    bd.quad([x0, h, z1], [x1, h, z1], [rx1, rh, zc], [rx0, rh, zc]);
    bd.quad([x1, h, z0], [x0, h, z0], [rx0, rh, zc], [rx1, rh, zc]);
    bd.tri3([x0, h, z0], [x0, h, z1], [rx0, rh, zc]);
    bd.tri3([x1, h, z1], [x1, h, z0], [rx1, rh, zc]);
  } else {
    bd.setColor(0.30, 0.30, 0.32);
    bd.box(x0, h, z0, x1, h + 0.3, z1);
    bd.setColor(0.36, 0.36, 0.38);
    const p = 0.25, ph = 0.8;
    bd.box(x0, h + 0.3, z1 - p, x1, h + 0.3 + ph, z1);
    bd.box(x0, h + 0.3, z0, x1, h + 0.3 + ph, z0 + p);
    bd.box(x0, h + 0.3, z0, x0 + p, h + 0.3 + ph, z1);
    bd.box(x1 - p, h + 0.3, z0, x1, h + 0.3 + ph, z1);
  }
  // Roof clutter: AC box + antenna mast + (sometimes) a stepped upper
  // storey and a water tank, so the skyline varies building to building.
  const roofY = b.roof === 'hip' ? h : h + 0.3;
  bd.setMat(MAT.METAL).setColor(0.55, 0.55, 0.58);
  bd.box(x0 + 2 + rng() * 2, roofY, z0 + 2, x0 + 3.4 + rng() * 2, roofY + 0.9, z0 + 3.2);
  bd.setMat(MAT.PLAIN).setColor(0.25, 0.25, 0.27);
  const ax = x1 - 2 - rng() * 2, az = z0 + 2 + rng() * 2;
  bd.tube([ax, roofY, az], [ax, roofY + 2.6, az], 0.05, 0.03, 5, true);
  if (b.roof === 'flat' && rng() > 0.6 && b.landmark !== 'helipad') {
    // Stepped upper storey, set back from every edge.
    bd.setColor(b.color[0] * 0.85, b.color[1] * 0.85, b.color[2] * 0.85);
    bd.box(x0 + 3, roofY, z0 + 3, x1 - 3, roofY + 2.0, z1 - 3);
    bd.setColor(0.93, 0.90, 0.82);
    bd.box(x0 + 2.85, roofY + 1.7, z0 + 2.85, x1 - 2.85, roofY + 2.0, z1 - 2.85);
  }
  if (rng() > 0.7 && b.landmark !== 'helipad') {
    // Rooftop water tank on a low base.
    const tx = x0 + 4 + rng() * Math.max(1, (x1 - x0) - 8);
    const tz = z0 + 4 + rng() * Math.max(1, (z1 - z0) - 8);
    bd.setColor(0.45, 0.38, 0.30);
    bd.box(tx - 1.1, roofY, tz - 1.1, tx + 1.1, roofY + 0.3, tz + 1.1);
    bd.setMat(MAT.METAL).setColor(0.60, 0.58, 0.55);
    bd.tube([tx, roofY + 0.3, tz], [tx, roofY + 2.4, tz], 1.0, 1.0, 10, true);
    bd.disc([tx, roofY + 2.4, tz], [0, 1, 0], 1.0, 10);
  }
  // Tall towers get a proper antenna mast + red beacon, so the skyline
  // reads varied from the beachfront and the title orbit.
  if (h >= 24) {
    // The helipad tower's mast moves to a corner so it never pierces the pad.
    const mx = b.landmark === 'helipad' ? x0 + 2.5 : (x0 + x1) / 2;
    const mz = b.landmark === 'helipad' ? z0 + 2.5 : (z0 + z1) / 2;
    bd.setMat(MAT.METAL).setColor(0.45, 0.45, 0.48);
    bd.tube([mx, roofY, mz], [mx, roofY + 6, mz], 0.09, 0.04, 6, true);
    bd.setMat(MAT.EMIT).setColor(1.0, 0.15, 0.15);
    bd.blob(mx, roofY + 6.2, mz, 0.28, 0.28, 0.28, b.seed * 3 + 1);
  }
  // The beachfront hotel landmark: a rooftop pool deck + a lit sign band
  // on the south face near the top.
  if (b.landmark === 'hotel') {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    bd.setMat(MAT.GLASS).setColor(0.25, 0.55, 0.75);
    bd.disc([mx, roofY + 0.12, mz], [0, 1, 0], 3.2, 16);
    bd.setMat(MAT.PLAIN).setColor(0.93, 0.90, 0.82);
    bd.tube([mx, roofY + 0.05, mz], [mx, roofY + 0.35, mz], 3.5, 3.5, 16, false);
    buildLoungeChair(bd, mx - 5.5, mz + 2, 0.4, [1.0, 0.85, 0.30], roofY + 0.3);
    buildLoungeChair(bd, mx + 5.5, mz - 2, -0.4, [0.95, 0.95, 0.95], roofY + 0.3);
    bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.45);
    bd.box(x0 + 3, h - 3.2, z1 + 0.05, x1 - 3, h - 1.6, z1 + 0.4);
  }
  // The helipad tower: a roof pad (dark disc + yellow ring + white H) so
  // the tallest tower reads as a working building, not a flat box.
  if (b.landmark === 'helipad') {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    bd.setMat(MAT.PLAIN).setColor(0.16, 0.16, 0.18);
    bd.disc([mx, roofY + 0.12, mz], [0, 1, 0], 3.4, 20);
    bd.setMat(MAT.EMIT).setColor(1.0, 0.80, 0.25);
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
      bd.tube(
        [mx + Math.cos(a0) * 3.2, roofY + 0.14, mz + Math.sin(a0) * 3.2],
        [mx + Math.cos(a1) * 3.2, roofY + 0.14, mz + Math.sin(a1) * 3.2],
        0.07, 0.07, 4, true,
      );
    }
    bd.setColor(1.0, 1.0, 1.0);
    const hy = roofY + 0.16;
    bd.quad([mx - 1.2, hy, mz - 1.4], [mx - 0.6, hy, mz - 1.4], [mx - 0.6, hy, mz + 1.4], [mx - 1.2, hy, mz + 1.4]);
    bd.quad([mx + 0.6, hy, mz - 1.4], [mx + 1.2, hy, mz - 1.4], [mx + 1.2, hy, mz + 1.4], [mx + 0.6, hy, mz + 1.4]);
    bd.quad([mx - 1.2, hy, mz - 0.3], [mx + 1.2, hy, mz - 0.3], [mx + 1.2, hy, mz + 0.3], [mx - 1.2, hy, mz + 0.3]);
  }
  // Ground floor for EVERY building: an entrance door, two lit windows
  // and a striped awning over the door — the street level reads as shops
  // and lobbies, not blank walls. Shop-style buildings add a lit sign.
  const cx = (x0 + x1) / 2;
  const awnings = [
    [[0.85, 0.30, 0.25], [0.95, 0.90, 0.80]],
    [[0.20, 0.55, 0.65], [0.95, 0.90, 0.80]],
    [[0.95, 0.75, 0.25], [0.95, 0.90, 0.80]],
    [[0.55, 0.35, 0.65], [0.95, 0.90, 0.80]],
  ];
  const awn = awnings[Math.floor(rng() * awnings.length)];
  bd.setMat(MAT.PLAIN).setColor(0.12, 0.10, 0.10);
  bd.box(cx - 0.8, 0, z1, cx + 0.8, 2.6, z1 + 0.18);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.78, 0.45);
  bd.quad([cx - 3.9, 0.9, z1 + 0.06], [cx - 2.1, 0.9, z1 + 0.06], [cx - 2.1, 2.7, z1 + 0.06], [cx - 3.9, 2.7, z1 + 0.06]);
  bd.quad([cx + 2.1, 0.9, z1 + 0.06], [cx + 3.9, 0.9, z1 + 0.06], [cx + 3.9, 2.7, z1 + 0.06], [cx + 2.1, 2.7, z1 + 0.06]);
  bd.setMat(MAT.PLAIN);
  for (let i = 0; i < 5; i++) {
    const c = awn[i % 2];
    bd.setColor(c[0], c[1], c[2]);
    const sx0 = cx - 3 + i * 1.2, sx1 = sx0 + 1.2;
    bd.quad([sx0, 3.4, z1 + 0.1], [sx1, 3.4, z1 + 0.1], [sx1, 2.9, z1 + 1.3], [sx0, 2.9, z1 + 1.3]);
  }
  if (b.style === 2) {
    bd.setMat(MAT.EMIT).setColor(1.0, 0.72, 0.35);
    bd.box(x0 + 2, 3.6, z1 + 0.05, x1 - 2, 4.3, z1 + 0.35);
  }
  // Beachfront cafes: two outdoor tables on the front yard, south face.
  if (b.cafe) {
    const w = x1 - x0;
    for (const fx of [0.3, 0.7]) {
      const tx = x0 + fx * w, tz = z1 + 1.2;
      bd.setMat(MAT.METAL).setColor(0.55, 0.55, 0.58);
      bd.tube([tx, 0.15, tz], [tx, 0.75, tz], 0.05, 0.05, 6, true);
      bd.setMat(MAT.PLAIN).setColor(0.95, 0.95, 0.92);
      bd.disc([tx, 0.76, tz], [0, 1, 0], 0.5, 12);
      bd.setColor(0.30, 0.55, 0.45);
      bd.box(tx - 1.0, 0.15, tz - 0.25, tx - 0.6, 0.5, tz + 0.25);
      bd.box(tx + 0.6, 0.15, tz - 0.25, tx + 1.0, 0.5, tz + 0.25);
    }
  }
}
