// vehicles.js — cars and the police helicopter for PALOMA BAY.
// Cars are DATA: each model is a side-profile polyline + params, swept in
// strips with true-circle wheel arches, dark wheel wells, a shoulder
// chamfer, a tapered glasshouse and a modelled interior. One unit wheel
// (radius 1) is scaled per model; spin = distance / wheel radius.
// All vehicle names are original to this game.

import { TAU, frame, lerp } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';

// prof: lower-body side profile [x, topY], front (+x) to rear (-x).
// greenhouse: [windshieldBaseX, roofFrontX, roofRearX, rearBaseX, roofY].
export const CAR_MODELS = {
  taxi: {
    name: 'Marlin Cab', kind: 'taxi',
    prof: [[2.3, 0.55], [2.0, 0.9], [0.9, 1.0], [-0.9, 1.0], [-2.0, 0.95], [-2.3, 0.6]],
    sill: 0.30, wr: 0.36, wheelX: [1.5, -1.5], width: 0.95, topWidth: 0.78,
    greenhouse: [1.05, 0.5, -0.8, -1.25, 1.38],
    topSpeed: 26, accel: 9, grip: 2.6, colors: [[0.95, 0.75, 0.15], [0.95, 0.75, 0.15]],
    value: 400,
  },
  sedan: {
    name: 'Aurelia S4', kind: 'sedan',
    prof: [[2.2, 0.50], [1.9, 0.85], [0.9, 0.95], [-0.9, 0.95], [-1.9, 0.90], [-2.2, 0.55]],
    sill: 0.28, wr: 0.36, wheelX: [1.45, -1.45], width: 0.95, topWidth: 0.78,
    greenhouse: [1.0, 0.45, -0.75, -1.2, 1.32],
    topSpeed: 30, accel: 10, grip: 2.8, colors: [[0.55, 0.60, 0.65], [0.25, 0.30, 0.45], [0.70, 0.70, 0.72]],
    value: 800,
  },
  coupe: {
    name: 'Falco GT', kind: 'coupe',
    prof: [[2.3, 0.45], [2.0, 0.78], [0.8, 0.88], [-0.8, 0.88], [-1.9, 0.82], [-2.3, 0.50]],
    sill: 0.24, wr: 0.37, wheelX: [1.5, -1.5], width: 0.98, topWidth: 0.76,
    greenhouse: [0.95, 0.35, -0.7, -1.15, 1.22],
    topSpeed: 40, accel: 14, grip: 3.4, colors: [[0.78, 0.13, 0.10], [0.10, 0.25, 0.60], [0.85, 0.55, 0.10]],
    value: 2500,
  },
  muscle: {
    name: 'Corsair V8', kind: 'muscle',
    prof: [[2.5, 0.50], [2.2, 0.85], [0.7, 0.95], [-1.0, 0.95], [-2.2, 0.85], [-2.5, 0.55]],
    sill: 0.26, wr: 0.38, wheelX: [1.6, -1.6], width: 1.0, topWidth: 0.78,
    greenhouse: [0.9, 0.3, -0.9, -1.3, 1.25],
    topSpeed: 38, accel: 13, grip: 3.0, colors: [[0.12, 0.12, 0.14], [0.85, 0.35, 0.10], [0.10, 0.45, 0.55]],
    value: 2200,
  },
  suv: {
    name: 'Bison 4x4', kind: 'suv',
    prof: [[2.4, 0.62], [2.1, 1.05], [0.9, 1.12], [-0.9, 1.12], [-2.1, 1.05], [-2.4, 0.65]],
    sill: 0.42, wr: 0.44, wheelX: [1.55, -1.55], width: 1.02, topWidth: 0.85,
    greenhouse: [1.1, 0.6, -0.9, -1.35, 1.55],
    topSpeed: 28, accel: 9, grip: 2.4, colors: [[0.25, 0.30, 0.28], [0.60, 0.55, 0.45], [0.45, 0.12, 0.10]],
    value: 1200,
  },
  van: {
    name: 'Mulo Van', kind: 'van',
    prof: [[2.5, 0.70], [2.2, 1.25], [1.2, 1.55], [-1.6, 1.55], [-2.3, 1.45], [-2.5, 0.70]],
    sill: 0.38, wr: 0.40, wheelX: [1.6, -1.6], width: 1.0, topWidth: 0.88,
    greenhouse: [1.5, 1.2, -1.6, -1.9, 1.62],
    topSpeed: 24, accel: 7, grip: 2.2, colors: [[0.85, 0.85, 0.85], [0.35, 0.50, 0.65], [0.70, 0.65, 0.55]],
    value: 600,
  },
  police: {
    name: 'PBPD Interceptor', kind: 'police',
    prof: [[2.2, 0.50], [1.9, 0.85], [0.9, 0.95], [-0.9, 0.95], [-1.9, 0.90], [-2.2, 0.55]],
    sill: 0.28, wr: 0.36, wheelX: [1.45, -1.45], width: 0.95, topWidth: 0.78,
    greenhouse: [1.0, 0.45, -0.75, -1.2, 1.32],
    topSpeed: 36, accel: 13, grip: 3.2, colors: [[0.92, 0.92, 0.94]],
    value: 0,
  },
};

