// world.js — Paloma Bay: the city.
// Data-driven generation: one district parameter table drives the whole
// city (style, palette, heights, setbacks), buildings are records that get
// extruded with procedural shader facades, and every prop faces the road.
// The static world is merged into a few chunks (Uint16 index limit: a chunk
// flushes at 60,000 verts). Collision is the buildings' AABBs, exported
// for the gameplay code. All fictional names are original to this game.

import { TAU, frame, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';

// --- city layout -------------------------------------------------------------
// Avenues run north-south, streets east-west. Road width 8.
export const AVENUES = [-120, -60, 0, 60, 120];
export const STREETS = [-100, -50, 0, 50, 100];
export const ROAD_W = 8;
export const CITY = { x0: -175, x1: 175, z0: -155, z1: 125 };
export const BEACH_Z = 100; // sand starts here; water past z = 140
export const WATER_Z = 140;
export const ISLAND = { cx: 0, cz: 200, rx: 62, rz: 42 }; // Isla Verde
export const WET_SEED = 901; // marks road quads for the wet-road shader path

// District parameter table: style (0 deco, 1 modern, 2 shop), palette,
// height range, and the region it owns. One table, seven looks.
// Palettes are Miami pastels, not beige: no two adjacent buildings share
// a colour, and the beachfront (La Rambla) reads as a painted strand.
export const DISTRICTS = [
  { name: 'Porto Lumen', region: [-175, -125, -60, 60], style: 2, hMin: 6, hMax: 12,
    palette: [[0.72, 0.66, 0.58], [0.55, 0.68, 0.78], [0.78, 0.70, 0.55], [0.88, 0.80, 0.62]] },
  { name: 'Ciudad Vieja', region: [-120, -60, -105, -45], style: 0, hMin: 8, hMax: 16,
    palette: [[0.85, 0.72, 0.55], [0.92, 0.55, 0.42], [0.88, 0.78, 0.62], [0.80, 0.62, 0.48]] },
  { name: 'North Docks', region: [-60, 60, -155, -100], style: 1, hMin: 7, hMax: 13,
    palette: [[0.55, 0.55, 0.58], [0.48, 0.50, 0.55], [0.62, 0.58, 0.52]] },
  { name: 'Palm Heights', region: [60, 175, -105, 0], style: 1, hMin: 16, hMax: 38,
    palette: [[0.72, 0.76, 0.80], [0.65, 0.70, 0.75], [0.80, 0.78, 0.72], [0.55, 0.68, 0.82]] },
  { name: 'Barrio Sol', region: [-60, 0, 0, 100], style: 2, hMin: 6, hMax: 11,
    palette: [[0.85, 0.68, 0.45], [0.78, 0.55, 0.42], [0.90, 0.75, 0.55], [0.92, 0.60, 0.60], [0.45, 0.72, 0.68]] },
  { name: 'La Rambla', region: [-120, 175, 50, 100], style: 0, hMin: 9, hMax: 20,
    palette: [[0.95, 0.55, 0.45], [0.45, 0.75, 0.72], [0.95, 0.88, 0.70], [0.95, 0.80, 0.40], [0.95, 0.65, 0.70], [0.60, 0.85, 0.70]] },
  { name: 'Isla Verde', region: [-62, 62, 158, 242], style: 0, hMin: 5, hMax: 9,
    palette: [[0.85, 0.80, 0.68], [0.78, 0.72, 0.60], [0.90, 0.85, 0.75], [0.60, 0.85, 0.70]] },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const [x0, x1, z0, z1] = d.region;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return d.name;
  }
  if (z > 100) return 'La Rambla';
  return 'Paloma Bay';
}

// --- points of interest (fixed, named, used by missions + shops) ------------
export const POI = {
  garage: { name: "Mara's Garage", kind: 'garage', x: -30, z: 25, yaw: Math.PI / 2 },
  pawn: { name: "Zed's Pawn", kind: 'pawn', x: -45, z: -20, yaw: 0 },
  gunshop: { name: 'Iron & Oak Guns', kind: 'gunshop', x: 30, z: 10, yaw: -Math.PI / 2 },
  safehouse: { name: "Theo's Apartment", kind: 'safehouse', x: 15, z: -60, yaw: 0 },
  vireoHQ: { name: 'Vireo Import House', kind: 'landmark', x: -140, z: 0, yaw: Math.PI / 2 },
  ferris: { name: 'Paloma Wheel', kind: 'landmark', x: 80, z: 112, yaw: 0 },
  lighthouse: { name: 'Isla Verde Light', kind: 'landmark', x: 0, z: 228, yaw: 0 },
  pier: { name: 'Porto Lumen Pier', kind: 'landmark', x: -168, z: 20, yaw: 0 },
};

// 20 collectible Bay Postcards, at landmarks and viewpoints.
export const POSTCARDS = [
  [-168, 20], [-120, -40], [-120, 40], [-120, -100], [-60, -75], [-60, -125],
  [-30, 25], [-45, -20], [0, 75], [0, -100], [0, 140], [30, 10], [15, -60],
  [60, -75], [90, -50], [120, 0], [80, 112], [120, 75], [0, 175], [0, 228],
];

