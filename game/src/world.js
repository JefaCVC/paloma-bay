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
export const DISTRICTS = [
  { name: 'Porto Lumen', region: [-175, -125, -60, 60], style: 2, hMin: 6, hMax: 12,
    palette: [[0.72, 0.66, 0.58], [0.62, 0.60, 0.55], [0.78, 0.70, 0.55]] },
  { name: 'Ciudad Vieja', region: [-120, -60, -105, -45], style: 0, hMin: 8, hMax: 16,
    palette: [[0.85, 0.72, 0.55], [0.80, 0.62, 0.48], [0.88, 0.78, 0.62]] },
  { name: 'North Docks', region: [-60, 60, -155, -100], style: 1, hMin: 7, hMax: 13,
    palette: [[0.55, 0.55, 0.58], [0.48, 0.50, 0.55], [0.62, 0.58, 0.52]] },
  { name: 'Palm Heights', region: [60, 175, -105, 0], style: 1, hMin: 16, hMax: 38,
    palette: [[0.72, 0.76, 0.80], [0.65, 0.70, 0.75], [0.80, 0.78, 0.72]] },
  { name: 'Barrio Sol', region: [-60, 0, 0, 100], style: 2, hMin: 6, hMax: 11,
    palette: [[0.85, 0.68, 0.45], [0.78, 0.55, 0.42], [0.90, 0.75, 0.55]] },
  { name: 'La Rambla', region: [-120, 175, 50, 100], style: 0, hMin: 9, hMax: 20,
    palette: [[0.88, 0.82, 0.70], [0.75, 0.72, 0.65], [0.92, 0.85, 0.72]] },
  { name: 'Isla Verde', region: [-62, 62, 158, 242], style: 0, hMin: 5, hMax: 9,
    palette: [[0.85, 0.80, 0.68], [0.78, 0.72, 0.60], [0.90, 0.85, 0.75]] },
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
  [-168, 20], [-140, -40], [-140, 40], [-120, -100], [-90, -75], [-60, -125],
  [-30, 25], [-45, -20], [-15, 75], [0, -100], [0, 140], [30, 10], [15, -60],
  [60, -75], [90, -50], [120, 0], [80, 112], [140, 75], [0, 175], [0, 228],
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
      this.cur = new MeshBuilder();
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
  // Roof clutter: AC box + antenna mast.
  const rng = rng32((b.seed * 777 + 13) | 0);
  const roofY = b.roof === 'hip' ? h : h + 0.3;
  bd.setMat(MAT.METAL).setColor(0.55, 0.55, 0.58);
  bd.box(x0 + 2 + rng() * 2, roofY, z0 + 2, x0 + 3.4 + rng() * 2, roofY + 0.9, z0 + 3.2);
  bd.setMat(MAT.PLAIN).setColor(0.25, 0.25, 0.27);
  const ax = x1 - 2 - rng() * 2, az = z0 + 2 + rng() * 2;
  bd.tube([ax, roofY, az], [ax, roofY + 2.6, az], 0.05, 0.03, 5, true);
  // Shop sign board + awning for shop-style buildings.
  if (b.style === 2) {
    bd.setMat(MAT.EMIT).setColor(1.0, 0.72, 0.35);
    bd.box(x0 + 2, 3.6, z1 + 0.05, x1 - 2, 4.3, z1 + 0.35);
    bd.setMat(MAT.PLAIN).setColor(0.75, 0.30, 0.22);
    bd.quad([x0 + 1, 3.4, z1 + 0.1], [x1 - 1, 3.4, z1 + 0.1], [x1 - 1, 2.9, z1 + 1.3], [x0 + 1, 2.9, z1 + 1.3]);
  }
}