function topYAt(model, x) {
  const p = model.prof;
  if (x >= p[0][0]) return p[0][1];
  for (let i = 0; i < p.length - 1; i++) {
    if (x <= p[i][0] && x >= p[i + 1][0]) {
      const t = (p[i][0] - x) / (p[i][0] - p[i + 1][0]);
      return lerp(p[i][1], p[i + 1][1], t);
    }
  }
  return p[p.length - 1][1];
}

// Sweep the side profile into a body: stations at every profile point plus
// 9 cosine-spaced samples around each wheel arch, so the arches are true
// circles and the sill follows them.
export function buildCarBody(model, color) {
  const bd = new MeshBuilder();
  const R = model.wr + 0.12; // arch radius: wheel + clearance
  const stations = [];
  for (const p of model.prof) stations.push(p[0]);
  for (const wx of model.wheelX) {
    for (let k = 0; k < 9; k++) stations.push(wx + R * Math.cos((Math.PI * k) / 8));
  }
  stations.sort((a, b) => a - b);
  const uniq = [];
  for (const s of stations) {
    if (!uniq.length || Math.abs(s - uniq[uniq.length - 1]) > 0.01) uniq.push(s);
  }
  const section = (x) => {
    const topY = topYAt(model, x);
    let sillY = model.sill;
    for (const wx of model.wheelX) {
      const dx = x - wx;
      if (Math.abs(dx) < R) {
        const ay = model.wr + Math.sqrt(R * R - dx * dx);
        if (ay > sillY) sillY = ay;
      }
    }
    const midY = (sillY + topY) * 0.5;
    return [
      [x, sillY, -model.width], [x, midY, -model.width], [x, topY, -model.topWidth],
      [x, topY, model.topWidth], [x, midY, model.width], [x, sillY, model.width],
    ];
  };
  const sections = uniq.map(section);
  bd.setMat(MAT.PAINT).setColor(color[0], color[1], color[2]);
  for (let i = 0; i < sections.length - 1; i++) {
    const A = sections[i], B = sections[i + 1];
    for (let e = 0; e < 5; e++) bd.quad(A[e], B[e], B[e + 1], A[e + 1]);
  }
  // Underbody (dark, closes the bottom so no background bleeds through).
  bd.setMat(MAT.PLAIN).setColor(0.07, 0.07, 0.08);
  for (let i = 0; i < sections.length - 1; i++) {
    const A = sections[i], B = sections[i + 1];
    bd.quad(A[5], B[5], B[0], A[0]);
  }
  // End caps (fans from the section centroid).
  bd.setMat(MAT.PAINT).setColor(color[0], color[1], color[2]);
  const cap = (sec, flip) => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of sec) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= 6; cy /= 6; cz /= 6;
    const n = flip ? [-1, 0, 0] : [1, 0, 0];
    const ci = bd.vert([cx, cy, cz], n, 0.5, 0.5);
    const ring = sec.map((p) => bd.vert(p, n, 0.5, 0.5));
    for (let i = 0; i < 6; i++) {
      if (flip) bd.tri(ci, ring[(i + 1) % 6], ring[i]);
      else bd.tri(ci, ring[i], ring[(i + 1) % 6]);
    }
  };
  cap(sections[sections.length - 1], false);
  cap(sections[0], true);
  // Wheel wells: dark discs behind each arch + inner back plates (no light leak).
  bd.setMat(MAT.PLAIN).setColor(0.05, 0.05, 0.06);
  for (const wx of model.wheelX) {
    bd.disc([wx, model.wr, model.width - 0.09], [0, 0, 1], R, 16);
    bd.disc([wx, model.wr, -model.width + 0.09], [0, 0, -1], R, 16);
    bd.disc([wx, model.wr, 0.45], [0, 0, 1], R, 16);
    bd.disc([wx, model.wr, -0.45], [0, 0, -1], R, 16);
  }
  // Roof panel + pillars + modelled interior (visible through the glass).
  const [wb, rf, rr, rb, roofY] = model.greenhouse;
  const beltY = topYAt(model, 0);
  bd.setMat(MAT.PAINT).setColor(color[0], color[1], color[2]);
  bd.quad([rf, roofY, -model.topWidth + 0.1], [rr, roofY, -model.topWidth + 0.1], [rr, roofY, model.topWidth - 0.1], [rf, roofY, model.topWidth - 0.1]);
  bd.setMat(MAT.PLAIN).setColor(0.10, 0.10, 0.12);
  const pillar = (x0, x1, z) => bd.tube([x0, beltY, z], [x1, roofY, z * 0.88], 0.035, 0.035, 5, true);
  for (const sz of [-1, 1]) {
    pillar(wb, rf, sz * (model.topWidth + 0.02));
    pillar((wb + rb) / 2, (rf + rr) / 2, sz * (model.topWidth + 0.02));
    pillar(rb, rr, sz * (model.topWidth + 0.02));
  }
  bd.setColor(0.14, 0.14, 0.16);
  bd.box(wb - 0.25, beltY, -0.70, wb - 0.02, beltY + 0.17, 0.70); // dash
  bd.setColor(0.22, 0.18, 0.16);
  for (const sz of [-0.38, 0.38]) {
    bd.box(rr + 0.25, beltY, sz - 0.22, rr + 0.65, beltY + 0.11, sz + 0.22); // seat base
    bd.push(frame(rr + 0.22, beltY + 0.07, sz, 0, 0, -0.16));
    bd.box(-0.06, 0, -0.22, 0.06, 0.38, 0.22); // backrest, tilted back
    bd.pop();
  }
  bd.setColor(0.10, 0.10, 0.12);
  bd.tube([wb - 0.25, beltY + 0.10, 0.38], [wb - 0.37, beltY + 0.18, 0.38], 0.02, 0.02, 5, true);
  bd.disc([wb - 0.39, beltY + 0.19, 0.38], [-1, 0.45, 0], 0.13, 12); // steering wheel
  // Bumpers, grille, lights, door seams, handles, mirrors.
  const frontX = model.prof[0][0], rearX = model.prof[model.prof.length - 1][0];
  bd.setMat(MAT.METAL).setColor(0.80, 0.80, 0.82);
  bd.box(frontX, 0.35, -0.85, frontX + 0.13, 0.55, 0.85);
  bd.box(rearX - 0.13, 0.35, -0.85, rearX, 0.55, 0.85);
  bd.setMat(MAT.PLAIN).setColor(0.08, 0.08, 0.10);
  bd.box(frontX + 0.01, 0.58, -0.50, frontX + 0.08, 0.78, 0.50);
  bd.setMat(MAT.METAL).setColor(0.75, 0.75, 0.77);
  bd.box(frontX + 0.02, 0.63, -0.48, frontX + 0.07, 0.66, 0.48);
  bd.box(frontX + 0.02, 0.71, -0.48, frontX + 0.07, 0.74, 0.48);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.95, 0.80);
  bd.disc([frontX + 0.06, 0.72, -0.60], [1, 0, 0], 0.13, 12);
  bd.disc([frontX + 0.06, 0.72, 0.60], [1, 0, 0], 0.13, 12);
  bd.setColor(1.0, 0.15, 0.10);
  bd.disc([rearX - 0.06, 0.70, -0.60], [-1, 0, 0], 0.11, 12);
  bd.disc([rearX - 0.06, 0.70, 0.60], [-1, 0, 0], 0.11, 12);
  bd.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
  for (const sz of [-1, 1]) {
    bd.quad([0.15, 0.55, sz * (model.width + 0.006)], [0.15, 0.90, sz * (model.width + 0.006)], [0.13, 0.90, sz * (model.width + 0.006)], [0.13, 0.55, sz * (model.width + 0.006)]);
    bd.quad([-0.75, 0.55, sz * (model.width + 0.006)], [-0.75, 0.90, sz * (model.width + 0.006)], [-0.77, 0.90, sz * (model.width + 0.006)], [-0.77, 0.55, sz * (model.width + 0.006)]);
  }
  bd.setMat(MAT.METAL).setColor(0.80, 0.80, 0.82);
  for (const sz of [-1, 1]) {
    bd.box(-0.20, 0.86, sz * 0.95, -0.02, 0.90, sz * 0.99);
    bd.box(wb - 0.15, beltY + 0.03, sz * 0.94, wb - 0.05, beltY + 0.09, sz * 1.02);
  }
  // Taxi sign / police extras.
  if (model.kind === 'taxi') {
    bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.30);
    bd.box(-0.25, roofY + 0.02, -0.35, 0.25, roofY + 0.22, 0.35);
  }
  if (model.kind === 'police') {
    bd.setMat(MAT.PLAIN).setColor(0.05, 0.05, 0.07);
    bd.box(frontX - 0.7, topYAt(model, frontX - 0.4) + 0.01, -0.8, frontX - 0.05, topYAt(model, frontX - 0.4) + 0.04, 0.8); // black hood
    bd.box(rf - 0.1, roofY + 0.01, -0.7, rr + 0.1, roofY + 0.04, 0.7); // black roof band
    bd.setMat(MAT.METAL).setColor(0.15, 0.15, 0.17);
    bd.box(frontX + 0.05, 0.30, -0.7, frontX + 0.28, 0.85, 0.7); // push bar
  }
  return bd.build();
}

