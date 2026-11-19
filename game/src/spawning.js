// spawning.js — Paloma Bay: entity spawns + world setup.
// Every entity in the game is born here (cars, pedestrians, enemies, jet
// skis, police boats) and initWorld builds the static city, uploads every
// shared mesh, and seeds the opening traffic, pedestrians and parked cars.
// The mesh caches live in state.js (`meshes`); the traffic-light phase
// signature comes from traffic.js.

import { TAU, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';
import { discBlob, uploadBlob, uploadMesh } from './render.js';
import { AVENUES } from './citydata.js';
import { buildWorld } from './worldbuild.js';
import { buildBeacon, buildFerrisWheel, buildPostcardMarker, buildTrafficLightLamps } from './streetprops.js';
import {
  CAR_MODELS, buildCarBody, buildCarGlass, buildHelicopter, buildJetSki,
  buildLightBar, buildPoliceBoat, buildWheel,
} from './vehicles.js';
import { randomLook } from './characters.js';
import { buildAmmoPickup, buildMuzzleFlash } from './weapons.js';
import { G, JETSKI_COLORS, boats, cars, enemies, jetskis, meshes, peds } from './state.js';
import { lightSignature } from './traffic.js';
import { updateMissionBeacon } from './missionflow.js';

export function carBodyMesh(model, colorIdx) {
  const key = model + ':' + colorIdx;
  if (!meshes.carBodyCache.has(key)) {
    const m = CAR_MODELS[model];
    meshes.carBodyCache.set(key, uploadMesh(buildCarBody(m, m.colors[colorIdx % m.colors.length]), false));
  }
  return meshes.carBodyCache.get(key);
}
export function carGlassMesh(model) {
  if (!meshes.carGlassCache.has(model)) {
    meshes.carGlassCache.set(model, uploadMesh(buildCarGlass(CAR_MODELS[model]), false));
  }
  return meshes.carGlassCache.get(model);
}

export function spawnCar(model, colorIdx, x, z, yaw, kind, ai) {
  const car = {
    model, colorIdx: colorIdx || 0, x, z, yaw, speed: 0, steer: 0,
    spin: 0, hp: 100, kind: kind || 'parked', ai: ai || null,
    targetYaw: yaw, stuckT: 0,
  };
  cars.push(car);
  return car;
}

export function spawnPed(x, z, path, opts) {
  const ped = {
    look: randomLook(Math.floor(Math.random() * 100000), (opts && opts.kind) || 'ped'),
    x, z, yaw: Math.random() * TAU, speed: 1.2 + Math.random() * 0.5,
    phase: Math.random() * 10, dist: 0, path, pathI: 0,
    flee: 0, hp: 50, dead: false, deadT: 0,
    cross: (opts && opts.cross) || null, // { av, st }: crosswalk user (waits on red)
    walking: 1,
  };
  peds.push(ped);
  return ped;
}

// A pedestrian who crosses the avenue at a signaled intersection's painted
// crosswalk (z = st - 5), waiting on the kerb while avenue traffic is green.
export function spawnCrossingPed(av, st) {
  return spawnPed(av - 8, st - 5, [[av - 8, st - 5], [av + 8, st - 5]], { cross: { av, st } });
}

export function spawnJetSki(x, z, yaw, colorIdx) {
  const ski = {
    x, z, yaw, speed: 0, steer: 0,
    colorIdx: colorIdx || 0, bobPhase: Math.random() * TAU, wakeT: 0,
  };
  jetskis.push(ski);
  return ski;
}

// PBPD marine unit: a police boat that chases the player's jet ski. Only
// one exists at a time (spawned by mission 4's sea chase or by staging).
export function spawnPoliceBoat(x, z, yaw) {
  const boat = {
    x, z, yaw, speed: 0, steer: 0,
    bobPhase: Math.random() * TAU, wakeT: 0,
  };
  boats.push(boat);
  return boat;
}

export function spawnEnemy(x, z, kind, weapon) {
  const e = {
    look: randomLook(Math.floor(Math.random() * 100000), kind || 'thug'),
    x, z, yaw: 0, hp: 100, weapon: weapon || 'pistol',
    state: 'approach', fireTimer: 1 + Math.random(),
    kind: kind || 'thug', dead: false, deadT: 0, phase: 0, dist: 0,
    speed: 0, walking: 0, aiming: 0,
    flashTimer: 0, flashAt: null, tracerTimer: 0, tracerFrom: null, tracerTo: null,
  };
  enemies.push(e);
  return e;
}

export function initWorld() {
  const world = buildWorld();
  G.colliders = world.colliders;
  meshes.staticMeshes = world.chunks.map((c) => uploadMesh(c, false));
  meshes.puddleMesh = uploadMesh(world.puddles, false);
  meshes.lampPoolMesh = uploadMesh(world.lampPools, false);
  meshes.wheelMesh = uploadMesh(buildWheel(), false);
  {
    // Siren light bar: red left half + blue right half, each in a bright
    // and a dim variant — the draw loop alternates which side is bright,
    // so both colours always read (even in a frozen screenshot).
    const lb = buildLightBar();
    meshes.lightBarMeshes = {
      redBright: uploadMesh(lb.redBright, false),
      redDim: uploadMesh(lb.redDim, false),
      blueBright: uploadMesh(lb.blueBright, false),
      blueDim: uploadMesh(lb.blueDim, false),
    };
  }
  const heli = buildHelicopter();
  meshes.heliMeshes = {
    body: uploadMesh(heli.body, false),
    rotor: uploadMesh(heli.rotor, false),
    tailRotor: uploadMesh(heli.tailRotor, false),
    cone: uploadMesh(heli.cone, false),
  };
  meshes.beaconMesh = uploadMesh(buildBeacon(), false);
  meshes.postcardMesh = uploadMesh(buildPostcardMarker(), false);
  meshes.ammoMesh = uploadMesh(buildAmmoPickup(), false);
  meshes.flashMesh = uploadMesh(buildMuzzleFlash(), false);
  {
    const tb = new MeshBuilder();
    tb.setMat(MAT.EMIT).setColor(1.0, 0.9, 0.5);
    tb.box(-0.5, -0.02, -0.02, 0.5, 0.02, 0.02);
    meshes.tracerMesh = uploadMesh(tb.build(), false);
  }
  // Enemy marker: two crossed downward triangles (bright red with a
  // white core), so the arrow reads from any viewing angle.
  {
    const mb = new MeshBuilder();
    mb.setMat(MAT.EMIT).setColor(1.0, 0.12, 0.12);
    mb.tri3([-0.38, 0.32, 0], [0.38, 0.32, 0], [0, -0.36, 0]);
    mb.tri3([0, 0.32, -0.38], [0, 0.32, 0.38], [0, -0.36, 0]);
    mb.setColor(1.0, 1.0, 1.0);
    mb.tri3([-0.20, 0.22, 0.02], [0.20, 0.22, 0.02], [0, -0.18, 0.02]);
    mb.tri3([-0.20, 0.22, -0.02], [0.20, 0.22, -0.02], [0, -0.18, -0.02]);
    mb.tri3([0.02, 0.22, -0.20], [0.02, 0.22, 0.20], [0.02, -0.18, 0]);
    mb.tri3([-0.02, 0.22, -0.20], [-0.02, 0.22, 0.20], [-0.02, -0.18, 0]);
    meshes.markerMesh = uploadMesh(mb.build(), false);
  }
  meshes.ferrisMesh = uploadMesh(buildFerrisWheel(), false);
  meshes.carBlobMesh = uploadBlob(discBlob(2.8, 1.6, 24));
  meshes.charBlobMesh = uploadBlob(discBlob(0.55, 0.45, 16));
  meshes.spotBlobMesh = uploadBlob(discBlob(5, 5, 24));
  meshes.rainMesh = uploadMesh(new MeshBuilder().build(), true);
  // Traffic-light lamps: one dynamic mesh, rebuilt whenever any phase flips.
  meshes.lightLampMesh = uploadMesh(buildTrafficLightLamps(0, G.lightOverrides).build(), true);
  meshes.lightLampSig = lightSignature(0);
  // Jet skis: one mesh per colour. Police boat: one shared hull.
  meshes.jetskiMeshes = JETSKI_COLORS.map((c) => uploadMesh(buildJetSki(c), false));
  meshes.policeBoatMesh = uploadMesh(buildPoliceBoat(), false);
  // Parked cars along the streets (stealable).
  const rng = rng32(99);
  const models = ['sedan', 'sedan', 'coupe', 'muscle', 'suv', 'van', 'taxi'];
  for (let i = 0; i < 12; i++) {
    const av = AVENUES[Math.floor(rng() * AVENUES.length)];
    const z = -95 + rng() * 185;
    spawnCar(models[i % models.length], Math.floor(rng() * 3), av + 5.6, z, rng() > 0.5 ? 0 : Math.PI, 'parked');
  }
  // Theo's taxi at the safehouse.
  spawnCar('taxi', 0, 15, -52, Math.PI, 'parked'); // Marlin Cab: faces west along the street, toward the first mission — never nose-first into the block's buildings.
  // Traffic cars on the roads.
  for (let i = 0; i < 8; i++) {
    const av = AVENUES[Math.floor(rng() * AVENUES.length)];
    const z = -95 + rng() * 185;
    const c = spawnCar(models[Math.floor(rng() * models.length)], Math.floor(rng() * 3), av, z, rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2, 'traffic');
    c.ai = { road: 'avenue', at: av, dir: c.yaw > 0 ? 1 : -1, speed: 10 + rng() * 4 };
  }
  // Pedestrians on sidewalk loops.
  for (let i = 0; i < 12; i++) {
    const sx = AVENUES[Math.floor(rng() * AVENUES.length)] + 6;
    const sz = -95 + rng() * 185;
    const path = [
      [sx, sz], [sx, sz + 30], [sx + 30, sz + 30], [sx + 30, sz],
    ];
    spawnPed(sx, sz, path);
  }
  // Crosswalk users: they cross at the painted stripes and wait on the
  // kerb while their road is green.
  spawnCrossingPed(0, 50);
  spawnCrossingPed(60, 0);
  spawnCrossingPed(-60, 50);
  spawnCrossingPed(60, 100);
  // Beachgoers strolling the sand (bright swim colours, sunhats).
  spawnPed(20, 115, [[20, 115], [60, 118]], { kind: 'beach' });
  spawnPed(70, 116, [[70, 116], [110, 117]], { kind: 'beach' });
  spawnPed(-40, 114, [[-40, 114], [-10, 117]], { kind: 'beach' });
  spawnPed(100, 120, [[100, 120], [130, 118]], { kind: 'beach' });
  // Jet skis moored at the waterline, facing the open bay.
  spawnJetSki(24, 142.5, -Math.PI / 2, 0);
  spawnJetSki(44, 143.5, -Math.PI / 2, 1);
  spawnJetSki(-36, 142.5, -Math.PI / 2, 2);
  spawnJetSki(10, 145.5, -Math.PI / 2, 3);
  updateMissionBeacon();
}