// --- palm (segmented leaning trunk + folded 3-vertex fronds) ------------------
function buildPalm(bd, x, z, leanDir, leanAmt, seed) {
  const rng = rng32((seed * 991 + 7) | 0);
  const baseY = 0.15;
  let px = x, pz = z, py = baseY;
  let r = 0.22;
  const segH = 0.92;
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
    const len = 2.6 + rng() * 0.8;
    const g = 0.42 + rng() * 0.12;
    frond(ang, len, 0.55 + rng() * 0.15, 1.0 + rng() * 0.25, [0.14 + rng() * 0.05, g, 0.20], seed + i * 0.37);
  }
  frond(rng() * TAU, 2.2, -0.45, 0.7, [0.45, 0.32, 0.15], seed + 9.3); // dead frond
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
  bd.disc([x, 4.77, z + armZ], [0, -1, 0], 0.2, 10);
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

  // Ground: mainland slab + island + beach sand.
  bd.setMat(MAT.PLAIN).setSeed(0).setColor(0.42, 0.44, 0.36);
  bd.quad([CITY.x0, 0, CITY.z0], [CITY.x1, 0, CITY.z0], [CITY.x1, 0, BEACH_Z], [CITY.x0, 0, BEACH_Z]);
  bd.setColor(0.85, 0.78, 0.58); // sand
  bd.quad([CITY.x0, 0.01, BEACH_Z], [CITY.x1, 0.01, BEACH_Z], [CITY.x1, 0.01, WATER_Z], [CITY.x0, 0.01, WATER_Z]);
  bd.setColor(0.45, 0.48, 0.35); // island ground (ellipse-ish slab)
  bd.disc([ISLAND.cx, 0.02, ISLAND.cz], [0, 1, 0], 1, 28);
  // Island disc is unit radius — scale via a second pass: rebuild as ellipse quads.
  // (disc above is a placeholder circle at r=1; the island slab follows.)
  bd.setColor(0.45, 0.48, 0.35);
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
        const fx0 = nB === 1 ? bx0 + 2 : bx0 + 2 + k * (w / 2);
        const fx1 = nB === 1 ? bx1 - 2 : bx0 - 2 + (k + 1) * (w / 2);
        const h = d.hMin + rng() * (d.hMax - d.hMin);
        const floors = Math.max(2, Math.round(h / 3));
        const cols = Math.max(3, Math.round((fx1 - fx0) / 3));
        const col = d.palette[Math.floor(rng() * d.palette.length)];
        const b = {
          x0: fx0, x1: fx1, z0: bz0 + 2, z1: bz1 - 2, h, floors, cols,
          style: d.style, seed: seedCounter++, color: col,
          roof: d.style === 0 && rng() > 0.5 ? 'hip' : 'flat',
        };
        buildBuilding(bd, b);
        colliders.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
        chunks.flushIfNearLimit();
      }
      // A shade tree or two per block.
      if (rng() > 0.3) {
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

  // Palms: beachfront rows + avenue lines + island.
  const palmSpots = [];
  for (let x = -160; x <= 160; x += 16) palmSpots.push([x, 104, 5 + (x % 7)]);
  for (let x = -160; x <= 160; x += 24) palmSpots.push([x, 96, 11 + (x % 5)]);
  for (const x of AVENUES) {
    for (let z = -90; z <= 90; z += 45) palmSpots.push([x + 6.5, z, 20 + z]);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    palmSpots.push([ISLAND.cx + Math.cos(a) * (ISLAND.rx - 6), ISLAND.cz + Math.sin(a) * (ISLAND.rz - 6), 40 + i]);
  }
  for (const [x, z, s] of palmSpots) {
    buildPalm(bd, x, z, [rng() - 0.5, rng() - 0.5], 0.6 + rng() * 0.8, s);
    chunks.flushIfNearLimit();
  }

  // Streetlights along avenues + streets.
  for (const x of AVENUES) {
    for (let z = -95; z <= 95; z += 25) buildStreetlight(bd, x + 5.5, z, true);
  }
  for (const z of STREETS) {
    for (let x = -115; x <= 115; x += 30) buildStreetlight(bd, x, z + 5.5, false);
  }

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
  // Billboard on La Rambla.
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  bd.tube([40, 0, 94], [40, 9, 94], 0.25, 0.2, 6, true);
  bd.tube([52, 0, 94], [52, 9, 94], 0.25, 0.2, 6, true);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.65, 0.30);
  bd.box(38, 9, 93.8, 54, 13.5, 94.2);

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