// --- chunked static builder ---------------------------------------------------
// Flushes into a new chunk before the Uint16 vertex limit bites.
class Chunked {
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
function buildBuilding(bd, b) {
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

// --- palm (segmented leaning trunk + folded 3-vertex fronds) ------------------
// `scale` grows the whole palm (taller beachfront specimens use 1.15–1.3).
function buildPalm(bd, x, z, leanDir, leanAmt, seed, scale) {
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
function buildShadeTree(bd, x, z, seed) {
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

function buildStreetlight(bd, x, z, faceZ) {
  bd.setMat(MAT.METAL).setColor(0.16, 0.16, 0.18);
  bd.tube([x, 0.15, z], [x, 5.0, z], 0.08, 0.06, 6, true);
  const armZ = faceZ ? -1.3 : 1.3;
  bd.tube([x, 5.0, z], [x, 4.9, z + armZ], 0.05, 0.04, 5, true);
  bd.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
  bd.box(x - 0.28, 4.78, z + armZ - 0.25, x + 0.28, 4.95, z + armZ + 0.25);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.75, 0.40);
  bd.disc([x, 4.77, z + armZ], [0, -1, 0], 0.28, 10);
}

// --- traffic lights ------------------------------------------------------------
// Signaled intersections: the avenue (x) and street (z) that cross, plus a
// phase offset so neighbouring lights don't flip in lockstep. Cycle 28s:
// NS green 12s, NS yellow 2s, EW green 12s, EW yellow 2s. The poles + head
// boxes are static (merged into the world); the LAMPS are one dynamic mesh
// rebuilt by game.js whenever any phase flips. Traffic AI stops at red;
// pedestrians cross at the painted crosswalks only while their road is red.
export const TRAFFIC_LIGHTS = [
  { x: 0, z: 0, offset: 0 },
  { x: 60, z: 0, offset: 7 },
  { x: -60, z: 0, offset: 14 },
  { x: 0, z: 50, offset: 21 },
  { x: 60, z: 50, offset: 3 },
  { x: -60, z: 50, offset: 10 },
  { x: 0, z: -50, offset: 17 },
  { x: -60, z: -50, offset: 24 },
  { x: 60, z: -50, offset: 5 },
  { x: 60, z: 100, offset: 12 }, // beachfront: the cover shot's red light
];
export const LIGHT_CYCLE = 28;

// Phase at time t (seconds): { ns, ew }, each 'green' | 'yellow' | 'red'.
// An override map ({ "x,z": phaseName }) forces one intersection's phase —
// used by the screenshot stager to freeze a red light into the cover.
export function lightPhase(light, t, overrides) {
  if (overrides) {
    const forced = overrides[light.x + ',' + light.z];
    if (forced === 'ns-green') return { ns: 'green', ew: 'red' };
    if (forced === 'ns-yellow') return { ns: 'yellow', ew: 'red' };
    if (forced === 'ew-green') return { ns: 'red', ew: 'green' };
    if (forced === 'ew-yellow') return { ns: 'red', ew: 'yellow' };
  }
  const p = (((t + light.offset) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  if (p < 12) return { ns: 'green', ew: 'red' };
  if (p < 14) return { ns: 'yellow', ew: 'red' };
  if (p < 26) return { ns: 'red', ew: 'green' };
  return { ns: 'red', ew: 'yellow' };
}

// The four signal heads of one intersection. Each head stands on a sidewalk
// corner pole and faces the traffic approaching from the opposite side:
// southbound (drives +z) reads the south-east head facing north, northbound
// the north-west head facing south, eastbound the east-north head facing
// west, westbound the west-south head facing east. dir is which phase it
// shows ('ns' or 'ew').
export function lightHeads(light) {
  const { x, z } = light;
  return [
    { x: x + 5.5, z: z + 6.5, nx: 0, nz: -1, dir: 'ns' }, // southbound approach
    { x: x - 5.5, z: z - 6.5, nx: 0, nz: 1, dir: 'ns' }, // northbound approach
    { x: x + 6.5, z: z - 5.5, nx: -1, nz: 0, dir: 'ew' }, // eastbound approach
    { x: x - 6.5, z: z + 5.5, nx: 1, nz: 0, dir: 'ew' }, // westbound approach
  ];
}

const HEAD_Y = 4.7; // lamp-row centre height (head box spans 3.85..5.55)

// Static part: pole + head box (the lamps are drawn dynamically).
function buildTrafficLightPole(bd, head) {
  bd.setMat(MAT.METAL).setColor(0.16, 0.16, 0.18);
  bd.tube([head.x, 0.15, head.z], [head.x, HEAD_Y + 0.9, head.z], 0.09, 0.07, 6, true);
  // Head box: thin along its facing axis, 0.7 wide, 1.7 tall.
  const thinX = head.nx !== 0; // faces east/west -> thin in x
  const hx0 = thinX ? head.x - 0.18 : head.x - 0.35;
  const hx1 = thinX ? head.x + 0.18 : head.x + 0.35;
  const hz0 = thinX ? head.z - 0.35 : head.z - 0.18;
  const hz1 = thinX ? head.z + 0.35 : head.z + 0.18;
  bd.setMat(MAT.PLAIN).setColor(0.08, 0.08, 0.09);
  bd.box(hx0, HEAD_Y - 0.85, hz0, hx1, HEAD_Y + 0.85, hz1);
  // Visor hood over the lamps.
  bd.box(hx0 - 0.02, HEAD_Y + 0.85, hz0 - 0.02, hx1 + 0.02, HEAD_Y + 0.95, hz1 + 0.02);
}

// Dynamic part: the three lamps of every head (red top, yellow middle,
// green bottom). Only the active lamp glows; the others are dark glass.
// Returns a MeshBuilder the caller uploads and re-uploads on phase flips
// (one draw call for all forty heads).
export function buildTrafficLightLamps(t, overrides) {
  const bd = new MeshBuilder();
  const lampCols = {
    red: [1.0, 0.12, 0.10], yellow: [1.0, 0.78, 0.15], green: [0.25, 1.0, 0.30],
  };
  const darkCols = {
    red: [0.28, 0.08, 0.08], yellow: [0.28, 0.22, 0.08], green: [0.08, 0.25, 0.10],
  };
  for (const light of TRAFFIC_LIGHTS) {
    const phase = lightPhase(light, t, overrides);
    for (const head of lightHeads(light)) {
      const active = phase[head.dir];
      // Lamp plane proud of the box face (faces are 0.18 off centre).
      const fx = head.x + head.nx * 0.20;
      const fz = head.z + head.nz * 0.20;
      const lamps = [['red', 0.55], ['yellow', 0], ['green', -0.55]];
      for (const [name, dy] of lamps) {
        const on = active === name;
        if (on) bd.setMat(MAT.EMIT).setColor(lampCols[name][0], lampCols[name][1], lampCols[name][2]);
        else bd.setMat(MAT.PLAIN).setColor(darkCols[name][0], darkCols[name][1], darkCols[name][2]);
        bd.disc([fx, HEAD_Y + dy, fz], [head.nx, 0, head.nz], 0.24, 12);
      }
    }
  }
  return bd;
}

// Market stall (Barrio Sol): posts + striped canopy + crates.
function buildMarketStall(bd, x, z, yaw, seed) {
  const rng = rng32((seed * 57 + 3) | 0);
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(0.45, 0.32, 0.20);
  for (const [px, pz] of [[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]]) {
    bd.tube([px, 0.15, pz], [px, 2.4, pz], 0.06, 0.05, 5, true);
  }
  const stripes = [[0.85, 0.30, 0.25], [0.95, 0.90, 0.80]];
  bd.setMat(MAT.PLAIN);
  for (let i = 0; i < 6; i++) {
    const c = stripes[i % 2];
    bd.setColor(c[0], c[1], c[2]);
    const x0 = -1.7 + i * (3.4 / 6);
    bd.quad([x0, 2.6, -1.4], [x0 + 3.4 / 6, 2.6, -1.4], [x0 + 3.4 / 6, 2.35, 1.4], [x0, 2.35, 1.4]);
  }
  bd.setColor(0.55, 0.40, 0.22);
  bd.box(-1.3, 0.9, -0.8, 1.3, 1.05, 0.8);
  bd.setColor(0.75, 0.45, 0.15 + rng() * 0.1);
  bd.box(-0.9, 1.05, -0.5, -0.2, 1.35, 0.3);
  bd.setColor(0.35, 0.60, 0.20);
  bd.box(0.2, 1.05, -0.4, 0.9, 1.30, 0.4);
  bd.pop();
}

// Shipping container / crate stacks (docks).
function buildContainer(bd, x, z, yaw, color) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(color[0], color[1], color[2]);
  bd.box(-3, 0.15, -1.2, 3, 2.6, 1.2);
  bd.setMat(MAT.PLAIN).setColor(color[0] * 0.7, color[1] * 0.7, color[2] * 0.7);
  for (let i = -2; i <= 2; i++) {
    bd.box(i * 1.2 - 0.06, 0.2, -1.22, i * 1.2 + 0.06, 2.55, -1.18);
  }
  bd.pop();
}

// --- billboards (beachfront ads) ------------------------------------------------
// No 3D text exists in the material set, so each ad is a lit colour-block
// face with geometric glyphs (discs, bars, a diamond) — the shape language
// of a roadside board, readable from the chase camera. All brands are
// original to Paloma Bay. Glyph: [kind, cx, cy, w, h, color]; cx/cy are
// fractions of the panel (origin at panel centre), w/h fractions of panel
// width/height, 'disc' uses w as radius (fraction of panel height).
const BILLBOARDS = {
  radio: { // Radio Paloma 88.5 — magenta + sun disc + wave bars
    face: [0.95, 0.25, 0.55],
    glyphs: [
      ['disc', -0.30, 0.10, 0.18, 0, [1.0, 0.85, 0.25]],
      ['quad', 0.12, -0.22, 0.50, 0.08, [1.0, 1.0, 1.0]],
      ['quad', 0.12, 0.00, 0.50, 0.08, [1.0, 1.0, 1.0]],
      ['quad', 0.12, 0.22, 0.50, 0.08, [1.0, 1.0, 1.0]],
    ],
  },
  wheel: { // Paloma Wheel — teal + ferris-wheel ring + cabin dots
    face: [0.10, 0.65, 0.75],
    glyphs: [
      ['disc', -0.26, 0.00, 0.32, 0, [1.0, 0.85, 0.25]],
      ['disc', -0.26, 0.00, 0.23, 0, [0.10, 0.65, 0.75]],
      ['disc', -0.26, 0.00, 0.06, 0, [1.0, 0.85, 0.25]],
      ['disc', -0.35, 0.00, 0.05, 0, [0.95, 0.30, 0.25]],
      ['disc', -0.17, 0.00, 0.05, 0, [0.95, 0.75, 0.20]],
      ['disc', -0.26, 0.28, 0.05, 0, [0.30, 0.80, 0.40]],
      ['disc', -0.26, -0.28, 0.05, 0, [1.0, 1.0, 1.0]],
      ['quad', 0.20, -0.20, 0.42, 0.08, [1.0, 1.0, 1.0]],
      ['quad', 0.20, 0.20, 0.42, 0.08, [1.0, 0.85, 0.25]],
    ],
  },
  guns: { // Iron & Oak Guns — orange + crosshair
    face: [0.95, 0.45, 0.10],
    glyphs: [
      ['quad', 0.00, 0.00, 0.04, 0.62, [1.0, 1.0, 1.0]],
      ['quad', 0.00, 0.00, 0.52, 0.07, [1.0, 1.0, 1.0]],
      ['disc', 0.00, 0.00, 0.09, 0, [0.80, 0.10, 0.10]],
    ],
  },
  garage: { // Mara's Garage — blue + signal bars + headlamp dot
    face: [0.15, 0.45, 0.95],
    glyphs: [
      ['disc', -0.33, 0.00, 0.15, 0, [1.0, 1.0, 1.0]],
      ['quad', 0.10, 0.24, 0.55, 0.09, [1.0, 0.85, 0.25]],
      ['quad', 0.10, 0.00, 0.55, 0.09, [1.0, 0.85, 0.25]],
      ['quad', 0.10, -0.24, 0.55, 0.09, [1.0, 0.85, 0.25]],
    ],
  },
  vireo: { // Vireo Import House — purple + diamond + gold bar
    face: [0.55, 0.25, 0.85],
    glyphs: [
      ['diamond', -0.05, 0.05, 0.22, 0, [1.0, 1.0, 1.0]],
      ['diamond', 0.32, 0.26, 0.08, 0, [1.0, 0.85, 0.25]],
      ['quad', 0.00, -0.30, 0.52, 0.07, [1.0, 0.85, 0.25]],
    ],
  },
};

// Placement along the beachfront road (x 30–110), ALL on the sand side.
// Every board stands on open sand with its own clear footprint: the
// north-side spots used to sit against the beachfront buildings, and the
// rotated panels pierced the facades (the magenta board cut straight
// through the building behind it). Sand-side boards face west-northwest
// (yaw ≈ −2.10) toward the eastbound chase camera, their posts land on
// sand or sidewalk (never in the road), and no two panels overlap —
// verified by the clearance probe (see /tmp/paloma-probe2.mjs).
const BILLBOARD_SPOTS = [
  { x: 30, z: 111, yaw: -2.10, w: 14, h: 5, design: BILLBOARDS.radio },
  { x: 58, z: 112, yaw: -2.10, w: 20, h: 6.5, design: BILLBOARDS.wheel },
  { x: 70, z: 110, yaw: -2.10, w: 13, h: 5, design: BILLBOARDS.guns },
  { x: 92, z: 110, yaw: -2.10, w: 14, h: 5, design: BILLBOARDS.garage },
  { x: 105, z: 110, yaw: -2.10, w: 12, h: 4.5, design: BILLBOARDS.vireo },
];

// Keep palms and shade trees clear of billboard panels and posts.
function nearBillboard(x, z) {
  return BILLBOARD_SPOTS.some((b) => Math.hypot(b.x - x, b.z - z) < 11);
}

// Two posts + a dark backing panel + a lit ad face with glyphs, all inside
// one rotated frame so the board faces the road (face normal +Z local).
function buildBillboard(bd, spot) {
  const { x, z, yaw, w, h, design } = spot;
  const postH = 8; // panel bottom height — clears palms, reads over traffic
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  bd.tube([-w / 2 + 1.2, 0, 0], [-w / 2 + 1.2, postH, 0], 0.28, 0.22, 6, true);
  bd.tube([w / 2 - 1.2, 0, 0], [w / 2 - 1.2, postH, 0], 0.28, 0.22, 6, true);
  bd.box(-w / 2, postH - 0.3, -0.15, w / 2, postH + 0.1, 0.15);
  bd.setMat(MAT.PLAIN).setColor(0.10, 0.10, 0.12);
  bd.box(-w / 2, postH, -0.2, w / 2, postH + h, 0.2);
  const f = design.face;
  bd.setMat(MAT.EMIT).setColor(f[0], f[1], f[2]);
  bd.quad(
    [-w / 2 + 0.25, postH + 0.25, 0.24], [w / 2 - 0.25, postH + 0.25, 0.24],
    [w / 2 - 0.25, postH + h - 0.25, 0.24], [-w / 2 + 0.25, postH + h - 0.25, 0.24],
  );
  design.glyphs.forEach((g, i) => {
    const [kind, cx, cy, gw, gh, col] = g;
    const gz = 0.32 + i * 0.02; // each glyph proud of the last (no z-fight)
    bd.setColor(col[0], col[1], col[2]);
    const gx = cx * w, gy = postH + h / 2 + cy * h;
    if (kind === 'disc') {
      bd.disc([gx, gy, gz], [0, 0, 1], gw * h, 20);
    } else if (kind === 'diamond') {
      const r = gw * h;
      bd.quad([gx, gy + r, gz], [gx - r, gy, gz], [gx, gy - r, gz], [gx + r, gy, gz]);
    } else {
      const hw = (gw * w) / 2, hh = (gh * h) / 2;
      bd.quad([gx - hw, gy - hh, gz], [gx + hw, gy - hh, gz],
              [gx + hw, gy + hh, gz], [gx - hw, gy + hh, gz]);
    }
  });
  bd.pop();
}

// --- boats (anchored offshore) -------------------------------------------------
// Sailboats (hull + mast + triangular sails) and motorboats (hull + cabin +
// outboard), floating at the waterline (y = -0.4). They sit still —
// anchored boats barely move at this scale — but they make the bay read as
// used water, not a flat blue plane. game.js reuses BOAT_SPOTS as circular
// obstacles for the jet ski.
export const BOAT_SPOTS = [
  { x: -80, z: 165, yaw: 0.4, kind: 'sail', seed: 1 },
  { x: -30, z: 178, yaw: -0.3, kind: 'motor', seed: 2 },
  { x: 30, z: 168, yaw: 0.9, kind: 'sail', seed: 3 },
  { x: 90, z: 180, yaw: -0.6, kind: 'motor', seed: 4 },
  { x: 140, z: 162, yaw: 0.2, kind: 'sail', seed: 5 },
  { x: -196, z: 34, yaw: 1.2, kind: 'sail', seed: 6 }, // off the Porto Lumen pier
  { x: -202, z: -12, yaw: -0.8, kind: 'motor', seed: 7 },
];

function buildBoat(bd, x, z, yaw, kind, seed) {
  bd.push(frame(x, -0.35, z, yaw, 0, 0, 1));
  const hullCol = kind === 'sail'
    ? [[0.90, 0.90, 0.92], [0.85, 0.80, 0.70]][seed % 2]
    : [[0.85, 0.30, 0.25], [0.20, 0.45, 0.75]][seed % 2];
  bd.setMat(MAT.PAINT).setColor(hullCol[0], hullCol[1], hullCol[2]);
  // Hull: side profile extruded across the beam (bow at +X).
  bd.extrude(
    [[2.6, 0.15], [2.2, 0.75], [0.5, 0.9], [-2.0, 0.9], [-2.6, 0.55], [-2.2, 0.1], [1.6, 0.05]],
    -0.85, 0.85,
  );
  bd.setMat(MAT.PLAIN).setColor(0.55, 0.42, 0.28);
  bd.quad([-1.9, 0.92, -0.7], [1.9, 0.92, -0.7], [1.9, 0.92, 0.7], [-1.9, 0.92, 0.7]); // deck
  if (kind === 'sail') {
    bd.setMat(MAT.METAL).setColor(0.70, 0.70, 0.72);
    bd.tube([0.3, 0.9, 0], [0.3, 6.2, 0], 0.06, 0.04, 6, true); // mast
    bd.tube([0.3, 1.6, 0], [-1.9, 1.6, 0], 0.05, 0.04, 5, true); // boom
    // Sails, double-sided (both faces drawn so they read from either side).
    bd.setMat(MAT.PLAIN).setColor(0.96, 0.94, 0.88);
    bd.tri3([0.35, 1.7, 0.02], [0.35, 5.9, 0.02], [-1.8, 1.7, 0.02]); // mainsail
    bd.tri3([0.35, 1.7, -0.02], [-1.8, 1.7, -0.02], [0.35, 5.9, -0.02]);
    bd.tri3([0.35, 5.9, 0.02], [0.35, 1.7, 0.02], [2.2, 1.0, 0.02]); // jib
    bd.tri3([0.35, 5.9, -0.02], [2.2, 1.0, -0.02], [0.35, 1.7, -0.02]);
  } else {
    bd.setMat(MAT.PLAIN).setColor(0.92, 0.92, 0.94);
    bd.box(-0.9, 0.9, -0.6, 0.9, 1.7, 0.6); // cabin
    bd.setMat(MAT.GLASS).setColor(0.55, 0.70, 0.78);
    bd.box(0.5, 1.1, -0.62, 0.9, 1.55, 0.62); // windshield
    bd.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
    bd.box(-2.6, 0.35, -0.3, -2.3, 0.9, 0.3); // outboard motor
  }
  bd.pop();
}

// --- beach props (sand-side dressing) ------------------------------------------
// Each prop owns its own footprint: nothing overlaps a palm trunk, a
// billboard post, the Ferris wheel, or another prop (placements are
// checked by the clearance probe). All colours are bright beach colours.

function buildBeachUmbrella(bd, x, z, color) {
  bd.setMat(MAT.PLAIN).setColor(0.85, 0.85, 0.85);
  bd.tube([x, 0.05, z], [x, 2.1, z], 0.05, 0.04, 6, true);
  // Canopy: a shallow cone (tube r 1.6 -> 0.05) + a top ball.
  bd.setColor(color[0], color[1], color[2]);
  bd.tube([x, 2.1, z], [x, 2.55, z], 1.6, 0.06, 10, false);
  bd.setColor(1.0, 1.0, 1.0);
  bd.blob(x, 2.6, z, 0.09, 0.09, 0.09, x * 3 + z);
}

function buildLoungeChair(bd, x, z, yaw, color, y) {
  bd.push(frame(x, y || 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(color[0], color[1], color[2]);
  bd.box(-0.9, 0.25, -0.35, 0.5, 0.38, 0.35); // seat
  bd.box(0.5, 0.25, -0.35, 0.95, 0.85, 0.35); // raised back
  bd.setColor(0.25, 0.25, 0.27);
  bd.box(-0.9, 0.05, -0.3, -0.8, 0.25, 0.3);
  bd.box(0.3, 0.05, -0.3, 0.4, 0.25, 0.3);
  bd.pop();
}

function buildTowel(bd, x, z, yaw, color) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(color[0], color[1], color[2]);
  bd.quad([-0.9, 0.06, -0.4], [0.9, 0.06, -0.4], [0.9, 0.06, 0.4], [-0.9, 0.06, 0.4]);
  bd.setColor(1.0, 1.0, 1.0);
  bd.quad([-0.9, 0.07, -0.4], [-0.5, 0.07, -0.4], [-0.5, 0.07, 0.4], [-0.9, 0.07, 0.4]);
  bd.pop();
}

function buildLifeguardTower(bd, x, z) {
  bd.setMat(MAT.PLAIN).setColor(0.95, 0.95, 0.95);
  for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    bd.tube([x + lx, 0.05, z + lz], [x + lx * 0.8, 3.4, z + lz * 0.8], 0.09, 0.07, 6, true);
  }
  bd.setColor(0.95, 0.30, 0.25);
  bd.box(x - 1.3, 3.4, z - 1.3, x + 1.3, 5.0, z + 1.3); // cabin
  bd.setMat(MAT.GLASS).setColor(0.55, 0.70, 0.78);
  bd.box(x - 1.0, 3.8, z + 1.32, x + 1.0, 4.6, z + 1.38); // front window
  bd.setMat(MAT.PLAIN).setColor(0.95, 0.30, 0.25);
  bd.box(x - 1.6, 5.0, z - 1.6, x + 1.6, 5.25, z + 1.6); // roof
  bd.setMat(MAT.METAL).setColor(0.75, 0.75, 0.78);
  bd.tube([x + 1.4, 5.25, z - 1.4], [x + 1.4, 6.6, z - 1.4], 0.04, 0.03, 5, true);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.25, 0.20);
  bd.quad([x + 1.4, 6.6, z - 1.4], [x + 2.1, 6.6, z - 1.4], [x + 2.1, 6.15, z - 1.4], [x + 1.4, 6.15, z - 1.4]); // flag
}

function buildVolleyballNet(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.75, 0.75, 0.78);
  bd.tube([-3, 0.05, 0], [-3, 2.4, 0], 0.06, 0.05, 6, true);
  bd.tube([3, 0.05, 0], [3, 2.4, 0], 0.06, 0.05, 6, true);
  bd.setMat(MAT.PLAIN).setColor(0.95, 0.95, 0.95);
  bd.box(-3, 1.7, -0.04, 3, 2.4, 0.04); // net band
  bd.setColor(0.20, 0.20, 0.22);
  bd.box(-3, 2.35, -0.05, 3, 2.42, 0.05); // top tape
  bd.pop();
}

function buildSurfboard(bd, x, z, yaw, color) {
  bd.push(frame(x, 0, z, yaw, 0.35, 0, 1)); // leaning back
  bd.setMat(MAT.PAINT).setColor(color[0], color[1], color[2]);
  bd.blob(0, 1.0, 0, 0.32, 1.0, 0.08, x * 7 + z);
  bd.setColor(1.0, 1.0, 1.0);
  bd.blob(0, 1.35, 0, 0.30, 0.28, 0.09, x * 7 + z + 1);
  bd.pop();
}

function buildBeachKiosk(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(0.95, 0.90, 0.75);
  bd.box(-1.7, 0.05, -1.2, 1.7, 2.3, 1.2);
  bd.setColor(0.20, 0.55, 0.65);
  bd.box(-1.7, 1.0, 1.2, 1.7, 1.15, 1.7); // counter shelf
  bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.30);
  bd.box(-1.2, 1.3, 1.22, 1.2, 2.1, 1.28); // lit serving hatch
  // Striped canopy.
  const stripes = [[0.95, 0.45, 0.15], [0.95, 0.95, 0.90]];
  for (let i = 0; i < 6; i++) {
    const c = stripes[i % 2];
    bd.setMat(MAT.PLAIN).setColor(c[0], c[1], c[2]);
    const sx0 = -2.0 + i * (4.0 / 6);
    bd.quad([sx0, 2.6, -1.5], [sx0 + 4.0 / 6, 2.6, -1.5], [sx0 + 4.0 / 6, 2.35, 1.6], [sx0, 2.35, 1.6]);
  }
  bd.pop();
}

function buildBench(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(0.45, 0.32, 0.20);
  bd.box(-0.9, 0.45, -0.25, 0.9, 0.55, 0.25); // seat
  bd.box(-0.9, 0.55, -0.25, 0.9, 1.05, -0.15); // back
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  bd.box(-0.8, 0.05, -0.2, -0.7, 0.45, 0.2);
  bd.box(0.7, 0.05, -0.2, 0.8, 0.45, 0.2);
  bd.pop();
}

function buildPlanter(bd, x, z) {
  bd.setMat(MAT.PLAIN).setColor(0.60, 0.42, 0.30);
  bd.box(x - 0.5, 0.05, z - 0.5, x + 0.5, 0.55, z + 0.5);
  bd.setMat(MAT.FOLIAGE).setColor(0.18, 0.48, 0.22);
  bd.blob(x, 0.85, z, 0.55, 0.45, 0.55, x * 11 + z);
  bd.setColor(0.95, 0.30, 0.35);
  bd.blob(x - 0.25, 1.05, z + 0.15, 0.12, 0.10, 0.12, x * 11 + z + 1);
  bd.blob(x + 0.28, 1.02, z - 0.18, 0.12, 0.10, 0.12, x * 11 + z + 2);
}

function buildBikeRack(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.55, 0.55, 0.58);
  for (const bx of [-0.9, 0, 0.9]) {
    bd.tube([bx, 0.05, -0.25], [bx, 0.85, -0.25], 0.04, 0.04, 5, true);
    bd.tube([bx, 0.05, 0.25], [bx, 0.85, 0.25], 0.04, 0.04, 5, true);
    bd.tube([bx, 0.85, -0.25], [bx, 0.85, 0.25], 0.04, 0.04, 5, true);
  }
  // Two parked bikes: frame tube + two disc wheels each.
  const bikeCols = [[0.85, 0.25, 0.20], [0.20, 0.50, 0.85]];
  [-0.9, 0.9].forEach((bx, i) => {
    bd.setColor(bikeCols[i][0], bikeCols[i][1], bikeCols[i][2]);
    bd.tube([bx - 0.45, 0.55, 0.35], [bx + 0.45, 0.55, 0.35], 0.04, 0.04, 5, true);
    bd.setColor(0.10, 0.10, 0.12);
    bd.disc([bx - 0.45, 0.35, 0.35], [1, 0, 0], 0.34, 12);
    bd.disc([bx + 0.45, 0.35, 0.35], [1, 0, 0], 0.34, 12);
  });
  bd.pop();
}

