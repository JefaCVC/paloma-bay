// worldbuild.js — Paloma Bay: the city assembler.
// buildWorld() runs the generation: ground + water + roads + sidewalks,
// buildings from the district table (one or two per block, with skyline
// towers), hand-placed POI buildings + the garage interior, lighthouse,
// Ferris wheel towers, pier, dense palm rows, shade trees, streetlights
// (+ night pools), traffic-light poles, hydrants, benches, planters,
// roadside props, market stalls, dock containers, billboards, boats,
// beach dressing, Rambla Park, and rain puddles. Deterministic: one
// seeded RNG stream, fixed order. Returns { chunks, puddles, lampPools,
// colliders } — the static world, merged into a few chunks.

import { TAU, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';
import {
  AVENUES, BEACH_Z, BOAT_SPOTS, CITY, DISTRICTS, ISLAND, POI,
  ROAD_W, STREETS, TRAFFIC_LIGHTS, WATER_Z, WET_SEED, districtAt, lightHeads,
} from './citydata.js';
import { Chunked, buildBuilding } from './buildings.js';
import { buildPalm, buildShadeTree, buildStreetlight } from './greenery.js';
import {
  BILLBOARD_SPOTS, buildBeachKiosk, buildBeachUmbrella, buildBillboard,
  buildBoat, buildContainer, buildLifeguardTower, buildLoungeChair,
  buildMarketStall, buildSurfboard, buildTowel, buildVolleyballNet,
  nearBillboard,
} from './props.js';
import {
  buildBarrier, buildBench, buildBikeRack, buildBusStop, buildHydrant,
  buildMailbox, buildNewsstand, buildPark, buildParkingMeter, buildPlanter,
  buildStreetSign, buildStringLights, buildTrafficLightPole, buildTrashCan,
  buildVendorCart,
} from './streetprops.js';

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