export function buildCarGlass(model) {
  const bd = new MeshBuilder();
  const [wb, rf, rr, rb, roofY] = model.greenhouse;
  const beltY = topYAt(model, 0);
  const w = model.topWidth + 0.02;
  bd.setMat(MAT.GLASS).setColor(0.55, 0.70, 0.78);
  bd.quad([wb, beltY, -w], [wb, beltY, w], [rf, roofY, w - 0.1], [rf, roofY, -w + 0.1]); // windshield
  bd.quad([rb, beltY, w], [rb, beltY, -w], [rr, roofY, -w + 0.1], [rr, roofY, w - 0.1]); // rear
  bd.quad([wb, beltY, w], [rf, roofY, w - 0.1], [rr, roofY, w - 0.1], [rb, beltY, w]); // side R
  bd.quad([rb, beltY, -w], [rr, roofY, -w + 0.1], [rf, roofY, -w + 0.1], [wb, beltY, -w]); // side L
  return bd.build();
}

// One unit wheel (radius 1), scaled per model at draw time.
export function buildWheel() {
  const bd = new MeshBuilder();
  bd.setMat(MAT.PLAIN).setColor(0.08, 0.08, 0.09);
  bd.tube([0, 0, -0.25], [0, 0, 0.25], 1, 1, 14, true); // tyre
  bd.setMat(MAT.METAL).setColor(0.78, 0.78, 0.80);
  bd.disc([0, 0, 0.26], [0, 0, 1], 0.55, 14);
  bd.disc([0, 0, -0.26], [0, 0, -1], 0.55, 14);
  for (let k = 0; k < 5; k++) {
    bd.push(frame(0, 0, 0, 0, 0, (k * TAU) / 5));
    bd.box(0.05, -0.06, 0.24, 0.52, 0.06, 0.28);
    bd.box(0.05, -0.06, -0.28, 0.52, 0.06, -0.24);
    bd.pop();
  }
  bd.setColor(0.80, 0.60, 0.20);
  bd.disc([0, 0, 0.29], [0, 0, 1], 0.12, 10);
  bd.disc([0, 0, -0.29], [0, 0, -1], 0.12, 10);
  return bd.build();
}