// --- roadside props (GTA-like street furniture) --------------------------------
// Every builder faces local +Z at yaw 0 (like buildBench): avenue props on
// the east sidewalk use yaw -PI/2 (face west, toward the road), street
// props on the south sidewalk use yaw PI (face north). Small props get no
// collider (like the hydrants); the big ones (newsstand, cart, bus stop)
// get one at the placement site.

// Parking meter: post + head + a green "time left" dot.
function buildParkingMeter(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.30, 0.32, 0.30);
  bd.tube([0, 0.05, 0], [0, 0.85, 0], 0.04, 0.035, 6, true);
  bd.setColor(0.45, 0.50, 0.45);
  bd.box(-0.09, 0.85, -0.06, 0.09, 1.10, 0.06);
  bd.setMat(MAT.EMIT).setColor(0.30, 1.0, 0.35);
  bd.disc([0, 1.02, 0.065], [0, 0, 1], 0.04, 8);
  bd.pop();
}

// Bus stop: shelter (posts + roof + back panel + bench) + a blue sign blade
// with a white disc. Footprint 2.5 x 0.9 — needs a collider.
function buildBusStop(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  bd.box(-1.10, 0.05, -0.35, -1.00, 2.30, -0.25);
  bd.box(1.00, 0.05, -0.35, 1.10, 2.30, -0.25);
  bd.setMat(MAT.PLAIN).setColor(0.20, 0.25, 0.35);
  bd.box(-1.25, 2.30, -0.45, 1.25, 2.38, 0.45); // roof
  bd.setColor(0.65, 0.75, 0.85);
  bd.box(-1.10, 0.90, -0.38, 1.10, 2.30, -0.32); // back panel
  bd.setColor(0.45, 0.32, 0.20);
  bd.box(-0.90, 0.45, -0.25, 0.90, 0.55, 0.15); // bench seat
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  bd.box(-0.80, 0.05, -0.20, -0.70, 0.45, 0.10);
  bd.box(0.70, 0.05, -0.20, 0.80, 0.45, 0.10);
  bd.tube([1.35, 0.05, 0.20], [1.35, 2.60, 0.20], 0.04, 0.04, 6, true);
  bd.setMat(MAT.PLAIN).setColor(0.15, 0.35, 0.75);
  bd.box(1.15, 2.30, 0.12, 1.55, 2.60, 0.28); // sign blade
  bd.setColor(0.95, 0.95, 0.95);
  bd.disc([1.35, 2.45, 0.29], [0, 0, 1], 0.09, 10);
  bd.pop();
}

