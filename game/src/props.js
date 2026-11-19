// props.js — Paloma Bay: market stalls, containers, billboards, boats,
// beach props.
// The dressing that makes the city and the sand read as lived-in: Barrio
// Sol market stalls, dock containers, five lit beachfront billboards
// (colour-block faces with geometric glyphs — no 3D text exists in the
// material set), anchored sail/motor boats, and the beach set (umbrellas,
// lounge chairs, towels, lifeguard tower, volleyball net, surfboards,
// kiosk). Every builder takes a MeshBuilder and appends to it; every prop
// owns its own footprint (placements are checked by the clearance probe).

import { TAU, frame, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';

// Market stall (Barrio Sol): posts + striped canopy + crates.
export function buildMarketStall(bd, x, z, yaw, seed) {
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
export function buildContainer(bd, x, z, yaw, color) {
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
export const BILLBOARD_SPOTS = [
  { x: 30, z: 111, yaw: -2.10, w: 14, h: 5, design: BILLBOARDS.radio },
  { x: 58, z: 112, yaw: -2.10, w: 20, h: 6.5, design: BILLBOARDS.wheel },
  { x: 70, z: 110, yaw: -2.10, w: 13, h: 5, design: BILLBOARDS.guns },
  { x: 92, z: 110, yaw: -2.10, w: 14, h: 5, design: BILLBOARDS.garage },
  { x: 105, z: 110, yaw: -2.10, w: 12, h: 4.5, design: BILLBOARDS.vireo },
];

// Keep palms and shade trees clear of billboard panels and posts.
export function nearBillboard(x, z) {
  return BILLBOARD_SPOTS.some((b) => Math.hypot(b.x - x, b.z - z) < 11);
}

// Two posts + a dark backing panel + a lit ad face with glyphs, all inside
// one rotated frame so the board faces the road (face normal +Z local).
export function buildBillboard(bd, spot) {
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

export function buildBoat(bd, x, z, yaw, kind, seed) {
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

export function buildBeachUmbrella(bd, x, z, color) {
  bd.setMat(MAT.PLAIN).setColor(0.85, 0.85, 0.85);
  bd.tube([x, 0.05, z], [x, 2.1, z], 0.05, 0.04, 6, true);
  // Canopy: a shallow cone (tube r 1.6 -> 0.05) + a top ball.
  bd.setColor(color[0], color[1], color[2]);
  bd.tube([x, 2.1, z], [x, 2.55, z], 1.6, 0.06, 10, false);
  bd.setColor(1.0, 1.0, 1.0);
  bd.blob(x, 2.6, z, 0.09, 0.09, 0.09, x * 3 + z);
}

export function buildLoungeChair(bd, x, z, yaw, color, y) {
  bd.push(frame(x, y || 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(color[0], color[1], color[2]);
  bd.box(-0.9, 0.25, -0.35, 0.5, 0.38, 0.35); // seat
  bd.box(0.5, 0.25, -0.35, 0.95, 0.85, 0.35); // raised back
  bd.setColor(0.25, 0.25, 0.27);
  bd.box(-0.9, 0.05, -0.3, -0.8, 0.25, 0.3);
  bd.box(0.3, 0.05, -0.3, 0.4, 0.25, 0.3);
  bd.pop();
}

export function buildTowel(bd, x, z, yaw, color) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(color[0], color[1], color[2]);
  bd.quad([-0.9, 0.06, -0.4], [0.9, 0.06, -0.4], [0.9, 0.06, 0.4], [-0.9, 0.06, 0.4]);
  bd.setColor(1.0, 1.0, 1.0);
  bd.quad([-0.9, 0.07, -0.4], [-0.5, 0.07, -0.4], [-0.5, 0.07, 0.4], [-0.9, 0.07, 0.4]);
  bd.pop();
}

export function buildLifeguardTower(bd, x, z) {
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

export function buildVolleyballNet(bd, x, z, yaw) {
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

export function buildSurfboard(bd, x, z, yaw, color) {
  bd.push(frame(x, 0, z, yaw, 0.35, 0, 1)); // leaning back
  bd.setMat(MAT.PAINT).setColor(color[0], color[1], color[2]);
  bd.blob(0, 1.0, 0, 0.32, 1.0, 0.08, x * 7 + z);
  bd.setColor(1.0, 1.0, 1.0);
  bd.blob(0, 1.35, 0, 0.30, 0.28, 0.09, x * 7 + z + 1);
  bd.pop();
}

export function buildBeachKiosk(bd, x, z, yaw) {
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