// --- jet ski (rideable watercraft) --------------------------------------------
// Nose at +X, origin at the waterline. The seat top sits at y = 0.58, which
// is exactly where the seated character pose puts its hips (see
// characters.js `sitting`), and the deck at y = 0.28 is where its feet rest.
export function buildJetSki(color) {
  const bd = new MeshBuilder();
  // Hull: side profile extruded across the beam.
  bd.setMat(MAT.PAINT).setColor(color[0], color[1], color[2]);
  bd.extrude(
    [[1.15, 0.10], [1.05, 0.42], [0.55, 0.30], [-0.6, 0.28], [-1.05, 0.32], [-1.15, 0.14], [-0.7, 0.06], [0.7, 0.04]],
    -0.38, 0.38,
  );
  // White accent stripe along each flank, proud of the hull side.
  bd.setMat(MAT.PAINT).setColor(0.95, 0.95, 0.95);
  bd.quad([0.8, 0.16, 0.385], [-0.8, 0.16, 0.385], [-0.8, 0.22, 0.385], [0.8, 0.22, 0.385]);
  bd.quad([-0.8, 0.16, -0.385], [0.8, 0.16, -0.385], [0.8, 0.22, -0.385], [-0.8, 0.22, -0.385]);
  // Seat (dark, raised rear hump). The rider's feet rest on the deck
  // ahead of the seat — no separate footwell pads (the deck rises
  // toward the nose, so flat pads would sit inside the hull).
  bd.setMat(MAT.PLAIN).setColor(0.10, 0.10, 0.12);
  bd.box(-0.95, 0.28, -0.22, -0.15, 0.58, 0.22);
  // Handlebar post + crossbar + grips.
  bd.setMat(MAT.METAL).setColor(0.30, 0.30, 0.32);
  bd.tube([0.55, 0.30, 0], [0.62, 0.72, 0], 0.04, 0.035, 6, true);
  bd.tube([0.62, 0.72, -0.28], [0.62, 0.72, 0.28], 0.03, 0.03, 6, true);
  bd.setMat(MAT.PLAIN).setColor(0.08, 0.08, 0.09);
  bd.box(0.58, 0.69, -0.32, 0.66, 0.75, -0.24);
  bd.box(0.58, 0.69, 0.24, 0.66, 0.75, 0.32);
  // Small windshield, tilted back.
  bd.setMat(MAT.GLASS).setColor(0.55, 0.70, 0.78);
  bd.quad([0.78, 0.42, -0.2], [0.78, 0.42, 0.2], [0.68, 0.72, 0.2], [0.68, 0.72, -0.2]);
  // Rear grab handle + jet nozzle.
  bd.setMat(MAT.METAL).setColor(0.45, 0.45, 0.48);
  bd.tube([-1.0, 0.34, -0.15], [-1.0, 0.34, 0.15], 0.03, 0.03, 5, true);
  bd.tube([-1.16, 0.16, 0], [-1.28, 0.16, 0], 0.07, 0.06, 8, true);
  return bd.build();
}