// Street-name sign: pole + two crossed green blades (reads from any angle).
function buildStreetSign(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.35, 0.35, 0.37);
  bd.tube([0, 0.05, 0], [0, 2.60, 0], 0.05, 0.045, 6, true);
  bd.setMat(MAT.PLAIN).setColor(0.15, 0.45, 0.25);
  bd.box(-0.55, 2.35, -0.03, 0.55, 2.60, 0.03);
  bd.box(-0.03, 2.05, -0.45, 0.03, 2.30, 0.45);
  bd.pop();
}

// Newsstand: kiosk + red roof + colourful magazine fronts + a lit strip
// under the roof. Footprint 1.6 x 1.2 — needs a collider.
function buildNewsstand(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(0.92, 0.88, 0.78);
  bd.box(-0.80, 0.05, -0.60, 0.80, 1.10, 0.60);
  bd.setColor(0.45, 0.32, 0.20);
  bd.box(-0.85, 1.10, -0.65, 0.85, 1.16, 0.65); // counter
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  for (const sx of [-0.78, 0.78]) for (const sz of [-0.58, 0.58]) {
    bd.box(sx - 0.04, 1.16, sz - 0.04, sx + 0.04, 2.10, sz + 0.04);
  }
  bd.setMat(MAT.PLAIN).setColor(0.85, 0.20, 0.15);
  bd.box(-0.95, 2.10, -0.75, 0.95, 2.20, 0.75); // roof
  // Magazine fronts (bright quads on the +z face).
  const magCols = [[0.95, 0.25, 0.20], [0.20, 0.50, 0.90], [1.0, 0.80, 0.20], [0.25, 0.75, 0.40]];
  magCols.forEach((c, i) => {
    const mx = -0.60 + i * 0.40;
    bd.setColor(c[0], c[1], c[2]);
    bd.quad([mx - 0.16, 0.60, 0.61], [mx + 0.16, 0.60, 0.61], [mx + 0.16, 1.00, 0.61], [mx - 0.16, 1.00, 0.61]);
  });
  bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.50);
  bd.box(-0.85, 2.02, 0.60, 0.85, 2.10, 0.68); // lit strip
  bd.pop();
}

// Street-vendor cart: body + wheels + striped canopy + a glowing bulb.
// Footprint 1.4 x 0.9 — needs a collider.
function buildVendorCart(bd, x, z, yaw, seed) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(0.90, 0.55, 0.20);
  bd.box(-0.70, 0.45, -0.45, 0.70, 0.95, 0.45); // body
  bd.setMat(MAT.PLAIN).setColor(0.10, 0.10, 0.12);
  bd.disc([-0.72, 0.28, 0], [-1, 0, 0], 0.28, 10);
  bd.disc([0.72, 0.28, 0], [1, 0, 0], 0.28, 10);
  bd.setMat(MAT.METAL).setColor(0.30, 0.30, 0.32);
  bd.box(-0.65, 0.05, -0.40, -0.55, 0.45, -0.30);
  bd.box(0.55, 0.05, -0.40, 0.65, 0.45, -0.30);
  for (const sx of [-0.65, 0.65]) for (const sz of [-0.40, 0.40]) {
    bd.tube([sx, 0.95, sz], [sx, 1.90, sz], 0.03, 0.03, 5, true);
  }
  bd.setMat(MAT.PLAIN).setColor(0.95, 0.45, 0.15);
  bd.box(-0.80, 1.90, -0.55, 0.80, 1.98, 0.55); // canopy
  bd.setColor(0.95, 0.95, 0.95);
  bd.box(-0.80, 1.90, -0.12, 0.80, 1.99, 0.12); // white stripe
  // Goods on the counter: fruit boxes.
  bd.setColor(0.95, 0.25, 0.20);
  bd.box(-0.55, 0.95, -0.20, -0.15, 1.12, 0.20);
  bd.setColor(1.0, 0.80, 0.20);
  bd.box(-0.05, 0.95, -0.20, 0.35, 1.12, 0.20);
  bd.setColor(0.25, 0.75, 0.40);
  bd.box(0.40, 0.95, -0.20, 0.60, 1.12, 0.20);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.45);
  bd.blob(0, 1.80, 0, 0.07, 0.09, 0.07, seed || 1); // hanging bulb
  bd.pop();
}

// Road-work barrier: sawhorse with an orange/white striped plank.
function buildBarrier(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.30, 0.30, 0.32);
  bd.box(-0.75, 0.05, -0.15, -0.65, 0.70, 0.15);
  bd.box(0.65, 0.05, -0.15, 0.75, 0.70, 0.15);
  bd.box(-0.85, 0.02, -0.25, -0.55, 0.08, 0.25);
  bd.box(0.55, 0.02, -0.25, 0.85, 0.08, 0.25);
  const stripeCols = [[0.95, 0.45, 0.10], [0.95, 0.95, 0.95], [0.95, 0.45, 0.10], [0.95, 0.95, 0.95]];
  stripeCols.forEach((c, i) => {
    const sx0 = -0.85 + i * 0.425;
    bd.setMat(MAT.PLAIN).setColor(c[0], c[1], c[2]);
    bd.box(sx0, 0.70, -0.06, sx0 + 0.425, 0.95, 0.06);
  });
  bd.pop();
}

// Mailbox: post + blue box + domed top + slot.
function buildMailbox(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  bd.box(-0.06, 0.05, -0.06, 0.06, 0.50, 0.06);
  bd.setMat(MAT.PAINT).setColor(0.15, 0.30, 0.65);
  bd.box(-0.25, 0.50, -0.18, 0.25, 1.00, 0.18);
  bd.blob(0, 1.02, 0, 0.25, 0.12, 0.18, x * 3 + z);
  bd.setMat(MAT.PLAIN).setColor(0.08, 0.08, 0.10);
  bd.box(-0.15, 0.85, 0.18, 0.15, 0.90, 0.20);
  bd.pop();
}


function buildTrashCan(bd, x, z) {
  bd.setMat(MAT.METAL).setColor(0.30, 0.45, 0.35);
  bd.tube([x, 0.05, z], [x, 0.85, z], 0.30, 0.26, 10, true);
  bd.setMat(MAT.PLAIN).setColor(0.20, 0.20, 0.22);
  bd.disc([x, 0.86, z], [0, 1, 0], 0.28, 10);
}

// Fire hydrant: red body + domed cap + side nozzles, on the sidewalk edge.
function buildHydrant(bd, x, z) {
  bd.setMat(MAT.PAINT).setColor(0.85, 0.15, 0.12);
  bd.tube([x, 0.15, z], [x, 0.75, z], 0.16, 0.14, 10, true);
  bd.blob(x, 0.82, z, 0.15, 0.12, 0.15, x * 3 + z);
  bd.setMat(MAT.METAL).setColor(0.75, 0.75, 0.78);
  bd.tube([x - 0.2, 0.55, z], [x + 0.2, 0.55, z], 0.06, 0.06, 6, true);
  bd.disc([x + 0.21, 0.55, z], [1, 0, 0], 0.08, 8);
  bd.disc([x - 0.21, 0.55, z], [-1, 0, 0], 0.08, 8);
}

// String lights between two palm trunks: a sagging line + glowing bulbs.
function buildStringLights(bd, x0, z0, x1, z1) {
  bd.setMat(MAT.PLAIN).setColor(0.15, 0.15, 0.17);
  const sag = (t) => 4.6 - Math.sin(Math.PI * t) * 0.7;
  let px = x0, py = 4.6, pz = z0;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const nx = x0 + (x1 - x0) * t, ny = sag(t), nz = z0 + (z1 - z0) * t;
    bd.tube([px, py, pz], [nx, ny, nz], 0.02, 0.02, 4, true);
    px = nx; py = ny; pz = nz;
  }
  bd.setMat(MAT.EMIT);
  const bulbCols = [[1.0, 0.85, 0.30], [1.0, 0.45, 0.35], [0.45, 0.85, 0.55], [0.45, 0.65, 1.0]];
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const c = bulbCols[i % 4];
    bd.setColor(c[0], c[1], c[2]);
    bd.blob(x0 + (x1 - x0) * t, sag(t) - 0.12, z0 + (z1 - z0) * t, 0.09, 0.11, 0.09, i * 3 + x0);
  }
}

