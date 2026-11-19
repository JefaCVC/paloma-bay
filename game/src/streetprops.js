// streetprops.js — Paloma Bay: street furniture, Rambla Park, landmarks,
// traffic-light hardware.
// Every builder faces local +Z at yaw 0 (like buildBench): avenue props
// on the east sidewalk use yaw -PI/2 (face west, toward the road), street
// props on the south sidewalk use yaw PI (face north). Small props get no
// collider (like the hydrants); the big ones (newsstand, cart, bus stop)
// get one at the placement site in worldbuild.js. Also here: Rambla Park
// (fountain, statue, trees, benches, flower beds, swings), the Ferris
// wheel, the mission beacon, the postcard marker, and the traffic-light
// poles + dynamic lamps (one mesh for all forty heads, rebuilt on phase
// flips).

import { TAU, frame } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';
import { PARK, TRAFFIC_LIGHTS, lightHeads, lightPhase } from './citydata.js';
import { buildShadeTree, buildStreetlight } from './greenery.js';

export function buildBench(bd, x, z, yaw) {
  bd.push(frame(x, 0, z, yaw, 0, 0, 1));
  bd.setMat(MAT.PLAIN).setColor(0.45, 0.32, 0.20);
  bd.box(-0.9, 0.45, -0.25, 0.9, 0.55, 0.25); // seat
  bd.box(-0.9, 0.55, -0.25, 0.9, 1.05, -0.15); // back
  bd.setMat(MAT.METAL).setColor(0.25, 0.25, 0.27);
  bd.box(-0.8, 0.05, -0.2, -0.7, 0.45, 0.2);
  bd.box(0.7, 0.05, -0.2, 0.8, 0.45, 0.2);
  bd.pop();
}

export function buildPlanter(bd, x, z) {
  bd.setMat(MAT.PLAIN).setColor(0.60, 0.42, 0.30);
  bd.box(x - 0.5, 0.05, z - 0.5, x + 0.5, 0.55, z + 0.5);
  bd.setMat(MAT.FOLIAGE).setColor(0.18, 0.48, 0.22);
  bd.blob(x, 0.85, z, 0.55, 0.45, 0.55, x * 11 + z);
  bd.setColor(0.95, 0.30, 0.35);
  bd.blob(x - 0.25, 1.05, z + 0.15, 0.12, 0.10, 0.12, x * 11 + z + 1);
  bd.blob(x + 0.28, 1.02, z - 0.18, 0.12, 0.10, 0.12, x * 11 + z + 2);
}

export function buildBikeRack(bd, x, z, yaw) {
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

// Parking meter: post + head + a green "time left" dot.
export function buildParkingMeter(bd, x, z, yaw) {
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
export function buildBusStop(bd, x, z, yaw) {
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
export function buildStreetSign(bd, x, z, yaw) {
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
export function buildNewsstand(bd, x, z, yaw) {
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
export function buildVendorCart(bd, x, z, yaw, seed) {
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
export function buildBarrier(bd, x, z, yaw) {
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
export function buildMailbox(bd, x, z, yaw) {
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

export function buildTrashCan(bd, x, z) {
  bd.setMat(MAT.METAL).setColor(0.30, 0.45, 0.35);
  bd.tube([x, 0.05, z], [x, 0.85, z], 0.30, 0.26, 10, true);
  bd.setMat(MAT.PLAIN).setColor(0.20, 0.20, 0.22);
  bd.disc([x, 0.86, z], [0, 1, 0], 0.28, 10);
}

// Fire hydrant: red body + domed cap + side nozzles, on the sidewalk edge.
export function buildHydrant(bd, x, z) {
  bd.setMat(MAT.PAINT).setColor(0.85, 0.15, 0.12);
  bd.tube([x, 0.15, z], [x, 0.75, z], 0.16, 0.14, 10, true);
  bd.blob(x, 0.82, z, 0.15, 0.12, 0.15, x * 3 + z);
  bd.setMat(MAT.METAL).setColor(0.75, 0.75, 0.78);
  bd.tube([x - 0.2, 0.55, z], [x + 0.2, 0.55, z], 0.06, 0.06, 6, true);
  bd.disc([x + 0.21, 0.55, z], [1, 0, 0], 0.08, 8);
  bd.disc([x - 0.21, 0.55, z], [-1, 0, 0], 0.08, 8);
}

// String lights between two palm trunks: a sagging line + glowing bulbs.
export function buildStringLights(bd, x0, z0, x1, z1) {
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
// The green pocket park on the beachfront block (x 30–54, z 57–93): grass +
// paths, a fountain, a statue, shade trees, benches, flower beds, lamp
// posts, swings. The lamp pools go into poolBd (faded in at night).
export function buildPark(bd, poolBd) {
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
// The wheel mesh is ONLY the wheel (rim + spokes + hub + cabins + rim
// lights); the support towers live in the static world. The draw code
// rotates this mesh around its axle.
export function buildFerrisWheel() {
  const bd = new MeshBuilder();
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

// --- traffic-light hardware ----------------------------------------------------
const HEAD_Y = 4.7; // lamp-row centre height (head box spans 3.85..5.55)

// Static part: pole + head box (the lamps are drawn dynamically).
export function buildTrafficLightPole(bd, head) {
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