// PBPD marine unit: a white patrol boat with a blue stripe, a cabin with a
// glass windshield, an outboard motor, and a red/blue light bar on the
// cabin roof (both halves always lit, so a frozen frame reads the colours).
// Same hull profile as the moored motorboats in world.js — the marine unit
// is one of the bay's boats, in police colours.
export function buildPoliceBoat() {
  const bd = new MeshBuilder();
  // Hull: side profile extruded across the beam (bow at +X).
  bd.setMat(MAT.PAINT).setColor(0.92, 0.92, 0.94);
  bd.extrude(
    [[2.6, 0.15], [2.2, 0.75], [0.5, 0.9], [-2.0, 0.9], [-2.6, 0.55], [-2.2, 0.1], [1.6, 0.05]],
    -0.85, 0.85,
  );
  // Blue PBPD stripe along each flank, proud of the hull side.
  bd.setMat(MAT.PAINT).setColor(0.15, 0.35, 0.85);
  bd.quad([2.0, 0.45, 0.855], [-2.0, 0.45, 0.855], [-2.0, 0.62, 0.855], [2.0, 0.62, 0.855]);
  bd.quad([-2.0, 0.45, -0.855], [2.0, 0.45, -0.855], [2.0, 0.62, -0.855], [-2.0, 0.62, -0.855]);
  // Deck + cabin + glass windshield.
  bd.setMat(MAT.PLAIN).setColor(0.85, 0.85, 0.88);
  bd.quad([-1.9, 0.92, -0.7], [1.9, 0.92, -0.7], [1.9, 0.92, 0.7], [-1.9, 0.92, 0.7]);
  bd.setMat(MAT.PLAIN).setColor(0.92, 0.92, 0.94);
  bd.box(-0.9, 0.9, -0.6, 0.9, 1.7, 0.6); // cabin
  bd.setMat(MAT.GLASS).setColor(0.55, 0.70, 0.78);
  bd.box(0.5, 1.1, -0.62, 0.9, 1.55, 0.62); // windshield
  bd.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
  bd.box(-2.6, 0.35, -0.3, -2.3, 0.9, 0.3); // outboard motor
  // Light bar on the cabin roof: red port + blue starboard, both lit.
  bd.setMat(MAT.EMIT).setColor(1.0, 0.15, 0.10);
  bd.box(-0.25, 1.70, -0.55, 0.25, 1.95, -0.05);
  bd.setMat(MAT.EMIT).setColor(0.15, 0.40, 1.0);
  bd.box(-0.25, 1.70, 0.05, 0.25, 1.95, 0.55);
  return bd.build();
}