// --- Rambla Park ---------------------------------------------------------------
// The green pocket park on the beachfront block (x 30–54, z 57–93), on the
// lot where the second building of that block would have stood. Exported
// so the minimap + full map draw it as green.
export const PARK = { x0: 30, x1: 54, z0: 57, z1: 93, name: 'Rambla Park' };

function buildPark(bd, poolBd) {
  // Grass + paths (light strips + a plaza disc around the fountain).
  bd.setMat(MAT.PLAIN).setSeed(0).setColor(0.22, 0.48, 0.22);
  bd.quad([PARK.x0, 0.04, PARK.z0], [PARK.x1, 0.04, PARK.z0], [PARK.x1, 0.04, PARK.z1], [PARK.x0, 0.04, PARK.z1]);
  bd.setColor(0.78, 0.72, 0.60);
  bd.quad([PARK.x0, 0.05, 73], [PARK.x1, 0.05, 73], [PARK.x1, 0.05, 75.5], [PARK.x0, 0.05, 75.5]);
  bd.quad([41, 0.05, PARK.z0], [43.5, 0.05, PARK.z0], [43.5, 0.05, PARK.z1], [41, 0.05, PARK.z1]);
  bd.disc([42, 0.05, 84], [0, 1, 0], 4.2, 20);
  // Fountain (basin + water + centre column + top bowl), near the south
  // edge so the beachfront chase camera reads it.
  bd.setColor(0.70, 0.68, 0.62);
  bd.tube([42, 0.05, 84], [42, 0.75, 84], 2.2, 2.2, 16, true);
  bd.setMat(MAT.GLASS).setColor(0.35, 0.60, 0.75);
  bd.disc([42, 0.72, 84], [0, 1, 0], 2.0, 16);
  bd.setMat(MAT.PLAIN).setColor(0.70, 0.68, 0.62);
  bd.tube([42, 0.7, 84], [42, 2.4, 84], 0.28, 0.22, 8, true);
  bd.disc([42, 2.4, 84], [0, 1, 0], 0.85, 12);
  bd.setMat(MAT.EMIT).setColor(0.65, 0.85, 1.0);
  bd.blob(42, 2.6, 84, 0.22, 0.3, 0.22, 77);
  // Statue: pedestal + a bronze abstract figure.
  bd.setMat(MAT.PLAIN).setColor(0.60, 0.58, 0.52);
  bd.box(36.4, 0.05, 69.4, 37.6, 1.1, 70.6);
  bd.setColor(0.55, 0.42, 0.22);
  bd.tube([37, 1.1, 70], [37, 2.6, 70], 0.28, 0.18, 8, true);
  bd.blob(37, 2.9, 70, 0.32, 0.38, 0.32, 78);
  // Shade trees (5), clear of the paths and the fountain.
  buildShadeTree(bd, 32, 62, 501);
  buildShadeTree(bd, 50, 66, 502);
  buildShadeTree(bd, 33, 88, 503);
  buildShadeTree(bd, 50, 86, 504);
  buildShadeTree(bd, 45, 72, 505);
  // Benches facing the fountain / paths.
  buildBench(bd, 38, 82, -0.6);
  buildBench(bd, 46, 82, 0.6);
  buildBench(bd, 36, 76, Math.PI / 2);
  buildBench(bd, 48, 76, Math.PI / 2);
  // Flower beds: soil quad + coloured blobs.
  const bedCols = [[0.95, 0.30, 0.35], [1.0, 0.80, 0.25], [0.85, 0.45, 0.85], [1.0, 1.0, 1.0]];
  for (const [bx, bz] of [[34, 78], [50, 78], [36, 88], [48, 64]]) {
    bd.setMat(MAT.PLAIN).setColor(0.35, 0.25, 0.15);
    bd.quad([bx - 0.9, 0.06, bz - 0.9], [bx + 0.9, 0.06, bz - 0.9], [bx + 0.9, 0.06, bz + 0.9], [bx - 0.9, 0.06, bz + 0.9]);
    for (let i = 0; i < 5; i++) {
      const c = bedCols[i % 4];
      bd.setColor(c[0], c[1], c[2]);
      const ox = (i % 3 - 1) * 0.55, oz = (Math.floor(i / 3) - 0.5) * 0.8;
      bd.blob(bx + ox, 0.22, bz + oz, 0.14, 0.12, 0.14, bx * 5 + bz + i);
    }
  }
  // Lamp posts + swings.
  buildStreetlight(bd, 32, 76, true);
  buildStreetlight(bd, 52, 76, true);
  buildStreetlight(bd, 42, 60, false);
  if (poolBd) {
    poolBd.setMat(MAT.EMIT).setColor(1.0, 0.72, 0.35);
    poolBd.disc([32, 0.17, 74.7], [0, 1, 0], 2.4, 16);
    poolBd.disc([52, 0.17, 74.7], [0, 1, 0], 2.4, 16);
    poolBd.disc([42, 0.17, 61.3], [0, 1, 0], 2.4, 16);
  }
  bd.setMat(MAT.METAL).setColor(0.35, 0.35, 0.38);
  bd.tube([45.5, 0.05, 62], [45.5, 2.6, 62], 0.06, 0.05, 6, true);
  bd.tube([48.5, 0.05, 62], [48.5, 2.6, 62], 0.06, 0.05, 6, true);
  bd.tube([45.5, 2.6, 62], [48.5, 2.6, 62], 0.05, 0.05, 6, true);
  bd.setMat(MAT.PLAIN).setColor(0.85, 0.30, 0.25);
  bd.box(46.2, 0.7, 61.8, 46.8, 0.78, 62.2);
  bd.box(47.4, 0.7, 61.8, 48.0, 0.78, 62.2);
  bd.setMat(MAT.METAL).setColor(0.6, 0.6, 0.62);
  bd.tube([46.5, 0.78, 62], [46.5, 2.6, 62], 0.02, 0.02, 4, true);
  bd.tube([47.7, 0.78, 62], [47.7, 2.6, 62], 0.02, 0.02, 4, true);
}

// --- the Ferris wheel (dynamic: rotates; built separately) -------------------
export function buildFerrisWheel() {
  const bd = new MeshBuilder();
  // Support towers (static part is baked into the wheel mesh; the whole mesh
  // rotates only around the axle via a transform in game.js — towers are
  // separate: they live in the static world. This mesh is ONLY the wheel.)
  const R = 11;
  bd.setMat(MAT.METAL).setColor(0.85, 0.85, 0.88);
  // Rim: 24 tube segments.
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU;
    bd.tube(
      [Math.cos(a0) * R, Math.sin(a0) * R, 0],
      [Math.cos(a1) * R, Math.sin(a1) * R, 0],
      0.12, 0.12, 5, true,
    );
  }
  // Spokes.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    bd.tube([0, 0, 0], [Math.cos(a) * R, Math.sin(a) * R, 0], 0.09, 0.09, 5, true);
  }
  // Hub.
  bd.tube([0, 0, -0.6], [0, 0, 0.6], 0.5, 0.5, 10, true);
  // Cabins: 8 gondolas in bright colours, hanging from the rim.
  const cols = [[0.9, 0.3, 0.25], [0.25, 0.6, 0.9], [0.95, 0.75, 0.2], [0.3, 0.8, 0.4]];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const px = Math.cos(a) * R, py = Math.sin(a) * R;
    const c = cols[i % 4];
    bd.setMat(MAT.PAINT).setColor(c[0], c[1], c[2]);
    bd.box(px - 0.9, py - 1.9, -0.7, px + 0.9, py - 0.7, 0.7);
    bd.setMat(MAT.GLASS).setColor(0.55, 0.70, 0.78);
    bd.box(px - 0.7, py - 1.7, -0.75, px + 0.7, py - 0.9, 0.75);
    bd.setMat(MAT.METAL).setColor(0.7, 0.7, 0.72);
    bd.tube([px, py, 0], [px, py - 0.7, 0], 0.06, 0.06, 5, true);
  }
  // Rim lights (emissive dots).
  bd.setMat(MAT.EMIT).setColor(1.0, 0.8, 0.4);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    bd.blob(Math.cos(a) * R, Math.sin(a) * R, 0, 0.16, 0.16, 0.16, i + 1);
  }
  return bd.build();
}

// Mission beacon: vertical light pillar + ground ring, positioned at runtime.
export function buildBeacon() {
  const bd = new MeshBuilder();
  bd.setMat(MAT.EMIT).setColor(1.0, 0.78, 0.25);
  bd.tube([0, 0, 0], [0, 14, 0], 0.35, 0.12, 8, false);
  bd.disc([0, 0.06, 0], [0, 1, 0], 2.2, 24);
  bd.setMat(MAT.PLAIN).setColor(1.0, 0.78, 0.25);
  bd.tube([2.2, 0.06, 0], [2.2, 0.35, 0], 0.05, 0.05, 5, true);
  return bd.build();
}

// Postcard marker: a glowing postcard on a post.
export function buildPostcardMarker() {
  const bd = new MeshBuilder();
  bd.setMat(MAT.METAL).setColor(0.3, 0.3, 0.32);
  bd.tube([0, 0, 0], [0, 1.2, 0], 0.05, 0.05, 6, true);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.45);
  bd.box(-0.45, 1.2, -0.03, 0.45, 1.8, 0.03);
  bd.setMat(MAT.PLAIN).setColor(0.95, 0.95, 0.95);
  bd.box(-0.38, 1.28, -0.05, 0.38, 1.55, -0.03);
  return bd.build();
}

