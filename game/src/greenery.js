// greenery.js — Paloma Bay: palms, shade trees, streetlights.
// The living green of the city. Palms are segmented leaning trunks with
// folded 3-vertex fronds (9–11 per crown, plus one dead brown frond);
// shade trees are a trunk + jittered ellipsoid blobs in three greens.
// Streetlights are metal poles with a warm emissive lamp head — their
// ground pools are drawn by worldbuild.js into a separate mesh that fades
// in at night. Every builder takes a MeshBuilder and appends to it.

import { TAU, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';

// --- palm (segmented leaning trunk + folded 3-vertex fronds) ------------------
// `scale` grows the whole palm (taller beachfront specimens use 1.15–1.3).
export function buildPalm(bd, x, z, leanDir, leanAmt, seed, scale) {
  const s = scale || 1;
  const rng = rng32((seed * 991 + 7) | 0);
  const baseY = 0.15;
  let px = x, pz = z, py = baseY;
  let r = 0.22;
  const segH = 0.92 * s;
  for (let i = 0; i < 6; i++) {
    const t0 = i / 6, t1 = (i + 1) / 6;
    const ox0 = leanDir[0] * leanAmt * t0 * t0, oz0 = leanDir[1] * leanAmt * t0 * t0;
    const ox1 = leanDir[0] * leanAmt * t1 * t1, oz1 = leanDir[1] * leanAmt * t1 * t1;
    const p0 = [x + ox0, baseY + segH * i, z + oz0];
    const p1 = [x + ox1, baseY + segH * (i + 1), z + oz1];
    const shade = i % 2 === 0 ? 0.42 : 0.36;
    bd.setMat(MAT.PLAIN).setColor(shade, shade * 0.72, shade * 0.5);
    bd.tube(p0, p1, r, r * 0.92, 7, false);
    r *= 0.92;
    px = p1[0]; pz = p1[2]; py = p1[1];
  }
  const crown = [px, py, pz];
  bd.setMat(MAT.FOLIAGE);
  const frond = (angle, len, elev0, droop, col, fseed) => {
    const dir = [Math.cos(angle), 0, Math.sin(angle)];
    const perp = [-dir[2], 0, dir[0]];
    const maxW = 0.5;
    const rows = 9;
    const pts = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const reach = len * Math.cos(elev0) * t;
      const y = len * Math.sin(elev0) * t - droop * len * t * t * 0.62;
      const w = maxW * Math.sin(Math.PI * Math.min(t * 1.12, 1));
      const fold = 0.12 * Math.sin(Math.PI * t);
      const c = [crown[0] + dir[0] * reach, crown[1] + y, crown[2] + dir[2] * reach];
      pts.push({
        l: [c[0] - perp[0] * w / 2, c[1], c[2] - perp[2] * w / 2],
        c: [c[0], c[1] + fold, c[2]],
        r: [c[0] + perp[0] * w / 2, c[1], c[2] + perp[2] * w / 2],
        t,
      });
    }
    bd.setColor(col[0], col[1], col[2]).setSeed(fseed);
    for (let i = 0; i < rows - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const n = [0, 1, 0];
      bd.setSway(a.t);
      const i0 = bd.vert(a.l, n, 0, a.t), i1 = bd.vert(a.c, n, 0.5, a.t);
      bd.setSway(b.t);
      const i2 = bd.vert(b.c, n, 0.5, b.t), i3 = bd.vert(b.l, n, 0, b.t);
      bd.tri(i0, i1, i2); bd.tri(i0, i2, i3);
      bd.setSway(a.t);
      const j0 = bd.vert(a.c, n, 0.5, a.t), j1 = bd.vert(a.r, n, 1, a.t);
      bd.setSway(b.t);
      const j2 = bd.vert(b.r, n, 1, b.t), j3 = bd.vert(b.c, n, 0.5, b.t);
      bd.tri(j0, j1, j2); bd.tri(j0, j2, j3);
    }
    bd.setSway(0);
  };
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * TAU + (rng() - 0.5) * 0.3;
    const len = (2.6 + rng() * 0.8) * s;
    const g = 0.42 + rng() * 0.12;
    frond(ang, len, 0.55 + rng() * 0.15, 1.0 + rng() * 0.25, [0.14 + rng() * 0.05, g, 0.20], seed + i * 0.37);
  }
  frond(rng() * TAU, 2.2 * s, -0.45, 0.7, [0.45, 0.32, 0.15], seed + 9.3); // dead frond
}

// Shade tree: trunk + jittered ellipsoid blobs in three greens.
export function buildShadeTree(bd, x, z, seed) {
  const rng = rng32((seed * 331 + 5) | 0);
  bd.setMat(MAT.PLAIN).setColor(0.38, 0.28, 0.18);
  bd.tube([x, 0.15, z], [x + (rng() - 0.5) * 0.4, 2.2 + rng(), z + (rng() - 0.5) * 0.4], 0.18, 0.12, 7, true);
  const greens = [[0.16, 0.42, 0.20], [0.20, 0.50, 0.24], [0.13, 0.36, 0.18]];
  bd.setMat(MAT.FOLIAGE);
  for (let i = 0; i < 4; i++) {
    const g = greens[i % 3];
    bd.setColor(g[0], g[1], g[2]);
    bd.blob(
      x + (rng() - 0.5) * 1.6, 2.6 + rng() * 0.9, z + (rng() - 0.5) * 1.6,
      1.1 + rng() * 0.7, 0.9 + rng() * 0.5, 1.1 + rng() * 0.7,
      seed * 10 + i,
    );
  }
}

export function buildStreetlight(bd, x, z, faceZ) {
  bd.setMat(MAT.METAL).setColor(0.16, 0.16, 0.18);
  bd.tube([x, 0.15, z], [x, 5.0, z], 0.08, 0.06, 6, true);
  const armZ = faceZ ? -1.3 : 1.3;
  bd.tube([x, 5.0, z], [x, 4.9, z + armZ], 0.05, 0.04, 5, true);
  bd.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
  bd.box(x - 0.28, 4.78, z + armZ - 0.25, x + 0.28, 4.95, z + armZ + 0.25);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.75, 0.40);
  bd.disc([x, 4.77, z + armZ], [0, -1, 0], 0.28, 10);
}