// Police light bar: red left half + blue right half (from the chase cam,
// red reads on the left, blue on the right), each in a bright and a dim
// variant. The draw loop alternates which side is bright, so the bar
// flashes red-blue in live play — and a frozen frame still shows red on
// one side and blue on the other, because the dim side stays coloured.
// The bar sits on the black roof band (see buildCarBody's police extras).
export function buildLightBar() {
  const mk = (color, z0, z1) => {
    const bd = new MeshBuilder();
    bd.setMat(MAT.EMIT).setColor(color[0], color[1], color[2]);
    bd.box(-0.35, 1.34, z0, 0.35, 1.52, z1);
    return bd.build();
  };
  return {
    redBright: mk([1.0, 0.10, 0.10], -0.45, -0.03),
    redDim: mk([0.42, 0.08, 0.08], -0.45, -0.03),
    blueBright: mk([0.15, 0.30, 1.00], 0.03, 0.45),
    blueDim: mk([0.10, 0.16, 0.45], 0.03, 0.45),
  };
}

// --- helicopter (PBPD AIR-1) ---------------------------------------------------
// Rebuilt to read as a police helicopter at chase-cam distance: white PBPD
// livery with a dark belly, a big glass canopy, a long tail boom with a
// tall fin and stabiliser, skids, a searchlight, and a 4-blade main rotor.
// Nose at -X, tail at +X (the draw code yaws -X toward the player).
// Returns { body, rotor, tailRotor, cone }; the rotor meshes are built
// centred on their spin axes (main rotor about Y, tail rotor about Z),
// and the draw code translates the tail rotor onto the fin.
export function buildHelicopter() {
  const bd = new MeshBuilder();
  // Fuselage: white PBPD body + dark belly + engine deck.
  bd.setMat(MAT.PAINT).setColor(0.92, 0.92, 0.94);
  bd.blob(0, 0, 0, 2.1, 1.2, 1.3, 11);
  bd.setMat(MAT.PAINT).setColor(0.10, 0.16, 0.38);
  bd.blob(0, -0.5, 0, 1.8, 0.75, 1.05, 13);
  bd.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
  bd.box(-0.7, 0.95, -0.55, 0.9, 1.3, 0.55); // engine deck
  bd.setMat(MAT.METAL).setColor(0.45, 0.45, 0.48);
  bd.tube([0.7, 1.05, -0.3], [1.15, 1.05, -0.3], 0.12, 0.10, 6, true); // exhaust
  bd.tube([0.7, 1.05, 0.3], [1.15, 1.05, 0.3], 0.12, 0.10, 6, true);
  // Canopy: big glass bubble on the nose, proud of the fuselage.
  bd.setMat(MAT.GLASS).setColor(0.55, 0.70, 0.78);
  bd.blob(-1.5, 0.4, 0, 0.85, 0.8, 1.05, 12);
  // Sensor ball + searchlight housing under the nose.
  bd.setMat(MAT.METAL).setColor(0.30, 0.30, 0.32);
  bd.blob(-1.7, -0.55, 0, 0.28, 0.28, 0.28, 14);
  bd.setMat(MAT.PLAIN).setColor(0.15, 0.15, 0.17);
  bd.box(-2.0, -0.75, -0.2, -1.6, -0.45, 0.2);
  bd.setMat(MAT.EMIT).setColor(1.0, 0.95, 0.7);
  bd.disc([-2.02, -0.6, 0], [-1, -0.4, 0], 0.3, 12);
  // Tail boom (dark blue) + tall fin + horizontal stabiliser.
  bd.setMat(MAT.PAINT).setColor(0.10, 0.16, 0.38);
  bd.tube([1.6, 0.25, 0], [5.2, 0.75, 0], 0.5, 0.2, 8, true);
  bd.setMat(MAT.PAINT).setColor(0.92, 0.92, 0.94);
  bd.quad([4.3, 0.5, 0], [5.2, 0.65, 0], [5.2, 2.1, 0], [4.6, 2.0, 0]);
  bd.setMat(MAT.PAINT).setColor(0.10, 0.16, 0.38);
  bd.box(4.3, 0.6, -1.05, 4.95, 0.72, 1.05); // stabiliser
  // Skids, clear of the belly.
  bd.setMat(MAT.METAL).setColor(0.5, 0.5, 0.52);
  for (const sz of [-1.0, 1.0]) {
    bd.tube([-1.5, -1.5, sz], [1.5, -1.5, sz], 0.07, 0.07, 6, true);
    bd.tube([-1.0, -1.1, sz], [-1.0, -1.5, sz], 0.05, 0.05, 5, true);
    bd.tube([1.0, -1.1, sz], [1.0, -1.5, sz], 0.05, 0.05, 5, true);
  }
  // Beacons: red on the fin tip + belly (always lit).
  bd.setMat(MAT.EMIT).setColor(1.0, 0.15, 0.10);
  bd.blob(5.1, 2.1, 0, 0.13, 0.13, 0.13, 15);
  bd.blob(0, -1.3, 0, 0.11, 0.11, 0.11, 16);
  const body = bd.build();

  // Main rotor: 4 blades (two long crossing boxes) with yellow tips +
  // mast + hub, centred on the spin axis so the draw code's Y rotation
  // spins it in place.
  const rb = new MeshBuilder();
  rb.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
  rb.box(-5.4, 1.5, -0.17, 5.4, 1.58, 0.17);
  rb.box(-0.17, 1.5, -5.4, 0.17, 1.58, 5.4);
  rb.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.25); // yellow blade tips
  rb.box(5.0, 1.5, -0.17, 5.4, 1.58, 0.17);
  rb.box(-5.4, 1.5, -0.17, -5.0, 1.58, 0.17);
  rb.box(-0.17, 1.5, 5.0, 0.17, 1.58, 5.4);
  rb.box(-0.17, 1.5, -5.4, 0.17, 1.58, -5.0);
  rb.setMat(MAT.METAL).setColor(0.6, 0.6, 0.62);
  rb.tube([0, 1.05, 0], [0, 1.52, 0], 0.14, 0.14, 6, true);
  rb.blob(0, 1.54, 0, 0.35, 0.16, 0.35, 17);
  const rotor = rb.build();

  // Tail rotor: 2-blade cross in the XY plane (parallel to the fin),
  // centred on its hub at the origin — the draw code translates it onto
  // the fin and spins it about Z.
  const tb = new MeshBuilder();
  tb.setMat(MAT.PLAIN).setColor(0.12, 0.12, 0.14);
  tb.box(-0.06, -0.6, -0.05, 0.06, 0.6, 0.05);
  tb.box(-0.6, -0.05, -0.05, 0.6, 0.05, 0.05);
  tb.setMat(MAT.METAL).setColor(0.6, 0.6, 0.62);
  tb.disc([0, 0, 0.06], [0, 0, 1], 0.13, 10);
  const tailRotor = tb.build();

  // Spotlight cone (drawn blended, apex at the heli, opening downward).
  const cb = new MeshBuilder();
  cb.setMat(MAT.EMIT).setColor(1.0, 0.95, 0.65);
  const H = 18, R = 6;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
    cb.tri3([0, 0, 0], [Math.cos(a0) * R, -H, Math.sin(a0) * R], [Math.cos(a1) * R, -H, Math.sin(a1) * R]);
  }
  const cone = cb.build();

  return { body, rotor, tailRotor, cone };
}