// --- city generation ----------------------------------------------------------
export function buildWorld() {
  const chunks = new Chunked();
  const bd = chunks.b;
  const colliders = [];
  const rng = rng32(20261118);
  const puddleBd = new MeshBuilder();
  const poolBd = new MeshBuilder(); // streetlight pools (faded in at night)

  // Ground: mainland slab + island + beach sand.
  bd.setMat(MAT.PLAIN).setSeed(0).setColor(0.42, 0.44, 0.36);
  bd.quad([CITY.x0, 0, CITY.z0], [CITY.x1, 0, CITY.z0], [CITY.x1, 0, BEACH_Z], [CITY.x0, 0, BEACH_Z]);
  bd.setColor(0.85, 0.78, 0.58); // sand
  bd.quad([CITY.x0, 0.01, BEACH_Z], [CITY.x1, 0.01, BEACH_Z], [CITY.x1, 0.01, WATER_Z], [CITY.x0, 0.01, WATER_Z]);
  bd.setColor(0.45, 0.48, 0.35); // island ground (rectangular slab)
  bd.quad(
    [ISLAND.cx - ISLAND.rx, 0.02, ISLAND.cz - ISLAND.rz],
    [ISLAND.cx + ISLAND.rx, 0.02, ISLAND.cz - ISLAND.rz],
    [ISLAND.cx + ISLAND.rx, 0.02, ISLAND.cz + ISLAND.rz],
    [ISLAND.cx - ISLAND.rx, 0.02, ISLAND.cz + ISLAND.rz],
  );
  bd.setColor(0.85, 0.78, 0.58);
  bd.quad(
    [ISLAND.cx - ISLAND.rx, 0.03, ISLAND.cz + ISLAND.rz - 6],
    [ISLAND.cx + ISLAND.rx, 0.03, ISLAND.cz + ISLAND.rz - 6],
    [ISLAND.cx + ISLAND.rx, 0.03, ISLAND.cz + ISLAND.rz],
    [ISLAND.cx - ISLAND.rx, 0.03, ISLAND.cz + ISLAND.rz],
  );

  // Water: one big glass plane under everything (y = -0.4).
  bd.setMat(MAT.GLASS).setColor(0.15, 0.35, 0.55);
  bd.quad([-400, -0.4, -400], [400, -0.4, -400], [400, -0.4, 400], [-400, -0.4, 400]);

  // Roads: avenues + streets + causeway, marked wettable (seed 901).
  bd.setMat(MAT.PLAIN).setSeed(WET_SEED).setColor(0.22, 0.22, 0.24);
  for (const x of AVENUES) {
    bd.quad([x - ROAD_W / 2, 0.02, CITY.z0], [x + ROAD_W / 2, 0.02, CITY.z0], [x + ROAD_W / 2, 0.02, BEACH_Z], [x - ROAD_W / 2, 0.02, BEACH_Z]);
  }
  for (const z of STREETS) {
    bd.quad([CITY.x0, 0.02, z - ROAD_W / 2], [CITY.x1, 0.02, z - ROAD_W / 2], [CITY.x1, 0.02, z + ROAD_W / 2], [CITY.x0, 0.02, z + ROAD_W / 2]);
  }
  // Causeway to Isla Verde (x = 0, z 100..160) + island loop road.
  bd.quad([-4, 0.05, BEACH_Z], [4, 0.05, BEACH_Z], [4, 0.05, ISLAND.cz - ISLAND.rz], [-4, 0.05, ISLAND.cz - ISLAND.rz]);
  bd.quad([ISLAND.cx - ISLAND.rx + 8, 0.05, ISLAND.cz - 4], [ISLAND.cx + ISLAND.rx - 8, 0.05, ISLAND.cz - 4], [ISLAND.cx + ISLAND.rx - 8, 0.05, ISLAND.cz + 4], [ISLAND.cx - ISLAND.rx + 8, 0.05, ISLAND.cz + 4]);
  // Causeway rails.
  bd.setMat(MAT.METAL).setSeed(0).setColor(0.6, 0.6, 0.62);
  bd.tube([-4.2, 0.15, BEACH_Z], [-4.2, 0.15, ISLAND.cz - ISLAND.rz], 0.06, 0.06, 5, true);
  bd.tube([4.2, 0.15, BEACH_Z], [4.2, 0.15, ISLAND.cz - ISLAND.rz], 0.06, 0.06, 5, true);

  // Centre dashes + crosswalks.
  bd.setMat(MAT.PLAIN).setSeed(0).setColor(0.85, 0.82, 0.70);
  for (const x of AVENUES) {
    for (let z = CITY.z0 + 4; z < BEACH_Z - 4; z += 6) {
      bd.quad([x - 0.12, 0.03, z], [x + 0.12, 0.03, z], [x + 0.12, 0.03, z + 2.4], [x - 0.12, 0.03, z + 2.4]);
    }
  }
  for (const z of STREETS) {
    for (let x = CITY.x0 + 4; x < CITY.x1 - 4; x += 6) {
      bd.quad([x, 0.03, z - 0.12], [x + 2.4, 0.03, z - 0.12], [x + 2.4, 0.03, z + 0.12], [x, 0.03, z + 0.12]);
    }
  }
  bd.setColor(0.9, 0.9, 0.88);
  for (const x of AVENUES) {
    for (const z of STREETS) {
      for (let i = -3; i <= 3; i++) {
        bd.quad([x + i - 0.3, 0.03, z - ROAD_W / 2 - 1.5], [x + i + 0.3, 0.03, z - ROAD_W / 2 - 1.5], [x + i + 0.3, 0.03, z - ROAD_W / 2 - 0.5], [x + i - 0.3, 0.03, z - ROAD_W / 2 - 0.5]);
      }
    }
  }

  // Sidewalks: strips along every road.
  bd.setColor(0.62, 0.60, 0.55);
  for (const x of AVENUES) {
    bd.box(x - ROAD_W / 2 - 3, 0, CITY.z0, x - ROAD_W / 2, 0.15, BEACH_Z);
    bd.box(x + ROAD_W / 2, 0, CITY.z0, x + ROAD_W / 2 + 3, 0.15, BEACH_Z);
  }
  for (const z of STREETS) {
    bd.box(CITY.x0, 0, z - ROAD_W / 2 - 3, CITY.x1, 0.15, z - ROAD_W / 2);
    bd.box(CITY.x0, 0, z + ROAD_W / 2, CITY.x1, 0.15, z + ROAD_W / 2 + 3);
  }

  // Buildings: one or two per block, from the district table.
  const blockXs = [-175, -120, -60, 0, 60, 120, 175];
  const blockZs = [-155, -100, -50, 0, 50, 100];
  let seedCounter = 3;
  const poiSpots = Object.values(POI);
  const nearPoi = (x, z) => poiSpots.some((p) => Math.abs(p.x - x) < 18 && Math.abs(p.z - z) < 18);
  for (let bi = 0; bi < blockXs.length - 1; bi++) {
    for (let bj = 0; bj < blockZs.length - 1; bj++) {
      const bx0 = blockXs[bi] + 7, bx1 = blockXs[bi + 1] - 7;
      const bz0 = blockZs[bj] + 7, bz1 = blockZs[bj + 1] - 7;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      if (nearPoi(cx, cz)) continue; // POI buildings are placed by hand below
      const dName = districtAt(cx, cz);
      const d = DISTRICTS.find((dd) => dd.name === dName) || DISTRICTS[1];
      const w = bx1 - bx0, dep = bz1 - bz0;
      const nB = w > 40 ? 2 : 1;
      for (let k = 0; k < nB; k++) {
        // Rambla Park takes the second lot of the beachfront block
        // (x 0–60, z 50–100): no building here, the park is built below.
        if (bi === 3 && bj === 4 && k === 1) continue;
        const fx0 = nB === 1 ? bx0 + 2 : bx0 + 2 + k * (w / 2);
        const fx1 = nB === 1 ? bx1 - 2 : bx0 - 2 + (k + 1) * (w / 2);
        // Skyline towers: a few tall landmarks so the skyline reads
        // varied from the beachfront and the title orbit — never a flat
        // row of same-height boxes. (The palette rng() is still drawn so
        // the deterministic stream stays identical for other buildings.)
        let h = d.hMin + rng() * (d.hMax - d.hMin);
        let landmark = null;
        let towerCol = null;
        if (bi === 4 && bj === 4 && k === 0) { h = 30; landmark = 'hotel'; towerCol = [0.45, 0.75, 0.78]; }
        else if (bi === 2 && bj === 4 && k === 0) { h = 26; towerCol = [0.90, 0.60, 0.65]; }
        else if (bi === 5 && bj === 3 && k === 0) { h = 28; towerCol = [0.55, 0.65, 0.85]; landmark = 'helipad'; }
        else if (bi === 1 && bj === 3 && k === 1) { h = 24; towerCol = [0.85, 0.75, 0.45]; }
        const floors = Math.max(2, Math.round(h / 2.6));
        const cols = Math.max(3, Math.round((fx1 - fx0) / 2.4));
        const palCol = d.palette[Math.floor(rng() * d.palette.length)];
        const col = towerCol || palCol;
        const b = {
          x0: fx0, x1: fx1, z0: bz0 + 2, z1: bz1 - 2, h, floors, cols,
          style: d.style, seed: seedCounter++, color: col,
          // The helipad tower always gets a flat roof (the rng() is still
          // drawn so the deterministic stream stays identical).
          roof: d.style === 0 && rng() > 0.5 && landmark !== 'helipad' ? 'hip' : 'flat',
          landmark, cafe: bj === 4 && k === 0,
        };
        buildBuilding(bd, b);
        colliders.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
        chunks.flushIfNearLimit();
      }
      // A shade tree or two per block — never inside Rambla Park (it has
      // its own trees; a random one could land on the fountain or a path).
      if (rng() > 0.3 && !(bi === 3 && bj === 4)) {
        buildShadeTree(bd, bx0 + 4 + rng() * (w - 8), bz0 + 4 + rng() * (dep - 8), seedCounter++);
        chunks.flushIfNearLimit();
      }
    }
  }

  // Hand-placed POI buildings (shops the player enters).
  const poiBuildings = [
    { poi: POI.garage, w: 22, d: 14, h: 7, style: 2, color: [0.78, 0.70, 0.55] },
    { poi: POI.pawn, w: 14, d: 10, h: 8, style: 2, color: [0.72, 0.62, 0.48] },
    { poi: POI.gunshop, w: 16, d: 11, h: 8, style: 2, color: [0.60, 0.58, 0.55] },
    { poi: POI.safehouse, w: 16, d: 12, h: 12, style: 0, color: [0.85, 0.78, 0.62] },
    { poi: POI.vireoHQ, w: 30, d: 18, h: 14, style: 1, color: [0.55, 0.55, 0.58] },
  ];
  for (const pb of poiBuildings) {
    const b = {
      x0: pb.poi.x - pb.w / 2, x1: pb.poi.x + pb.w / 2,
      z0: pb.poi.z - pb.d / 2, z1: pb.poi.z + pb.d / 2,
      h: pb.h, floors: Math.max(2, Math.round(pb.h / 3)),
      cols: Math.max(3, Math.round(pb.w / 3)),
      style: pb.style, seed: seedCounter++, color: pb.color, roof: 'flat',
    };
    buildBuilding(bd, b);
    colliders.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
    chunks.flushIfNearLimit();
  }

  // Garage interior (the enterable interior): an open-front room attached to
  // Mara's Garage — floor, back wall, a lift, tool benches, tyre stacks.
  // The garage building above sits behind it; the interior faces the street.
  {
    const g = POI.garage;
    const ix0 = g.x - 9, ix1 = g.x + 9, iz0 = g.z + 7, iz1 = g.z + 13;
    bd.setMat(MAT.PLAIN).setSeed(0).setColor(0.35, 0.35, 0.37);
    bd.quad([ix0, 0.05, iz0], [ix1, 0.05, iz0], [ix1, 0.05, iz1], [ix0, 0.05, iz1]); // floor
    bd.setColor(0.55, 0.52, 0.48);
    bd.quad([ix0, 0, iz1], [ix1, 0, iz1], [ix1, 5, iz1], [ix0, 5, iz1]); // back wall
    // Street face of the garage (the HQ's front, z = 38): a lit sign band,
    // a wide garage door and two lit windows — the wall the ending shot
    // frames, so it must read as Mara's Garage, not a blank slab.
    bd.setMat(MAT.EMIT).setColor(0.15, 0.45, 0.95);
    bd.quad([ix0 + 1, 4.15, iz1 + 0.08], [ix1 - 1, 4.15, iz1 + 0.08], [ix1 - 1, 4.9, iz1 + 0.08], [ix0 + 1, 4.9, iz1 + 0.08]);
    bd.setColor(1.0, 0.85, 0.25);
    bd.disc([(ix0 + ix1) / 2, 4.52, iz1 + 0.12], [0, 0, 1], 0.28, 12); // headlamp dot
    bd.quad([ix0 + 3, 4.4, iz1 + 0.12], [ix0 + 8, 4.4, iz1 + 0.12], [ix0 + 8, 4.65, iz1 + 0.12], [ix0 + 3, 4.65, iz1 + 0.12]);
    bd.quad([ix1 - 8, 4.4, iz1 + 0.12], [ix1 - 3, 4.4, iz1 + 0.12], [ix1 - 3, 4.65, iz1 + 0.12], [ix1 - 8, 4.65, iz1 + 0.12]);
    // Garage door: dark recessed panel + slats.
    bd.setMat(MAT.PLAIN).setColor(0.16, 0.16, 0.18);
    bd.quad([g.x - 4, 0.1, iz1 + 0.06], [g.x + 4, 0.1, iz1 + 0.06], [g.x + 4, 3.4, iz1 + 0.06], [g.x - 4, 3.4, iz1 + 0.06]);
    bd.setMat(MAT.METAL).setColor(0.45, 0.45, 0.48);
    for (let sy = 0.8; sy < 3.4; sy += 0.65) {
      bd.quad([g.x - 4, sy, iz1 + 0.1], [g.x + 4, sy, iz1 + 0.1], [g.x + 4, sy + 0.08, iz1 + 0.1], [g.x - 4, sy + 0.08, iz1 + 0.1]);
    }
    // Lit windows flanking the door.
    bd.setMat(MAT.EMIT).setColor(1.0, 0.80, 0.45);
    bd.quad([ix0 + 1, 1.2, iz1 + 0.06], [ix0 + 4, 1.2, iz1 + 0.06], [ix0 + 4, 2.8, iz1 + 0.06], [ix0 + 1, 2.8, iz1 + 0.06]);
    bd.quad([ix1 - 4, 1.2, iz1 + 0.06], [ix1 - 1, 1.2, iz1 + 0.06], [ix1 - 1, 2.8, iz1 + 0.06], [ix1 - 4, 2.8, iz1 + 0.06]);
    bd.quad([ix0, 0, iz0], [ix0, 0, iz1], [ix0, 5, iz1], [ix0, 5, iz0]); // side wall
    bd.quad([ix1, 0, iz1], [ix1, 0, iz0], [ix1, 5, iz0], [ix1, 5, iz1]); // side wall
    bd.quad([ix0, 5, iz0], [ix1, 5, iz0], [ix1, 5, iz1], [ix0, 5, iz1]); // ceiling
    // Car lift (two posts + arms).
    bd.setMat(MAT.METAL).setColor(0.75, 0.55, 0.15);
    bd.box(g.x - 1.6, 0.05, g.z + 9.4, g.x - 1.2, 2.2, g.z + 9.8);
    bd.box(g.x + 1.2, 0.05, g.z + 9.4, g.x + 1.6, 2.2, g.z + 9.8);
    bd.box(g.x - 1.6, 0.9, g.z + 9.4, g.x + 1.6, 1.05, g.z + 9.8);
    // Tool bench + tyre stack + hanging lamp.
    bd.setMat(MAT.PLAIN).setColor(0.40, 0.28, 0.18);
    bd.box(ix0 + 1, 0.05, iz1 - 1.4, ix0 + 5, 1.0, iz1 - 0.4);
    bd.setMat(MAT.PLAIN).setColor(0.08, 0.08, 0.09);
    for (let i = 0; i < 3; i++) {
      bd.tube([ix1 - 2, 0.25 + i * 0.45, iz1 - 1.2], [ix1 - 2, 0.45 + i * 0.45, iz1 - 1.2], 0.45, 0.45, 12, true);
    }
    bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.55);
    bd.disc([g.x, 4.9, g.z + 10], [0, -1, 0], 0.5, 12);
    colliders.push({ x0: ix0, z0: iz1 - 0.3, x1: ix1, z1: iz1 + 0.3 }); // back wall only
  }

  // Lighthouse on Isla Verde.
  {
    const L = POI.lighthouse;
    bd.setMat(MAT.PLAIN).setColor(0.92, 0.90, 0.85);
    bd.tube([L.x, 0, L.z], [L.x, 12, L.z], 2.2, 1.5, 12, false);
    bd.setColor(0.85, 0.25, 0.20);
    bd.tube([L.x, 4, L.z], [L.x, 6, L.z], 1.95, 1.85, 12, false);
    bd.tube([L.x, 9, L.z], [L.x, 11, L.z], 1.65, 1.55, 12, false);
    bd.setMat(MAT.METAL).setColor(0.2, 0.2, 0.22);
    bd.tube([L.x, 12, L.z], [L.x, 13.6, L.z], 1.4, 1.4, 12, true);
    bd.setMat(MAT.EMIT).setColor(1.0, 0.95, 0.7);
    bd.blob(L.x, 13.2, L.z, 0.9, 0.9, 0.9, 42);
    colliders.push({ x0: L.x - 2.4, z0: L.z - 2.4, x1: L.x + 2.4, z1: L.z + 2.4 });
  }

  // Ferris wheel support towers (the wheel itself is dynamic, built separately).
  {
    const F = POI.ferris;
    bd.setMat(MAT.METAL).setColor(0.35, 0.35, 0.38);
    bd.tube([F.x - 3.5, 0, F.z], [F.x, 12.5, F.z], 0.25, 0.18, 6, true);
    bd.tube([F.x + 3.5, 0, F.z], [F.x, 12.5, F.z], 0.25, 0.18, 6, true);
    bd.tube([F.x, 12.5, F.z - 1.2], [F.x, 12.5, F.z + 1.2], 0.3, 0.3, 8, true);
    bd.setMat(MAT.PLAIN).setColor(0.5, 0.5, 0.52);
    bd.box(F.x - 6, 0, F.z - 2, F.x + 6, 0.4, F.z + 2);
    colliders.push({ x0: F.x - 4, z0: F.z - 1, x1: F.x + 4, z1: F.z + 1 });
  }

  // Porto Lumen pier: wooden deck + posts + crates.
  {
    const P = POI.pier;
    bd.setMat(MAT.PLAIN).setColor(0.45, 0.35, 0.22);
    bd.box(P.x - 22, -0.1, P.z - 3, P.x + 8, 0.35, P.z + 3);
    for (let x = P.x - 20; x < P.x + 8; x += 5) {
      bd.tube([x, -0.5, P.z - 2.5], [x, 0.35, P.z - 2.5], 0.18, 0.18, 6, true);
      bd.tube([x, -0.5, P.z + 2.5], [x, 0.35, P.z + 2.5], 0.18, 0.18, 6, true);
    }
    bd.setColor(0.55, 0.42, 0.25);
    bd.box(P.x - 18, 0.35, P.z - 1, P.x - 16, 1.6, P.z + 1);
    bd.box(P.x - 14, 0.35, P.z + 0.5, P.x - 12.5, 1.4, P.z + 2);
  }

  // Palms: DENSE beachfront rows framing the z=100 beach road on both
  // sides (tall, staggered, like a real palm-lined strand) + avenue
  // lines + island. The beachfront is the cover shot's backdrop, so it
  // reads lush from the chase camera, not a sparse dotted line.
  const palmSpots = [];
  // North sidewalk row (tall, city side), step 9.
  for (let x = -162; x <= 162; x += 9) palmSpots.push([x, 94, 5 + (x % 7), 1.15]);
  // Sand-edge row (tall, beach side), offset half a step, step 9.
  for (let x = -158; x <= 162; x += 9) {
    if (Math.abs(x) < 7) continue; // keep the causeway mouth clear
    palmSpots.push([x, 106, 11 + (x % 5), 1.2]);
  }
  // Deeper sand row (tallest), staggered, step 14.
  for (let x = -154; x <= 162; x += 14) {
    if (Math.abs(x) < 7 || Math.abs(x - 80) < 9) continue; // causeway + Ferris wheel
    palmSpots.push([x, 112, 17 + (x % 9), 1.3]);
  }
  for (const x of AVENUES) {
    for (let z = -90; z <= 90; z += 45) palmSpots.push([x + 6.5, z, 20 + z]);
  }
  // West-side avenue row, offset half a step — the avenues read as
  // palm-lined boulevards from the chase camera, not single-file lines.
  for (const x of AVENUES) {
    for (let z = -68; z <= 90; z += 45) palmSpots.push([x - 6.5, z, 60 + z]);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    palmSpots.push([ISLAND.cx + Math.cos(a) * (ISLAND.rx - 6), ISLAND.cz + Math.sin(a) * (ISLAND.rz - 6), 40 + i]);
  }
  for (const [x, z, s, sc] of palmSpots) {
    if (nearBillboard(x, z)) continue; // never grow through a billboard
    buildPalm(bd, x, z, [rng() - 0.5, rng() - 0.5], 0.6 + rng() * 0.8, s, sc || 1);
    chunks.flushIfNearLimit();
  }

  // Shade trees along the beach promenade (deep sand, between the palms
  // and the water) — the beach reads as a planted strand, not bare sand.
  for (let x = -150; x <= 150; x += 22) {
    if (Math.abs(x) < 8 || Math.abs(x - 80) < 10) continue; // causeway + Ferris wheel
    if (nearBillboard(x, 120)) continue;
    buildShadeTree(bd, x, 120, seedCounter++);
    chunks.flushIfNearLimit();
  }

  // Streetlights along avenues + streets — and a warm light pool on the
  // ground under each lamp head (a separate mesh, faded in at night by
  // the draw code via sky.windowLit; the pool sits at the arm tip, so
  // the light spills from the sidewalk onto the road edge). Pools ride
  // at y 0.17: the sidewalk boxes top out at 0.15, so a pool at ground
  // level would be buried under the sidewalk.
  poolBd.setMat(MAT.EMIT).setColor(1.0, 0.72, 0.35);
  for (const x of AVENUES) {
    for (let z = -95; z <= 95; z += 25) {
      buildStreetlight(bd, x + 5.5, z, true);
      poolBd.disc([x + 5.5, 0.17, z - 1.3], [0, 1, 0], 2.4, 16);
    }
  }
  for (const z of STREETS) {
    for (let x = -115; x <= 115; x += 30) {
      buildStreetlight(bd, x, z + 5.5, false);
      poolBd.disc([x, 0.17, z + 6.8], [0, 1, 0], 2.4, 16);
    }
  }

  // Traffic-light poles at every signaled intersection (the lamps are
  // dynamic — see buildTrafficLightLamps — but the poles + head boxes
  // are static, merged here). Each pole gets a small collider so cars
  // and pedestrians can't pass through it.
  for (const light of TRAFFIC_LIGHTS) {
    for (const head of lightHeads(light)) {
      buildTrafficLightPole(bd, head);
      colliders.push({ x0: head.x - 0.3, z0: head.z - 0.3, x1: head.x + 0.3, z1: head.z + 0.3 });
    }
    chunks.flushIfNearLimit();
  }

  // Fire hydrants along the avenues (red, on the sidewalk edge).
  for (const x of AVENUES) {
    buildHydrant(bd, x + 5.5, -75);
    buildHydrant(bd, x + 5.5, 25);
  }

  // Benches + planters at the park corners and the garage forecourt.
  buildBench(bd, 28, 56, Math.PI / 2);
  buildBench(bd, 56, 56, Math.PI / 2);
  buildPlanter(bd, 30, 92);
  buildPlanter(bd, 50, 92);
  buildBench(bd, -24, 44, 0);
  buildPlanter(bd, -36, 44);

  // Roadside props (GTA-like street furniture): parking meters, bus stops,
  // street signs, newsstands, vendor carts, barriers, mailboxes, bike
  // racks — one-sided like the streetlights (avenue props on the east
  // sidewalk facing west, street props on the south sidewalk facing
  // north). Every spot sits on a midpoint between streetlights (avenues:
  // z step 25; streets: x step 30), clear of palms (avenue rows at
  // x +/- 6.5, z step 45), hydrants (z -75 / 25), traffic-light poles
  // (intersections, +/- 5.5 / 6.5) and the beachfront dressing (z 105,
  // already dense — no new props there). Big props get colliders.
  const AW = -Math.PI / 2; // avenue props face west (toward the road)
  const SN = Math.PI; // street props face north (toward the road)
  // Avenues (east sidewalk, x + 5.5).
  buildBarrier(bd, -114.5, -60, AW);
  buildBarrier(bd, -114.5, -10, AW);
  buildNewsstand(bd, -54.5, -35, AW);
  colliders.push({ x0: -55.2, z0: -35.9, x1: -53.8, z1: -34.1 });
  buildBusStop(bd, -54.5, 15, AW);
  colliders.push({ x0: -55.05, z0: 13.65, x1: -53.95, z1: 16.35 });
  buildParkingMeter(bd, -54.5, 65, AW);
  buildParkingMeter(bd, 5.5, -60, AW);
  buildStreetSign(bd, 5.5, -10, AW);
  buildMailbox(bd, 5.5, 15, AW);
  buildStreetSign(bd, 5.5, 65, AW);
  buildBusStop(bd, 65.5, -35, AW);
  colliders.push({ x0: 64.95, z0: -36.35, x1: 66.05, z1: -33.65 });
  buildVendorCart(bd, 65.5, 15, AW, 11);
  colliders.push({ x0: 64.95, z0: 14.2, x1: 66.05, z1: 15.8 });
  buildBikeRack(bd, 65.5, 65, AW);
  buildStreetSign(bd, 125.5, -60, AW);
  buildParkingMeter(bd, 125.5, -10, AW);
  buildVendorCart(bd, 125.5, 40, AW, 23);
  colliders.push({ x0: 124.95, z0: 39.2, x1: 126.05, z1: 40.8 });
  // Streets (south sidewalk, z + 5.5). The beachfront (z 100) is skipped —
  // its dressing (benches, planters, kiosk, bike rack) is already dense.
  buildParkingMeter(bd, -70, -94.5, SN);
  buildStreetSign(bd, 20, -94.5, SN);
  buildBarrier(bd, 80, -94.5, SN);
  buildNewsstand(bd, -40, -44.5, SN);
  colliders.push({ x0: -40.9, z0: -45.2, x1: -39.1, z1: -43.8 });
  buildVendorCart(bd, 20, -44.5, SN, 37);
  colliders.push({ x0: 19.2, z0: -45.05, x1: 20.8, z1: -43.95 });
  buildParkingMeter(bd, -100, -44.5, SN);
  buildParkingMeter(bd, 80, -44.5, SN);
  buildBusStop(bd, 50, -44.5, SN);
  colliders.push({ x0: 48.65, z0: -45.05, x1: 51.35, z1: -43.95 });
  buildStreetSign(bd, -70, 5.5, SN);
  buildMailbox(bd, -10, 5.5, SN);
  buildVendorCart(bd, 50, 5.5, SN, 41);
  colliders.push({ x0: 49.2, z0: 4.95, x1: 50.8, z1: 6.05 });
  buildBusStop(bd, -40, 55.5, SN);
  colliders.push({ x0: -41.35, z0: 54.95, x1: -38.65, z1: 56.05 });
  buildBikeRack(bd, 20, 55.5, SN);
  buildParkingMeter(bd, 80, 55.5, SN);
  chunks.flushIfNearLimit();

  // Market stalls in Barrio Sol.
  for (let i = 0; i < 6; i++) {
    buildMarketStall(bd, -45 + (i % 3) * 12, 60 + Math.floor(i / 3) * 12, (i % 2) * Math.PI, 100 + i);
  }
  // Containers + crates at the docks.
  const contCols = [[0.75, 0.30, 0.20], [0.20, 0.45, 0.65], [0.75, 0.60, 0.20], [0.25, 0.55, 0.30]];
  for (let i = 0; i < 8; i++) {
    const x = -140 + (i % 4) * 9, z = -120 + Math.floor(i / 4) * 8;
    buildContainer(bd, x, z, (i % 2) * 0.15, contCols[i % 4]);
    colliders.push({ x0: x - 3.2, z0: z - 1.4, x1: x + 3.2, z1: z + 1.4 });
  }
  // Billboards along the beachfront road (5 lit panels, see
  // BILLBOARD_SPOTS) — the strand's skyline, facing eastbound traffic.
  for (const spot of BILLBOARD_SPOTS) {
    buildBillboard(bd, spot);
    chunks.flushIfNearLimit();
  }

  // Boats anchored offshore (see BOAT_SPOTS) — the bay reads as used water.
  for (const b of BOAT_SPOTS) {
    buildBoat(bd, b.x, b.z, b.yaw, b.kind, b.seed);
    chunks.flushIfNearLimit();
  }

  // Beach dressing: umbrellas + chairs + towels, a lifeguard tower, a
  // volleyball net, surfboards, a kiosk, benches, planters, a bike rack,
  // trash cans and string lights — the sand reads lived-in. Every prop
  // owns its own footprint (checked by the clearance probe): clear of
  // palm trunks, billboard posts, the wheel and each other.
  const umbrellaCols = [[0.95, 0.30, 0.25], [0.20, 0.55, 0.85], [1.0, 0.80, 0.25], [0.30, 0.75, 0.45], [0.85, 0.45, 0.85]];
  const umbrellaSpots = [[24, 118], [37, 117], [44, 119], [57, 118], [66, 119], [81, 117], [88, 119], [103, 118], [125, 117]];
  umbrellaSpots.forEach(([ux, uz], i) => {
    const side = i % 2 ? -1 : 1; // alternate chair/towel sides
    buildBeachUmbrella(bd, ux, uz, umbrellaCols[i % umbrellaCols.length]);
    buildLoungeChair(bd, ux + side * 2.2, uz + 0.8, 0.5, umbrellaCols[(i + 1) % umbrellaCols.length]);
    buildTowel(bd, ux - side * 2.0, uz + 1.5, 0.3, umbrellaCols[(i + 2) % umbrellaCols.length]);
    chunks.flushIfNearLimit();
  });
  buildLifeguardTower(bd, 52, 124);
  colliders.push({ x0: 50.6, z0: 122.6, x1: 53.4, z1: 125.4 });
  buildVolleyballNet(bd, 110, 122, 0);
  buildSurfboard(bd, 36, 113, 0.4, [0.95, 0.30, 0.25]);
  buildSurfboard(bd, 78, 115, -0.3, [0.20, 0.55, 0.85]);
  buildSurfboard(bd, 96, 113, 0.2, [1.0, 0.80, 0.25]);
  buildBeachKiosk(bd, 84, 106, 0);
  colliders.push({ x0: 82.3, z0: 104.6, x1: 85.7, z1: 107.4 });
  for (const [bx, bz] of [[20, 105], [48, 105], [76, 105], [104, 105], [130, 105]]) buildBench(bd, bx, bz, Math.PI / 2);
  for (const [px, pz] of [[14, 105], [40, 105], [56, 105], [100, 105], [120, 105]]) buildPlanter(bd, px, pz);
  buildBikeRack(bd, 68, 105.5, 0);
  for (const [tx, tz] of [[30, 105], [90, 105], [110, 105]]) buildTrashCan(bd, tx, tz);
  buildStringLights(bd, 27, 94, 36, 94);
  buildStringLights(bd, 99, 94, 108, 94);
  chunks.flushIfNearLimit();

  // Rambla Park: the green pocket park on the beachfront block.
  buildPark(bd, poolBd);
  colliders.push({ x0: 39.5, z0: 81.5, x1: 44.5, z1: 86.5 }); // fountain
  colliders.push({ x0: 36.4, z0: 69.4, x1: 37.6, z1: 70.6 }); // statue
  chunks.flushIfNearLimit();

  // Rain puddles (GLASS discs on roads, drawn with alpha = wet).
  puddleBd.setMat(MAT.GLASS).setColor(0.35, 0.45, 0.55);
  for (let i = 0; i < 26; i++) {
    const x = AVENUES[i % AVENUES.length] + (rng() - 0.5) * 4;
    const z = CITY.z0 + rng() * (BEACH_Z - CITY.z0);
    puddleBd.disc([x, 0.035, z], [0, 1, 0], 1.2 + rng() * 1.6, 14);
  }

  return {
    chunks: chunks.finish(),
    puddles: puddleBd.build(),
    lampPools: poolBd.build(),
    colliders,
  };
}

