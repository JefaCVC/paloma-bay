// citydata.js — Paloma Bay: the city as data.
// Every fixed fact about the city lives here and nowhere else: the road
// grid, the seven districts (one parameter table drives the whole look),
// the points of interest, the 20 postcards, the signaled intersections
// and their phases, the anchored boats, and the circle-vs-AABB collision
// helper the gameplay code uses. Pure data + pure functions: no meshes,
// no WebGL, no DOM. The builders (buildings.js, props.js, streetprops.js,
// greenery.js) and the assembler (worldbuild.js) read this module.
// All fictional names are original to this game.

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
  { name: 'Porto Lumen', sub: 'THE OLD HARBOUR', region: [-175, -125, -60, 60], style: 2, hMin: 6, hMax: 12,
    palette: [[0.72, 0.66, 0.58], [0.55, 0.68, 0.78], [0.78, 0.70, 0.55], [0.88, 0.80, 0.62]] },
  { name: 'Ciudad Vieja', sub: 'OLD TOWN', region: [-120, -60, -105, -45], style: 0, hMin: 8, hMax: 16,
    palette: [[0.85, 0.72, 0.55], [0.92, 0.55, 0.42], [0.88, 0.78, 0.62], [0.80, 0.62, 0.48]] },
  { name: 'North Docks', sub: 'THE DOCKS', region: [-60, 60, -155, -100], style: 1, hMin: 7, hMax: 13,
    palette: [[0.55, 0.55, 0.58], [0.48, 0.50, 0.55], [0.62, 0.58, 0.52]] },
  { name: 'Palm Heights', sub: 'SKYLINE ROW', region: [60, 175, -105, 0], style: 1, hMin: 16, hMax: 38,
    palette: [[0.72, 0.76, 0.80], [0.65, 0.70, 0.75], [0.80, 0.78, 0.72], [0.55, 0.68, 0.82]] },
  { name: 'Barrio Sol', sub: 'SUNSET BLOCKS', region: [-60, 0, 0, 100], style: 2, hMin: 6, hMax: 11,
    palette: [[0.85, 0.68, 0.45], [0.78, 0.55, 0.42], [0.90, 0.75, 0.55], [0.92, 0.60, 0.60], [0.45, 0.72, 0.68]] },
  { name: 'La Rambla', sub: 'BEACHFRONT', region: [-120, 175, 50, 100], style: 0, hMin: 9, hMax: 20,
    palette: [[0.95, 0.55, 0.45], [0.45, 0.75, 0.72], [0.95, 0.88, 0.70], [0.95, 0.80, 0.40], [0.95, 0.65, 0.70], [0.60, 0.85, 0.70]] },
  { name: 'Isla Verde', sub: 'THE ISLAND', region: [-62, 62, 158, 242], style: 0, hMin: 5, hMax: 9,
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

// Full district record for a point (or null outside all regions) — used by
// the district intro card, which needs the name + subtitle together.
export function districtInfo(x, z) {
  for (const d of DISTRICTS) {
    const [x0, x1, z0, z1] = d.region;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return d;
  }
  return null;
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

// --- Rambla Park ---------------------------------------------------------------
// The green pocket park on the beachfront block (x 30–54, z 57–93), on the
// lot where the second building of that block would have stood. Exported
// so the minimap + full map draw it as green.
export const PARK = { x0: 30, x1: 54, z0: 57, z1: 93, name: 'Rambla Park' };

// --- traffic lights ------------------------------------------------------------
// Signaled intersections: the avenue (x) and street (z) that cross, plus a
// phase offset so neighbouring lights don't flip in lockstep. Cycle 28s:
// NS green 12s, NS yellow 2s, EW green 12s, EW yellow 2s. The poles + head
// boxes are static (merged into the world); the LAMPS are one dynamic mesh
// rebuilt by traffic.js whenever any phase flips. Traffic AI stops at red;
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

// --- boats (anchored offshore) -------------------------------------------------
// Sailboats and motorboats floating at the waterline. They sit still —
// anchored boats barely move at this scale — but they make the bay read as
// used water, not a flat blue plane. driving.js reuses BOAT_SPOTS as
// circular obstacles for the jet ski.
export const BOAT_SPOTS = [
  { x: -80, z: 165, yaw: 0.4, kind: 'sail', seed: 1 },
  { x: -30, z: 178, yaw: -0.3, kind: 'motor', seed: 2 },
  { x: 30, z: 168, yaw: 0.9, kind: 'sail', seed: 3 },
  { x: 90, z: 180, yaw: -0.6, kind: 'motor', seed: 4 },
  { x: 140, z: 162, yaw: 0.2, kind: 'sail', seed: 5 },
  { x: -196, z: 34, yaw: 1.2, kind: 'sail', seed: 6 }, // off the Porto Lumen pier
  { x: -202, z: -12, yaw: -0.8, kind: 'motor', seed: 7 },
];

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