// --- collision helpers --------------------------------------------------------
// Push a circle (x, z, radius) out of every AABB it overlaps. Returns true if
// anything was hit (used for car damage + thud).
export function collideCircle(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(pos[0], c.x1));
    const nz = Math.max(c.z0, Math.min(pos[2], c.z1));
    const dx = pos[0] - nx, dz = pos[2] - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos[0] += (dx / d) * push;
        pos[2] += (dz / d) * push;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = pos[0] - c.x0, pr = c.x1 - pos[0];
        const pt = pos[2] - c.z0, pb = c.z1 - pos[2];
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos[0] = c.x0 - radius;
        else if (m === pr) pos[0] = c.x1 + radius;
        else if (m === pt) pos[2] = c.z0 - radius;
        else pos[2] = c.z1 + radius;
      }
    }
  }
  // World bounds: keep the player inside the playable area (incl. island).
  const inIsland =
    Math.abs(pos[0] - ISLAND.cx) < ISLAND.rx + 4 &&
    pos[2] > ISLAND.cz - ISLAND.rz - 4 && pos[2] < ISLAND.cz + ISLAND.rz + 4;
  if (!inIsland) {
    pos[0] = Math.max(CITY.x0 + 2, Math.min(CITY.x1 - 2, pos[0]));
    pos[2] = Math.max(CITY.z0 + 2, Math.min(WATER_Z + 60, pos[2]));
    // Water line: block walking/driving into the sea except on the causeway.
    if (pos[2] > WATER_Z && Math.abs(pos[0]) > 6 && !inIsland) {
      pos[2] = WATER_Z;
    }
  }
  return hit;
}
