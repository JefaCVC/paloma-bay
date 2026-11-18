// game.js — PALOMA BAY main game.
// Integrates everything: the city (world.js), vehicles, characters, weapons,
// missions, police, audio, saves and HUD. One module, one game state object.
// Playable with keyboard + mouse; deterministic ?shot= modes stage the four
// screenshots (see shots.js). All UI text is English; all names are original.

import { TAU, clamp, damp, frame, lerp, m4, rng32, v3, wrapAngle } from './math.js';
import { sky, updateSky } from './sky.js';
import { MAT, MeshBuilder } from './mesh.js';
import {
  beginFrame, camPos, drawBlob, drawLit, drawSky, initGL,
  offsetBlob, mergeBlobs, discBlob, starBlob, resizeCanvas,
  updateMesh, uploadBlob, uploadMesh,
} from './render.js';
import {
  AVENUES, CITY, ISLAND, POI, POSTCARDS, STREETS, WATER_Z,
  buildBeacon, buildFerrisWheel, buildPostcardMarker, buildWorld,
  collideCircle, districtAt,
} from './world.js';
import {
  CAR_MODELS, buildCarBody, buildCarGlass, buildHelicopter,
  buildLightBar, buildWheel,
} from './vehicles.js';
import { CHAR, GAIT_K, MARA_LOOK, THEO_LOOK, buildCharacter, muzzlePos, randomLook } from './characters.js';
import { WEAPONS, WEAPON_ORDER, buildAmmoPickup, buildMuzzleFlash, damageAt } from './weapons.js';
import {
  ENDINGS, FINALES, MISSIONS, REP_TITLES, advanceStage, applyChoice, completeMission,
  completionPercent, computeEnding, currentStage, isUnlocked, missionById,
  startMission,
} from './missions.js';
import {
  CRIME_HEAT, MAX_WANTED, addHeat, anyUnitSees, clearWanted,
  createPolice, setWanted, syncUnits, updatePolice,
} from './police.js';
import {
  currentStation, currentTrack, initAudio, isMuted, nextStation,
  setMuted, sfxCash, sfxClick, sfxHit, sfxHorn, sfxMissionComplete,
  sfxPickup, sfxShoot, sfxWasted, updateAudio,
} from './audio.js';
import { createGameState, hasSave, loadGame, saveGame, saveSlotInfo } from './save.js';
import { createInput, exitPointerLock, requestPointerLock } from './input.js';
import {
  fillDeadScreen, fillEndingScreen, fillPauseScreen, fillShopScreen,
  hideChoices, hideDialog, initHUD, showBanner, showChoices, showDialog,
  showScreen, toast, updateHUD,
} from './hud.js';
import { stageShot } from './shots.js';

// ============================================================================
// Game state
// ============================================================================
const G = {
  mode: 'title', // title | play | pause | shop | ending | dead
  state: createGameState(),
  police: createPolice(),
  input: createInput(),
  time: 0, // seconds since load (render clock)
  gameTime: 0, // seconds of play (drives police timers, chatter)
  hour: 18.2,
  day: 1,
  rain: 0,
  rainTarget: 0,
  rainTimer: 40,
  shopKind: null,
  dialogAdvance: null, // called when the player advances a dialog stage
  choicePending: null,
  missionBeacon: null, // { x, z } of the next mission start
  interactTarget: null, // { type, ... } nearest interaction
  bustedTimer: 0,
  lastDamageT: -99,
  nitroTimer: 0, // >0 while boosting
  nitroCooldown: 0,
  maraCooldown: 0,
  camera: { yaw: 0, pitch: 0.35, dist: 8, fov: 60, orbit: 0 },
  freezeT: null, // set in ?shot= mode: render one frozen frame
  shotName: null,
};

const profile = () => G.state.profile;
const missions = () => G.state.missions;

// Player: on foot or in a car. Position is always world (x, z); y = 0.
const player = {
  x: 15, z: -45, yaw: 0, speed: 0, vx: 0, vz: 0,
  hp: 100, inCar: false, car: null,
  phase: 0, dist: 0, walking: 0, aiming: 0, aimYaw: 0,
  reloadTimer: 0, fireTimer: 0, swing: 0, swingTimer: 0,
  flashTimer: 0, flashAt: null, tracerTimer: 0, tracerFrom: null, tracerTo: null,
};

// --- entities -----------------------------------------------------------------
const cars = []; // { model, color, x, z, yaw, speed, steer, spin, hp, kind, ai }
const peds = []; // { look, x, z, yaw, speed, phase, dist, path, pathI, flee, hp, dead, deadT }
const enemies = []; // { look, x, z, yaw, hp, weapon, state, fireTimer, kind, dead, deadT, phase, dist }
const pickups = []; // { kind: 'ammo', weapon, x, z, t }
const tracers = []; // transient, drawn for 60ms

// Mesh caches.
const carBodyCache = new Map(); // "model:colorIdx" -> mesh
const carGlassCache = new Map(); // "model" -> mesh
let wheelMesh = null;
let lightBarMeshes = null;
let heliMeshes = null;
let beaconMesh = null;
let postcardMesh = null;
let ammoMesh = null;
let flashMesh = null;
let tracerMesh = null; // unit tracer (1 unit long), scaled per shot
let ferrisMesh = null;
let staticMeshes = [];
let puddleMesh = null;
let carBlobMesh = null;
let charBlobMesh = null;
let spotBlobMesh = null;
let rainMesh = null;
let colliders = [];
let charMeshes = new Map(); // entity -> dynamic mesh

const canvas = document.getElementById('c');
const errEl = document.getElementById('load-error');
function showError(msg) {
  errEl.textContent = msg;
  errEl.style.display = 'block';
  console.error(msg);
}

// ============================================================================
// Setup
// ============================================================================
function carBodyMesh(model, colorIdx) {
  const key = model + ':' + colorIdx;
  if (!carBodyCache.has(key)) {
    const m = CAR_MODELS[model];
    carBodyCache.set(key, uploadMesh(buildCarBody(m, m.colors[colorIdx % m.colors.length]), false));
  }
  return carBodyCache.get(key);
}
function carGlassMesh(model) {
  if (!carGlassCache.has(model)) {
    carGlassCache.set(model, uploadMesh(buildCarGlass(CAR_MODELS[model]), false));
  }
  return carGlassCache.get(model);
}

function spawnCar(model, colorIdx, x, z, yaw, kind, ai) {
  const car = {
    model, colorIdx: colorIdx || 0, x, z, yaw, speed: 0, steer: 0,
    spin: 0, hp: 100, kind: kind || 'parked', ai: ai || null,
    targetYaw: yaw, stuckT: 0,
  };
  cars.push(car);
  return car;
}

function spawnPed(x, z, path) {
  const ped = {
    look: randomLook(Math.floor(Math.random() * 100000), 'ped'),
    x, z, yaw: Math.random() * TAU, speed: 1.2 + Math.random() * 0.5,
    phase: Math.random() * 10, dist: 0, path, pathI: 0,
    flee: 0, hp: 50, dead: false, deadT: 0,
  };
  peds.push(ped);
  return ped;
}

function spawnEnemy(x, z, kind, weapon) {
  const e = {
    look: randomLook(Math.floor(Math.random() * 100000), kind || 'thug'),
    x, z, yaw: 0, hp: 100, weapon: weapon || 'pistol',
    state: 'approach', fireTimer: 1 + Math.random(),
    kind: kind || 'thug', dead: false, deadT: 0, phase: 0, dist: 0,
    speed: 0, walking: 0, aiming: 0,
  };
  enemies.push(e);
  return e;
}

function initWorld() {
  const world = buildWorld();
  colliders = world.colliders;
  staticMeshes = world.chunks.map((c) => uploadMesh(c, false));
  puddleMesh = uploadMesh(world.puddles, false);
  wheelMesh = uploadMesh(buildWheel(), false);
  lightBarMeshes = {
    red: uploadMesh(buildLightBar().red, false),
    blue: uploadMesh(buildLightBar().blue, false),
  };
  const heli = buildHelicopter();
  heliMeshes = {
    body: uploadMesh(heli.body, false),
    rotor: uploadMesh(heli.rotor, false),
    tailRotor: uploadMesh(heli.tailRotor, false),
    cone: uploadMesh(heli.cone, false),
  };
  beaconMesh = uploadMesh(buildBeacon(), false);
  postcardMesh = uploadMesh(buildPostcardMarker(), false);
  ammoMesh = uploadMesh(buildAmmoPickup(), false);
  flashMesh = uploadMesh(buildMuzzleFlash(), false);
  {
    const tb = new MeshBuilder();
    tb.setMat(MAT.EMIT).setColor(1.0, 0.9, 0.5);
    tb.box(-0.5, -0.02, -0.02, 0.5, 0.02, 0.02);
    tracerMesh = uploadMesh(tb.build(), false);
  }
  ferrisMesh = uploadMesh(buildFerrisWheel(), false);
  carBlobMesh = uploadBlob(discBlob(2.8, 1.6, 24));
  charBlobMesh = uploadBlob(discBlob(0.55, 0.45, 16));
  spotBlobMesh = uploadBlob(discBlob(5, 5, 24));
  rainMesh = uploadMesh(new MeshBuilder().build(), true);
  // Parked cars along the streets (stealable).
  const rng = rng32(99);
  const models = ['sedan', 'sedan', 'coupe', 'suv', 'van', 'taxi'];
  for (let i = 0; i < 12; i++) {
    const av = AVENUES[Math.floor(rng() * AVENUES.length)];
    const z = -95 + rng() * 185;
    spawnCar(models[i % models.length], Math.floor(rng() * 3), av + 5.6, z, rng() > 0.5 ? 0 : Math.PI, 'parked');
  }
  // Theo's taxi at the safehouse.
  spawnCar('taxi', 0, 15, -52, Math.PI / 2, 'parked');
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
  updateMissionBeacon();
}

function updateMissionBeacon() {
  const ms = missions();
  if (ms.active || ms.nextId > 8) {
    G.missionBeacon = null;
    return;
  }
  const m = missionById(ms.nextId);
  if (!m) {
    G.missionBeacon = null;
    return;
  }
  const first = m.stages[0];
  if (first && first.x !== undefined) {
    G.missionBeacon = { x: first.x, z: first.z, missionId: m.id, name: m.name };
  } else {
    G.missionBeacon = { x: POI.garage.x, z: POI.garage.z + 14, missionId: m.id, name: m.name };
  }
}

// ============================================================================
// Player: on foot
// ============================================================================
function updateOnFoot(dt) {
  const input = G.input;
  const camYaw = G.camera.yaw;
  let mx = 0, mz = 0;
  if (input.down('KeyW')) { mx += Math.cos(camYaw); mz += -Math.sin(camYaw); }
  if (input.down('KeyS')) { mx -= Math.cos(camYaw); mz -= -Math.sin(camYaw); }
  if (input.down('KeyA')) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (input.down('KeyD')) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
  const moving = mx !== 0 || mz !== 0;
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const targetSpeed = moving ? (sprint ? 6.5 : 4.2) : 0;
  player.speed = damp(player.speed, targetSpeed, 8, dt);
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    const wantYaw = Math.atan2(-mz, mx);
    player.yaw = player.yaw + wrapAngle(wantYaw - player.yaw) * Math.min(1, 10 * dt);
    const nx = player.x + mx * player.speed * dt;
    const nz = player.z + mz * player.speed * dt;
    const pos = [nx, 0, nz];
    collideCircle(colliders, pos, 0.5);
    const moved = Math.hypot(pos[0] - player.x, pos[2] - player.z);
    player.dist += moved;
    player.x = pos[0];
    player.z = pos[2];
    player.phase = GAIT_K * player.dist;
  }
  player.walking = damp(player.walking, moving ? 1 : 0, 8, dt);
  // Aim: right mouse held, or always slightly when firing.
  const wantAim = input.rightDown || input.mouseDown ? 1 : 0;
  player.aiming = damp(player.aiming, wantAim, 10, dt);
  if (player.aiming > 0.3) {
    player.aimYaw = camYaw;
    player.yaw = player.yaw + wrapAngle(player.aimYaw - player.yaw) * Math.min(1, 12 * dt);
  }
  // Camera yaw from the mouse.
  if (input.locked) {
    G.camera.yaw -= input.mouseDX * 0.0028;
    G.camera.pitch = clamp(G.camera.pitch + input.mouseDY * 0.0022, -0.05, 0.9);
  } else if (moving && player.aiming < 0.3) {
    G.camera.yaw = G.camera.yaw + wrapAngle(player.yaw - G.camera.yaw) * Math.min(1, 2 * dt);
  }
  // Weapon switching.
  for (let i = 0; i < WEAPON_ORDER.length; i++) {
    if (input.hit('Digit' + (i + 1))) {
      const id = WEAPON_ORDER[i];
      if (profile().loadout.owned[id].owned) {
        profile().loadout.current = id;
        sfxClick();
      }
    }
  }
  if (input.wheel !== 0) {
    const owned = WEAPON_ORDER.filter((id) => profile().loadout.owned[id].owned);
    const cur = owned.indexOf(profile().loadout.current);
    const next = owned[(cur + (input.wheel > 0 ? 1 : -1) + owned.length) % owned.length];
    if (next) profile().loadout.current = next;
  }
  // Reload.
  if (input.hit('KeyR')) reloadWeapon();
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) finishReload();
  }
  // Fire.
  player.fireTimer -= dt;
  const w = WEAPONS[profile().loadout.current];
  const wantFire = w.auto ? input.mouseDown : input.mousePressed;
  if (wantFire && player.fireTimer <= 0 && player.reloadTimer <= 0) {
    fireWeapon();
  }
  // Melee swing decay.
  if (player.swingTimer > 0) {
    player.swingTimer -= dt;
    player.swing = Math.max(0, player.swingTimer / 0.4);
  }
  if (player.flashTimer > 0) player.flashTimer -= dt;
  if (player.tracerTimer > 0) player.tracerTimer -= dt;
}

function reloadWeapon() {
  const loadout = profile().loadout;
  const w = WEAPONS[loadout.current];
  if (w.melee) return;
  const slot = loadout.owned[loadout.current];
  if (slot.mag >= w.mag || slot.reserve <= 0 || player.reloadTimer > 0) return;
  player.reloadTimer = 0.8;
}

function finishReload() {
  const loadout = profile().loadout;
  const w = WEAPONS[loadout.current];
  const slot = loadout.owned[loadout.current];
  const need = w.mag - slot.mag;
  const take = Math.min(need, slot.reserve);
  slot.mag += take;
  slot.reserve -= take;
}

function fireWeapon() {
  const loadout = profile().loadout;
  const w = WEAPONS[loadout.current];
  const slot = loadout.owned[loadout.current];
  player.fireTimer = 1 / w.rate;
  if (w.melee) {
    player.swing = 1;
    player.swingTimer = 0.4;
    sfxShoot('bat');
    // Melee arc: hit the nearest enemy/ped within range and 60° of facing.
    const fx = Math.cos(player.yaw), fz = -Math.sin(player.yaw);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x, dz = e.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < w.range && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.5) {
        damageEnemy(e, w.dmg, player.x, player.z);
      }
    }
    return;
  }
  if (slot.mag <= 0) {
    reloadWeapon();
    return;
  }
  slot.mag--;
  sfxShoot(loadout.current);
  const muzzle = muzzlePos(player.x, 0, player.z, player.yaw, 0.6);
  player.flashAt = muzzle;
  player.flashTimer = 0.06;
  // Hitscan: one ray per pellet, spread around the aim yaw.
  let hitAny = false;
  for (let p = 0; p < w.pellets; p++) {
    const yaw = player.yaw + (Math.random() - 0.5) * 2 * w.spread;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    let bestD = w.range;
    let bestTarget = null;
    let bestKind = null;
    const testCircle = (x, z, r, kind, obj) => {
      const dx = x - player.x, dz = z - player.z;
      const along = dx * fx + dz * fz;
      if (along < 0 || along > bestD) return;
      const perp = Math.abs(dx * -fz + dz * fx);
      if (perp < r) {
        bestD = along;
        bestTarget = obj;
        bestKind = kind;
      }
    };
    for (const e of enemies) if (!e.dead) testCircle(e.x, e.z, 0.6, 'enemy', e);
    for (const pd of peds) if (!pd.dead) testCircle(pd.x, pd.z, 0.6, 'ped', pd);
    for (const c of cars) testCircle(c.x, c.z, 2.0, 'car', c);
    // Buildings block shots: coarse check against colliders.
    for (const b of colliders) {
      const cx = clamp(player.x + fx * bestD * 0.5, b.x0, b.x1);
      const cz = clamp(player.z + fz * bestD * 0.5, b.z0, b.z1);
      const dx = cx - player.x, dz = cz - player.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < bestD && Math.abs(dx * -fz + dz * fx) < 1.5) {
        bestD = along;
        bestTarget = null;
        bestKind = 'wall';
      }
    }
    const hitPoint = [player.x + fx * bestD, 1.2, player.z + fz * bestD];
    if (p === 0) {
      player.tracerFrom = muzzle;
      player.tracerTo = hitPoint;
      player.tracerTimer = 0.06;
    }
    if (bestTarget) {
      hitAny = true;
      const dmg = damageAt(loadout.current, bestD);
      if (bestKind === 'enemy') damageEnemy(bestTarget, dmg, player.x, player.z);
      else if (bestKind === 'ped') damagePed(bestTarget, dmg);
      else if (bestKind === 'car') damageCar(bestTarget, dmg * 0.5);
    }
  }
  if (hitAny) sfxHit();
  // Shooting near a cop draws heat.
  if (G.police.wanted < MAX_WANTED) {
    const nearCop = G.police.units.some((u) => v3.dist2([u.x, 0, u.z], [player.x, 0, player.z]) < 45);
    if (nearCop) addHeat(G.police, CRIME_HEAT.shootNearCop, G.gameTime);
  }
}

function damageEnemy(e, dmg, fromX, fromZ) {
  e.hp -= dmg;
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    e.deadT = G.time;
    profile().stats.kills++;
    if (Math.random() < 0.5) {
      pickups.push({ kind: 'ammo', weapon: e.weapon, x: e.x, z: e.z, t: G.time });
    }
    if (e.kind === 'cop') addHeat(G.police, CRIME_HEAT.killCop, G.gameTime);
  }
}

function damagePed(pd, dmg) {
  pd.hp -= dmg;
  pd.flee = 6;
  if (pd.hp <= 0 && !pd.dead) {
    pd.dead = true;
    pd.deadT = G.time;
    addHeat(G.police, CRIME_HEAT.killPed, G.gameTime);
    toast('A pedestrian is down. The PBPD was notified.');
  }
}

function damageCar(car, dmg) {
  car.hp -= dmg;
  if (car.hp <= 0 && car.hp + dmg > 0) {
    car.speed = 0;
    if (car === player.car) toast('Your car is wrecked. Find another ride.');
  }
}

function damagePlayer(dmg, fromX, fromZ) {
  player.hp -= dmg;
  G.lastDamageT = G.gameTime;
  if (player.hp <= 0) {
    player.hp = 0;
    wasted();
  }
}

function wasted() {
  const cost = Math.min(200, profile().cash);
  profile().cash -= cost;
  clearWanted(G.police);
  failActiveMission();
  exitPointerLock();
  G.mode = 'dead';
  fillDeadScreen('wasted');
  showScreen('dead-screen');
  sfxWasted();
}

function busted() {
  const cost = Math.min(250, profile().cash);
  profile().cash -= cost;
  clearWanted(G.police);
  failActiveMission();
  exitPointerLock();
  G.mode = 'dead';
  fillDeadScreen('busted');
  showScreen('dead-screen');
}

function failActiveMission() {
  if (missions().active) {
    missions().active = null;
    enemies.length = 0;
    updateMissionBeacon();
    toast('MISSION FAILED — return to the marker to retry.');
  }
}

function respawnPlayer() {
  player.hp = 100;
  player.x = POI.safehouse.x;
  player.z = POI.safehouse.z + 10;
  player.yaw = 0;
  player.inCar = false;
  player.car = null;
  player.speed = 0;
  G.mode = 'play';
  showScreen(null);
}

// ============================================================================
// Player: driving
// ============================================================================
function enterCar(car) {
  player.inCar = true;
  player.car = car;
  car.kind = 'player';
  player.x = car.x;
  player.z = car.z;
  player.yaw = car.yaw;
  G.camera.yaw = car.yaw;
  if (car.hp <= 0) car.hp = 20;
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  player.inCar = false;
  player.car = null;
  const rx = Math.sin(car.yaw), rz = Math.cos(car.yaw);
  player.x = car.x + rx * 2.2;
  player.z = car.z + rz * 2.2;
  player.yaw = car.yaw;
  player.speed = 0;
}

function updateDriving(dt) {
  const input = G.input;
  const car = player.car;
  if (!car) return;
  const model = CAR_MODELS[car.model];
  const ups = profile().upgrades;
  const topSpeed = model.topSpeed * (ups.engine ? 1.25 : 1) * (G.nitroTimer > 0 ? 1.35 : 1);
  const accel = model.accel * (ups.engine ? 1.2 : 1);
  // Steering: less at speed, more with handbrake (drift).
  const handbrake = input.down('Space');
  const steerInput = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
  const speedFactor = clamp(1 - Math.abs(car.speed) / (topSpeed * 1.6), 0.25, 1);
  car.steer = damp(car.steer, steerInput * speedFactor * (handbrake ? 1.5 : 1), 8, dt);
  if (input.down('KeyW')) car.speed += accel * dt;
  if (input.down('KeyS')) car.speed -= (car.speed > 0.5 ? accel * 1.6 : accel * 0.6) * dt;
  if (!input.down('KeyW') && !input.down('KeyS')) {
    car.speed = damp(car.speed, 0, handbrake ? 2.5 : 0.4, dt);
  }
  car.speed = clamp(car.speed, -10, topSpeed);
  if (handbrake) car.speed = damp(car.speed, car.speed * 0.6, 3, dt);
  // Yaw follows steering * speed (arcade bicycle-ish).
  const yawRate = car.steer * (car.speed / 3.2) * model.grip * 0.35;
  car.yaw += yawRate * dt;
  // Nitro.
  if (G.nitroCooldown > 0) G.nitroCooldown -= dt;
  if (G.nitroTimer > 0) G.nitroTimer -= dt;
  if (input.down('ShiftLeft') && ups.nitro && G.nitroCooldown <= 0 && car.speed > 8) {
    G.nitroTimer = 1.6;
    G.nitroCooldown = 6;
  }
  // Move + collide.
  const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw);
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;
  const pos = [nx, 0, nz];
  const hit = collideCircle(colliders, pos, 2.0);
  if (hit) {
    const impact = Math.abs(car.speed);
    car.speed *= 0.35;
    if (impact > 12) {
      damageCar(car, impact * 0.8);
      sfxHit();
    }
  }
  // Car-car bumps (soft push).
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - pos[0], dz = other.z - pos[2];
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      pos[0] -= (dx / d) * push;
      pos[2] -= (dz / d) * push;
      if (Math.abs(car.speed) > 8) {
        damageCar(car, 3);
        damageCar(other, 3);
        if (other.kind === 'police') addHeat(G.police, CRIME_HEAT.hitAndRun, G.gameTime);
      }
      car.speed *= 0.85;
    }
  }
  const moved = Math.hypot(pos[0] - car.x, pos[2] - car.z);
  car.x = pos[0];
  car.z = pos[2];
  car.spin -= (car.speed * dt) / model.wr;
  profile().stats.distanceDriven += moved;
  player.x = car.x;
  player.z = car.z;
  player.yaw = car.yaw;
  player.speed = Math.abs(car.speed);
  // Camera follows behind the car (drift-aware: aims at car angle + slide).
  const slide = clamp(car.steer * Math.abs(car.speed) / 20, -1, 1);
  const wantYaw = car.yaw + slide * 0.4;
  G.camera.yaw = G.camera.yaw + wrapAngle(wantYaw - G.camera.yaw) * Math.min(1, 3.5 * dt);
  if (input.locked) G.camera.yaw -= input.mouseDX * 0.002;
  G.camera.pitch = damp(G.camera.pitch, 0.30, 4, dt);
  if (input.hit('KeyH')) sfxHorn();
}

// ============================================================================
// Traffic, peds, enemies, police AI
// ============================================================================
function updateTraffic(dt) {
  for (const car of cars) {
    if (car.kind !== 'traffic') continue;
    const ai = car.ai;
    const model = CAR_MODELS[car.model];
    // Drive along the current road; at intersections, sometimes turn.
    car.speed = damp(car.speed, ai.speed, 2, dt);
    const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw);
    const nx = car.x + fx * car.speed * dt;
    const nz = car.z + fz * car.speed * dt;
    // Slow for the car ahead.
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      const perp = Math.abs(dx * -fz + dz * fx);
      if (along > 0 && along < 9 && perp < 2.2) {
        car.speed = Math.min(car.speed, Math.max(0, other.speed - 2));
      }
    }
    const pos = [nx, 0, nz];
    if (collideCircle(colliders, pos, 1.8)) {
      car.yaw += Math.PI / 2;
      car.stuckT = 0;
    }
    car.x = pos[0];
    car.z = pos[2];
    car.spin -= (car.speed * dt) / model.wr;
    // Intersection turning: snap to the nearest road line, pick a new dir.
    const nearAv = AVENUES.find((a) => Math.abs(car.x - a) < 2);
    const nearSt = STREETS.find((s) => Math.abs(car.z - s) < 2);
    if (nearAv !== undefined && nearSt !== undefined && Math.random() < dt * 0.5) {
      const opts = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
      const target = opts[Math.floor(Math.random() * opts.length)];
      car.yaw = car.yaw + wrapAngle(target - car.yaw) * Math.min(1, 2 * dt);
    }
    // Keep traffic near the player: recycle far cars.
    if (v3.dist2([car.x, 0, car.z], [player.x, 0, player.z]) > 220) {
      const av = AVENUES[Math.floor(Math.random() * AVENUES.length)];
      car.x = clamp(player.x + (Math.random() - 0.5) * 120, -160, 160);
      car.z = clamp(player.z + (Math.random() - 0.5) * 120, -140, 100);
      car.x = av;
    }
  }
}

function updatePeds(dt) {
  for (const pd of peds) {
    if (pd.dead) continue;
    let tx, tz, speed = pd.speed;
    if (pd.flee > 0) {
      pd.flee -= dt;
      const dx = pd.x - player.x, dz = pd.z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = pd.x + (dx / d) * 10;
      tz = pd.z + (dz / d) * 10;
      speed = 3.2;
    } else {
      const wp = pd.path[pd.pathI];
      tx = wp[0]; tz = wp[1];
      if (Math.hypot(tx - pd.x, tz - pd.z) < 2) pd.pathI = (pd.pathI + 1) % pd.path.length;
    }
    const dx = tx - pd.x, dz = tz - pd.z;
    const d = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dz, dx);
    pd.yaw = pd.yaw + wrapAngle(wantYaw - pd.yaw) * Math.min(1, 6 * dt);
    const step = Math.min(d, speed * dt);
    const nx = pd.x + Math.cos(pd.yaw) * step;
    const nz = pd.z - Math.sin(pd.yaw) * step;
    const pos = [nx, 0, nz];
    collideCircle(colliders, pos, 0.4);
    const moved = Math.hypot(pos[0] - pd.x, pos[2] - pd.z);
    pd.dist += moved;
    pd.phase = GAIT_K * pd.dist;
    pd.x = pos[0];
    pd.z = pos[2];
    // Run over by the player's car.
    if (player.inCar && player.car && Math.abs(player.car.speed) > 4) {
      const cdx = pd.x - player.car.x, cdz = pd.z - player.car.z;
      if (Math.hypot(cdx, cdz) < 2.2) damagePed(pd, 100);
    }
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = player.x - e.x, dz = player.z - e.z;
    const d = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dz, dx);
    e.yaw = e.yaw + wrapAngle(wantYaw - e.yaw) * Math.min(1, 8 * dt);
    if (d > 16) {
      e.state = 'approach';
      const step = 4.5 * dt;
      const nx = e.x + Math.cos(e.yaw) * step;
      const nz = e.z - Math.sin(e.yaw) * step;
      const pos = [nx, 0, nz];
      collideCircle(colliders, pos, 0.5);
      const moved = Math.hypot(pos[0] - e.x, pos[2] - e.z);
      e.dist += moved;
      e.phase = GAIT_K * e.dist;
      e.x = pos[0];
      e.z = pos[2];
      e.walking = 1;
      e.aiming = 0;
    } else {
      e.state = 'shoot';
      e.walking = 0;
      e.aiming = 1;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = e.weapon === 'smg' ? 0.9 : 1.4;
        // Hit chance falls with distance; the player can dodge in a car.
        const hitP = clamp(0.55 - d * 0.012, 0.12, 0.55) * (player.inCar ? 0.6 : 1);
        if (Math.random() < hitP) {
          if (player.inCar && player.car) damageCar(player.car, e.kind === 'cop' ? 4 : 7);
          else damagePlayer(e.kind === 'cop' ? 4 : 7, e.x, e.z);
        }
        sfxShoot(e.weapon);
      }
    }
  }
  // Remove long-dead enemies.
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead && G.time - enemies[i].deadT > 8) enemies.splice(i, 1);
  }
}

function updatePoliceUnits(dt) {
  const pol = G.police;
  syncUnits(pol);
  // Spawn new units on roads near the player.
  for (const u of pol.units) {
    if (u.spawnT === 0) {
      u.spawnT = G.gameTime;
      const av = AVENUES[Math.floor(Math.random() * AVENUES.length)];
      const side = Math.random() > 0.5 ? 1 : -1;
      u.x = clamp(player.x + side * (35 + Math.random() * 20), -160, 160);
      u.z = clamp(player.z + (Math.random() - 0.5) * 60, -140, 100);
      if (Math.random() > 0.5) u.x = av;
      // A matching police car in the world.
      if (!u.car) {
        u.car = spawnCar('police', 0, u.x, u.z, 0, 'police');
      }
    }
  }
  // Chase: steer each police car toward the player.
  for (const u of pol.units) {
    const car = u.car;
    if (!car) continue;
    const model = CAR_MODELS.police;
    const dx = player.x - car.x, dz = player.z - car.z;
    const d = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dz, dx);
    // Ram: aim slightly ahead of the player at high wanted.
    const ram = pol.wanted >= 4 ? 0.3 : 0;
    const targetYaw = wantYaw + ram * Math.sin(G.time * 2 + u.name.charCodeAt(5));
    car.yaw = car.yaw + wrapAngle(targetYaw - car.yaw) * Math.min(1, 3.2 * dt);
    const wantSpeed = d > 6 ? model.topSpeed : Math.max(0, (player.inCar ? Math.abs(player.car.speed) : 0) + 4);
    car.speed = damp(car.speed, wantSpeed, 1.5, dt);
    const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw);
    const nx = car.x + fx * car.speed * dt;
    const nz = car.z + fz * car.speed * dt;
    const pos = [nx, 0, nz];
    if (collideCircle(colliders, pos, 2.0)) {
      car.speed *= 0.4;
      car.yaw += (Math.random() - 0.5) * 0.8;
    }
    car.x = pos[0];
    car.z = pos[2];
    car.spin -= (car.speed * dt) / model.wr;
    u.x = car.x;
    u.z = car.z;
    u.yaw = car.yaw;
    // On-foot player: deploy a cop when close.
    if (!player.inCar && d < 12) {
      const copsOut = enemies.filter((e) => e.kind === 'cop' && !e.dead).length;
      if (copsOut < 2 && Math.random() < dt * 0.5) {
        spawnEnemy(car.x + 2, car.z + 2, 'cop', 'pistol');
      }
    }
    // Ram damage to the player's car.
    if (player.inCar && player.car && d < 3.6) {
      damageCar(player.car, 8 * dt * 3);
      player.car.speed *= 1 - 0.6 * dt;
    }
  }
  // Remove police cars when the wanted level drops.
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.kind === 'police' && !pol.units.some((u) => u.car === c)) {
      cars.splice(i, 1);
    }
  }
  // Helicopter: orbit the player, spotlight tracking.
  if (pol.heli) {
    const h = pol.heli;
    h.angle += dt * 0.35;
    h.rotor += dt * 28;
    const tx = player.x + Math.cos(h.angle) * 22;
    const tz = player.z + Math.sin(h.angle) * 22;
    h.x = damp(h.x, tx, 1.2, dt);
    h.z = damp(h.z, tz, 1.2, dt);
    h.y = damp(h.y, 26, 1, dt);
  }
  // Roadblocks at 4+: two police cars across the road ahead of the player.
  if (pol.wanted >= 4 && pol.roadblocks.length === 0) {
    const fx = Math.cos(player.yaw), fz = -Math.sin(player.yaw);
    const bx = player.x + fx * 45, bz = player.z + fz * 45;
    pol.roadblocks.push({ x: bx, z: bz, yaw: player.yaw + Math.PI / 2 });
    const c1 = spawnCar('police', 0, bx - fz * 3, bz + fx * 3, player.yaw + Math.PI / 2, 'roadblock');
    const c2 = spawnCar('police', 0, bx + fz * 3, bz - fx * 3, player.yaw + Math.PI / 2, 'roadblock');
    c1.speed = 0; c2.speed = 0;
    pol.roadblocks[0].cars = [c1, c2];
  }
  if (pol.wanted < 4 && pol.roadblocks.length > 0) {
    for (const rb of pol.roadblocks) {
      for (const c of rb.cars || []) {
        const i = cars.indexOf(c);
        if (i >= 0) cars.splice(i, 1);
      }
    }
    pol.roadblocks = [];
  }
}

// ============================================================================
// Missions
// ============================================================================
function startMissionAtBeacon() {
  const b = G.missionBeacon;
  if (!b) return;
  const active = startMission(missions(), b.missionId, profile());
  if (!active) return;
  profile().stats.missionsPlayed++;
  showBanner(active.mission.name, active.mission.brief, 3200);
  sfxClick();
  beginStage();
  updateMissionBeacon();
}

function beginStage() {
  const stage = currentStage(missions());
  if (!stage) return;
  if (stage.type === 'combat') {
    for (let i = 0; i < stage.count; i++) {
      const a = (i / stage.count) * TAU;
      spawnEnemy(stage.x + Math.cos(a) * (8 + i * 2), stage.z + Math.sin(a) * (8 + i * 2), 'thug', i % 3 === 0 ? 'smg' : 'pistol');
    }
  } else if (stage.type === 'chase') {
    setWanted(G.police, 2, G.gameTime);
  } else if (stage.type === 'escape') {
    setWanted(G.police, 2, G.gameTime);
  } else if (stage.type === 'dialog') {
    showDialog(stage.speaker, stage.text);
    G.dialogAdvance = () => {
      hideDialog();
      advanceMissionStage();
    };
  } else if (stage.type === 'choice') {
    G.mode = 'choice';
    exitPointerLock();
    showChoices(stage, (idx) => {
      const opt = applyChoice(missions(), stage.id, idx, profile());
      hideChoices();
      G.mode = 'play';
      if (opt) {
        showDialog('THEO MARCHETTI', opt.result);
        G.dialogAdvance = () => {
          hideDialog();
          advanceMissionStage();
        };
      }
    });
  }
}

function advanceMissionStage() {
  const more = advanceStage(missions());
  if (more) {
    beginStage();
  } else {
    finishMission();
  }
}

function finishMission() {
  const done = completeMission(missions(), profile());
  if (!done) return;
  const m = done.mission;
  profile().missionsDone = missions().done;
  sfxMissionComplete();
  sfxCash();
  if (m.id === 8) {
    const ending = missions().ending;
    saveGame(G.state);
    G.mode = 'ending';
    exitPointerLock();
    fillEndingScreen(ENDINGS[ending], profile());
    showScreen('ending-screen');
    return;
  }
  showBanner('MISSION COMPLETE', m.name + '  ·  +$' + (m.payout || 0), 3200);
  saveGame(G.state);
  updateMissionBeacon();
}

function updateMission(dt) {
  const ms = missions();
  if (!ms.active) return;
  const stage = currentStage(ms);
  if (!stage) return;
  if (stage.type === 'driveTo' || stage.type === 'deliver' || stage.type === 'escape') {
    const d = Math.hypot(stage.x - player.x, stage.z - player.z);
    if (d < 7) advanceMissionStage();
  } else if (stage.type === 'combat') {
    const alive = enemies.filter((e) => !e.dead && e.kind === 'thug').length;
    if (alive === 0) advanceMissionStage();
  } else if (stage.type === 'chase') {
    if (G.police.wanted === 0) advanceMissionStage();
  }
  // Dialog / choice stages advance through the UI.
}

// ============================================================================
// Interactions + shops
// ============================================================================
function nearestInteraction() {
  if (player.inCar) return { type: 'exit-car', label: 'Press E — Exit car' };
  // Nearest car to enter.
  let bestCar = null, bestD = 4;
  for (const car of cars) {
    if (car.kind === 'police' || car.kind === 'roadblock') continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; bestCar = car; }
  }
  if (bestCar) {
    return { type: 'enter-car', car: bestCar, label: 'Press E — Drive ' + CAR_MODELS[bestCar.model].name };
  }
  // Mission beacon.
  if (G.missionBeacon) {
    const d = Math.hypot(G.missionBeacon.x - player.x, G.missionBeacon.z - player.z);
    if (d < 8) {
      return { type: 'mission', label: 'Press E — Start Mission: ' + G.missionBeacon.name };
    }
  }
  // POIs.
  const pois = [
    [POI.garage, 'garage', "Press E — Enter Mara's Garage"],
    [POI.gunshop, 'gunshop', 'Press E — Enter Iron & Oak Guns'],
    [POI.safehouse, 'safehouse', 'Press E — Save game & rest'],
    [POI.pawn, 'pawn', "Press E — Talk to Zed"],
  ];
  for (const [poi, type, label] of pois) {
    const d = Math.hypot(poi.x - player.x, poi.z - player.z);
    if (d < 9) return { type, poi, label };
  }
  return null;
}

function doInteract() {
  const t = G.interactTarget;
  if (!t) return;
  if (t.type === 'exit-car') {
    exitCar();
    sfxClick();
  } else if (t.type === 'enter-car') {
    const stolen = t.car.kind === 'parked';
    enterCar(t.car);
    if (stolen) {
      profile().stats.carsStolen++;
      const nearCop = G.police.units.some((u) => v3.dist2([u.x, 0, u.z], [player.x, 0, player.z]) < 50);
      if (nearCop || G.police.wanted > 0) addHeat(G.police, CRIME_HEAT.carjack, G.gameTime);
    }
    sfxClick();
  } else if (t.type === 'mission') {
    startMissionAtBeacon();
  } else if (t.type === 'garage' || t.type === 'gunshop') {
    openShop(t.type);
  } else if (t.type === 'safehouse') {
    player.hp = 100;
    saveGame(G.state);
    toast('Game saved. Theo feels rested.');
    sfxCash();
  } else if (t.type === 'pawn') {
    showDialog('ZED OKAFOR', "Bring me a car and I'll fence it — press X while driving. I pay 25% over street. And Theo... the ledger business? Keep your head down.");
    G.dialogAdvance = () => hideDialog();
  }
}

function openShop(kind) {
  G.shopKind = kind;
  G.mode = 'shop';
  exitPointerLock();
  fillShopScreen(kind, hudView(), (action, id) => buyFromShop(kind, action, id));
  showScreen('shop-screen');
  sfxClick();
}

function closeShop() {
  G.mode = 'play';
  G.shopKind = null;
  showScreen(null);
}

function buyFromShop(kind, action, id) {
  const p = profile();
  if (kind === 'gunshop') {
    const w = WEAPONS[id];
    const slot = p.loadout.owned[id];
    if (action === 'buy' && !slot.owned && p.cash >= w.price && p.rep >= w.repReq) {
      p.cash -= w.price;
      slot.owned = true;
      slot.mag = w.mag;
      slot.reserve = w.startReserve;
      p.loadout.current = id;
      toast(w.name + ' purchased.');
      sfxCash();
    } else if (action === 'ammo' && slot.owned && !w.melee && p.cash >= w.ammoPrice) {
      p.cash -= w.ammoPrice;
      slot.reserve += w.mag * 2;
      toast('Ammo restocked (+' + w.mag * 2 + ').');
      sfxCash();
    }
  } else if (kind === 'garage') {
    const prices = { engine: 1500, armour: 1200, nitro: 800, respray: 300, repair: 0 };
    if (action === 'respray') {
      if (p.cash >= 300) {
        p.cash -= 300;
        p.upgrades.respray++;
        clearWanted(G.police);
        toast('Respray done. The PBPD lost your trail.');
        sfxCash();
      }
    } else if (action === 'repair') {
      if (player.car) player.car.hp = 100;
      toast("Mara fixed your car — free, as always.");
      sfxCash();
    } else if (prices[action] !== undefined && !p.upgrades[action] && p.cash >= prices[action]) {
      p.cash -= prices[action];
      p.upgrades[action] = true;
      toast(action.charAt(0).toUpperCase() + action.slice(1) + ' installed.');
      sfxCash();
    }
  }
  fillShopScreen(kind, hudView(), (a, i) => buyFromShop(kind, a, i));
}

// Crew abilities.
function maraRepair() {
  if (!player.inCar || !player.car) {
    toast('Get in a car first — Mara fixes cars, not pedestrians.');
    return;
  }
  if (G.maraCooldown > 0) {
    toast("Mara is busy — try again in " + Math.ceil(G.maraCooldown) + "s.");
    return;
  }
  player.car.hp = 100;
  G.maraCooldown = 60;
  toast("Mara fixed your car — free, as always.");
  sfxCash();
}

function zedFence() {
  if (!player.inCar || !player.car) {
    toast('Get in a car first — Zed fences cars, not pedestrians.');
    return;
  }
  const car = player.car;
  const model = CAR_MODELS[car.model];
  const value = Math.round(model.value * 1.25 * (car.hp / 100));
  profile().cash += value;
  profile().stats.moneyEarned += value;
  toast("Zed fenced the " + model.name + " for $" + value + ".");
  sfxCash();
  const i = cars.indexOf(car);
  if (i >= 0) cars.splice(i, 1);
  player.inCar = false;
  player.car = null;
  player.speed = 0;
}

// ============================================================================
// Pickups + postcards
// ============================================================================
function updatePickups(dt) {
  // Ammo pickups.
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    if (Math.hypot(pk.x - player.x, pk.z - player.z) < 2 && !player.inCar) {
      const loadout = profile().loadout;
      const w = WEAPONS[pk.weapon];
      if (loadout.owned[pk.weapon] && loadout.owned[pk.weapon].owned && !w.melee) {
        loadout.owned[pk.weapon].reserve += w.mag;
        toast('+Ammo — ' + w.name);
        sfxPickup();
      }
      pickups.splice(i, 1);
    } else if (G.time - pk.t > 60) {
      pickups.splice(i, 1);
    }
  }
  // Postcards.
  POSTCARDS.forEach(([x, z], i) => {
    if (profile().postcards.includes(i)) return;
    if (Math.hypot(x - player.x, z - player.z) < 2.5) {
      profile().postcards.push(i);
      profile().cash += 100;
      toast('Bay Postcard ' + profile().postcards.length + '/20  ·  +$100');
      sfxPickup();
    }
  });
}

// ============================================================================
// Weather + time
// ============================================================================
function updateWeather(dt) {
  G.hour += dt / 90; // 1 game hour per 90 real seconds
  if (G.hour >= 24) {
    G.hour -= 24;
    G.day++;
  }
  G.rainTimer -= dt;
  if (G.rainTimer <= 0) {
    G.rainTimer = 60 + Math.random() * 120;
    G.rainTarget = Math.random() < 0.25 ? 1 : 0;
  }
  G.rain = damp(G.rain, G.rainTarget, 0.5, dt);
  updateSky(G.hour, G.rain);
}

// ============================================================================
// HUD view model
// ============================================================================
function hudView() {
  const ms = missions();
  const stage = currentStage(ms);
  let mission = { active: false };
  if (ms.active && stage) {
    let dist = null, mx, mz;
    if (stage.x !== undefined) {
      dist = Math.hypot(stage.x - player.x, stage.z - player.z);
      mx = stage.x; mz = stage.z;
    } else if (stage.type === 'combat') {
      const alive = enemies.filter((e) => !e.dead && e.kind === 'thug').length;
      dist = null;
      mx = undefined;
    }
    mission = {
      active: true,
      name: ms.active.mission.name,
      stageIndex: ms.active.stageIndex,
      stages: ms.active.mission.stages.length,
      objective: stage.type === 'combat'
        ? stage.text + ' (' + enemies.filter((e) => !e.dead && e.kind === 'thug').length + ' left)'
        : stage.text,
      dist, mx, mz,
      next: stage.next || '',
    };
  } else if (G.missionBeacon) {
    mission = {
      active: true,
      name: 'Next: ' + G.missionBeacon.name,
      stageIndex: 0, stages: 1,
      objective: 'Drive to the marker to start the mission',
      dist: Math.hypot(G.missionBeacon.x - player.x, G.missionBeacon.z - player.z),
      mx: G.missionBeacon.x, mz: G.missionBeacon.z,
      next: '',
    };
  }
  const loadout = profile().loadout;
  const w = WEAPONS[loadout.current];
  const slot = loadout.owned[loadout.current];
  const hint = player.inCar
    ? 'WASD drive · SPACE brake · SHIFT nitro · E exit · H horn · Z repair · X fence · M map'
    : 'WASD move · Click shoot · RMB aim · 1-5 weapons · R reload · E use · M map';
  // Live helicopter distance for the response panel.
  if (G.police.heli) {
    G.police.heliDist = Math.round(
      Math.hypot(G.police.heli.x - player.x, G.police.heli.z - player.z),
    );
  }
  return {
    profile: profile(),
    police: G.police,
    seen: G.police.wanted > 0 && anyUnitSees(G.police, player.x, player.z),
    mission,
    missionList: MISSIONS.map((m) => ({
      id: m.id, name: m.name,
      done: ms.done.includes(m.id),
      unlocked: isUnlocked(ms, m.id),
    })),
    player: { x: player.x, z: player.z, yaw: player.yaw },
    hour: G.hour, day: G.day, rain: G.rain,
    district: districtAt(player.x, player.z),
    station: currentStation().name,
    track: currentTrack(),
    weapon: loadout.current,
    mag: w.melee ? 0 : slot.mag,
    reserve: w.melee ? 0 : slot.reserve,
    loadout,
    inCar: player.inCar,
    speed: player.inCar && player.car ? Math.abs(player.car.speed) : player.speed,
    health: player.hp,
    aiming: player.aiming > 0.3 && !player.inCar,
    interact: G.interactTarget ? G.interactTarget.label : null,
    hint,
  };
}

// ============================================================================
// Camera
// ============================================================================
function updateCamera(dt) {
  const cam = G.camera;
  if (G.mode === 'title') {
    // Slow orbit over the bay, Ferris wheel in frame.
    const t = G.time * 0.05;
    camPos[0] = 80 + Math.cos(t) * 55;
    camPos[1] = 26;
    camPos[2] = 112 + Math.sin(t) * 55;
    return { target: [40, 4, 60], fov: 55 };
  }
  if (player.inCar && player.car) {
    const car = player.car;
    const speed = Math.abs(car.speed);
    const dist = 7 + speed * 0.08;
    const height = 2.8 + speed * 0.015;
    const bx = car.x - Math.cos(cam.yaw) * dist;
    const bz = car.z + Math.sin(cam.yaw) * dist;
    camPos[0] = damp(camPos[0], bx, 6, dt);
    camPos[1] = damp(camPos[1], height, 6, dt);
    camPos[2] = damp(camPos[2], bz, 6, dt);
    const fov = 60 + Math.min(16, speed * 0.45);
    cam.fov = damp(cam.fov, fov, 4, dt);
    return { target: [car.x + Math.cos(car.yaw) * 2, 1.6, car.z - Math.sin(car.yaw) * 2], fov: cam.fov };
  }
  // On foot: third person behind the camera yaw.
  const dist = player.aiming > 0.5 ? 3.4 : 5.6;
  const height = 2.0 + Math.sin(cam.pitch) * 2.2;
  const bx = player.x - Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
  const bz = player.z + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
  camPos[0] = damp(camPos[0], bx, 10, dt);
  camPos[1] = damp(camPos[1], height, 10, dt);
  camPos[2] = damp(camPos[2], bz, 10, dt);
  // Keep the camera out of the ground and out of buildings.
  if (camPos[1] < 0.6) camPos[1] = 0.6;
  const cpos = [camPos[0], 0, camPos[2]];
  collideCircle(colliders, cpos, 0.6);
  camPos[0] = cpos[0];
  camPos[2] = cpos[2];
  const fov = player.aiming > 0.5 ? 50 : 62;
  cam.fov = damp(cam.fov, fov, 8, dt);
  return { target: [player.x, 1.4, player.z], fov: cam.fov };
}

// ============================================================================
// Rendering
// ============================================================================
let rainDrops = [];
function initRain() {
  const rng = rng32(4242);
  rainDrops = [];
  for (let i = 0; i < 260; i++) {
    rainDrops.push({
      x: (rng() - 0.5) * 60, y: rng() * 30, z: (rng() - 0.5) * 60,
      speed: 20 + rng() * 8,
    });
  }
}

function rebuildRain(dt) {
  const bd = new MeshBuilder();
  bd.setMat(MAT.PLAIN).setColor(0.75, 0.82, 0.92);
  const cx = camPos[0], cz = camPos[2];
  for (const d of rainDrops) {
    d.y -= d.speed * dt;
    if (d.y < 0) {
      d.y = 28 + Math.random() * 4;
      d.x = (Math.random() - 0.5) * 60;
      d.z = (Math.random() - 0.5) * 60;
    }
    const x = cx + d.x, y = d.y, z = cz + d.z;
    bd.quad([x - 0.02, y, z], [x + 0.02, y, z], [x + 0.02, y + 0.9, z], [x - 0.02, y + 0.9, z]);
  }
  updateMesh(rainMesh, bd.build());
}

function charMeshFor(entity, look, pose) {
  let mesh = charMeshes.get(entity);
  // LOD: far-away characters rebuild only every 6th frame (their walk cycle
  // is invisible at that distance); the player always rebuilds.
  const frameNo = (renderFrame.frameNo = (renderFrame.frameNo || 0) + 1);
  if (mesh && entity !== player) {
    const d2 = (entity.x - camPos[0]) * (entity.x - camPos[0])
      + (entity.z - camPos[2]) * (entity.z - camPos[2]);
    if (d2 > 60 * 60 && (frameNo + (entity.x | 0)) % 6 !== 0) return mesh;
  }
  const built = buildCharacter(look, pose);
  if (!mesh) {
    mesh = uploadMesh(built, true);
    charMeshes.set(entity, mesh);
  } else {
    updateMesh(mesh, built);
  }
  return mesh;
}

function renderFrame(t) {
  const cam = G.camView || updateCamera(2);
  const view = m4.lookAt(camPos, cam.target, [0, 1, 0]);
  const proj = m4.perspective((cam.fov * Math.PI) / 180, canvas.width / canvas.height, 0.1, 500);
  const vp = m4.multiply(proj, view);
  const invVP = m4.invert(vp);
  const IDENT = m4.identity();

  beginFrame();
  drawSky(invVP);

  // Static world (merged chunks).
  for (const mesh of staticMeshes) drawLit(mesh, IDENT, vp, t, 1);

  // Ferris wheel (rotates slowly around its axle). The wheel mesh is built in
  // the XY plane with the axle along Z, matching the support towers.
  {
    const F = POI.ferris;
    const wheelM = frame(F.x, 12.5, F.z, 0, 0, 0, 1);
    const spinM = m4.multiply(wheelM, frame(0, 0, 0, 0, 0, t * 0.12, 1));
    drawLit(ferrisMesh, spinM, m4.multiply(vp, spinM), t, 1);
  }

  // Mission beacon.
  if (G.missionBeacon) {
    const b = G.missionBeacon;
    const pulse = 0.75 + Math.sin(t * 3) * 0.25;
    const bm = frame(b.x, 0.1, b.z, 0, 0, 0, 1);
    drawLit(beaconMesh, bm, m4.multiply(vp, bm), t, pulse, true);
  }

  // Postcards (uncollected).
  const collected = new Set(profile().postcards);
  POSTCARDS.forEach(([x, z], i) => {
    if (collected.has(i)) return;
    const pm = frame(x, 0, z, t * 0.8, 0, 0, 1);
    drawLit(postcardMesh, pm, m4.multiply(vp, pm), t, 1);
  });

  // Ammo pickups.
  for (const pk of pickups) {
    const bob = Math.sin(t * 3 + pk.x) * 0.1;
    const am = frame(pk.x, 0.1 + bob, pk.z, t, 0, 0, 1);
    drawLit(ammoMesh, am, m4.multiply(vp, am), t, 1);
  }

  // Cars.
  for (const car of cars) {
    const model = CAR_MODELS[car.model];
    const carM = frame(car.x, 0.02, car.z, car.yaw, 0, 0, 1);
    const roll = car.steer * Math.min(1, Math.abs(car.speed) / 20) * 0.05;
    const bodyM = m4.multiply(carM, frame(0, 0, 0, 0, 0, roll, 1));
    drawLit(carBodyMesh(car.model, car.colorIdx), bodyM, m4.multiply(vp, bodyM), t, 1);
    for (const wx of model.wheelX) {
      for (const wz of [-model.width + 0.13, model.width - 0.13]) {
        const wm = m4.multiply(carM, frame(wx, model.wr, wz, 0, 0, car.spin, model.wr));
        drawLit(wheelMesh, wm, m4.multiply(vp, wm), t, 1);
      }
    }
    // Police light bar (alternating red/blue).
    if (car.model === 'police') {
      const bar = Math.floor(t * 4) % 2 === 0 ? lightBarMeshes.red : lightBarMeshes.blue;
      drawLit(bar, carM, m4.multiply(vp, carM), t, 1);
    }
    // Contact shadow.
    drawBlob(carBlobMesh, m4.multiply(vp, frame(car.x, 0.04, car.z, car.yaw, 0, 0, 1)), [0.05, 0.03, 0.02, 0.38]);
  }

  // Player character (on foot only).
  if (!player.inCar) {
    const mesh = charMeshFor(player, THEO_LOOK, {
      phase: player.phase, walking: player.walking,
      breathe: 1 - player.walking * 0.85, breathT: t * 1.6,
      aiming: player.aiming, weapon: profile().loadout.current, swing: player.swing,
    });
    const chM = frame(player.x, 0.02, player.z, player.yaw, 0, 0, 1);
    drawLit(mesh, chM, m4.multiply(vp, chM), t, 1);
    drawBlob(charBlobMesh, m4.multiply(vp, frame(player.x, 0.05, player.z, 0, 0, 0, 1)), [0.05, 0.03, 0.02, 0.32]);
    // Muzzle flash + tracer.
    if (player.flashTimer > 0 && player.flashAt) {
      const fm = frame(player.flashAt[0], player.flashAt[1], player.flashAt[2], player.yaw, 0, 0, 1);
      drawLit(flashMesh, fm, m4.multiply(vp, fm), t, 1, true);
    }
    if (player.tracerTimer > 0 && player.tracerFrom && player.tracerTo) {
      const from = player.tracerFrom, to = player.tracerTo;
      const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
      const yaw = Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
      const pitch = Math.asin((to[1] - from[1]) / Math.max(len, 0.01));
      const trM = m4.multiply(
        frame(mid[0], mid[1], mid[2], yaw, -pitch, 0, 1),
        m4.scaleXYZ(len, 1, 1),
      );
      drawLit(tracerMesh, trM, m4.multiply(vp, trM), t, 0.8, true);
    }
  }

  // Pedestrians.
  for (const pd of peds) {
    if (pd.dead && G.time - pd.deadT > 8) continue;
    const mesh = charMeshFor(pd, pd.look, {
      phase: pd.phase, walking: pd.dead ? 0 : 1,
      breathe: 1, breathT: t * 1.6 + pd.x, aiming: 0, weapon: null, swing: 0,
    });
    const fall = pd.dead ? Math.min(1, (G.time - pd.deadT) * 3) : 0;
    const chM = frame(pd.x, 0.02, pd.z, pd.yaw, 0, -fall * (Math.PI / 2), 1);
    drawLit(mesh, chM, m4.multiply(vp, chM), t, 1);
    if (!pd.dead) drawBlob(charBlobMesh, m4.multiply(vp, frame(pd.x, 0.05, pd.z, 0, 0, 0, 1)), [0.05, 0.03, 0.02, 0.3]);
  }

  // Enemies (thugs + cops).
  for (const e of enemies) {
    if (e.dead && G.time - e.deadT > 8) continue;
    const mesh = charMeshFor(e, e.look, {
      phase: e.phase, walking: e.dead ? 0 : e.walking,
      breathe: 1, breathT: t * 1.6 + e.x, aiming: e.aiming, weapon: e.weapon, swing: 0,
    });
    const fall = e.dead ? Math.min(1, (G.time - e.deadT) * 3) : 0;
    const chM = frame(e.x, 0.02, e.z, e.yaw, 0, -fall * (Math.PI / 2), 1);
    drawLit(mesh, chM, m4.multiply(vp, chM), t, 1);
    if (!e.dead) drawBlob(charBlobMesh, m4.multiply(vp, frame(e.x, 0.05, e.z, 0, 0, 0, 1)), [0.05, 0.03, 0.02, 0.3]);
  }

  // Police helicopter + spotlight.
  if (G.police.heli) {
    const h = G.police.heli;
    const heliM = frame(h.x, h.y, h.z, Math.atan2(-(player.z - h.z), player.x - h.x) + Math.PI, 0, 0, 1);
    drawLit(heliMeshes.body, heliM, m4.multiply(vp, heliM), t, 1);
    const rotorM = m4.multiply(heliM, frame(0, 0, 0, h.rotor, 0, 0, 1));
    drawLit(heliMeshes.rotor, rotorM, m4.multiply(vp, rotorM), t, 1);
    const tailM = m4.multiply(heliM, frame(0, 0, 0, 0, 0, h.rotor * 2, 1));
    drawLit(heliMeshes.tailRotor, tailM, m4.multiply(vp, tailM), t, 1);
    // Spotlight cone from the heli down to the player + ground disc.
    const coneM = frame(h.x, h.y - 1, h.z, 0, 0, 0, 1);
    drawLit(heliMeshes.cone, coneM, m4.multiply(vp, coneM), t, 0.14, true);
    drawBlob(spotBlobMesh, m4.multiply(vp, frame(player.x, 0.06, player.z, 0, 0, 0, 1)), [1.0, 0.95, 0.7, 0.35]);
  }

  // Glass pass (car glass, blended, after opaque).
  for (const car of cars) {
    const carM = frame(car.x, 0.02, car.z, car.yaw, 0, 0, 1);
    drawLit(carGlassMesh(car.model), carM, m4.multiply(vp, carM), t, 0.32, true);
  }

  // Rain puddles + rain streaks.
  if (sky.wet > 0.05) {
    drawLit(puddleMesh, IDENT, vp, t, sky.wet * 0.8, true);
  }
  if (G.rain > 0.05) {
    drawLit(rainMesh, IDENT, vp, t, 0.35 * G.rain, true);
  }
}

// ============================================================================
// Frame loop
// ============================================================================
function update(dt) {
  G.time += dt;
  if (G.mode === 'play' || G.mode === 'choice') G.gameTime += dt;
  updateWeather(dt);
  if (G.rain > 0.05) rebuildRain(dt);
  if (G.mode === 'title') return;
  if (G.mode === 'choice') {
    // Modal choice: the world freezes; only the 1-3 keys work.
    for (let i = 0; i < 3; i++) {
      if (G.input.hit('Digit' + (i + 1))) {
        const btns = document.querySelectorAll('.choice-btn');
        if (btns[i]) btns[i].click();
      }
    }
    return;
  }
  if (G.mode !== 'play') return;

  if (G.maraCooldown > 0) G.maraCooldown -= dt;
  // Health regen after 8s without damage.
  if (G.gameTime - G.lastDamageT > 8 && player.hp > 0 && player.hp < 100) {
    player.hp = Math.min(100, player.hp + 1.5 * dt);
  }

  if (player.inCar) updateDriving(dt);
  else updateOnFoot(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updateEnemies(dt);
  updatePoliceUnits(dt);
  updatePolice(G.police, dt, G.gameTime, {
    x: player.x, z: player.z,
    vx: player.inCar && player.car ? Math.cos(player.car.yaw) * player.car.speed : 0,
    vz: player.inCar && player.car ? -Math.sin(player.car.yaw) * player.car.speed : 0,
    carName: player.inCar && player.car ? CAR_MODELS[player.car.model].name : 'on foot',
  });
  updateMission(dt);
  updatePickups(dt);

  // Busted: on foot, wanted, cops close and the player is still.
  if (!player.inCar && G.police.wanted > 0) {
    const closeCops = enemies.filter(
      (e) => e.kind === 'cop' && !e.dead && Math.hypot(e.x - player.x, e.z - player.z) < 4,
    ).length;
    if (closeCops >= 1 && player.speed < 0.5) {
      G.bustedTimer += dt;
      if (G.bustedTimer > 1 && G.bustedTimer < 1.1) toast('The PBPD is closing in — RUN!');
      if (G.bustedTimer > 2.5) {
        G.bustedTimer = 0;
        busted();
      }
    } else {
      G.bustedTimer = 0;
    }
  }

  // Interactions.
  G.interactTarget = nearestInteraction();
  if (G.input.hit('KeyE')) {
    if (G.dialogAdvance) {
      const fn = G.dialogAdvance;
      G.dialogAdvance = null;
      fn();
    } else if (G.mode === 'play') {
      doInteract();
    }
  }
  if (G.input.mousePressed && G.dialogAdvance && G.mode === 'play') {
    const fn = G.dialogAdvance;
    G.dialogAdvance = null;
    fn();
  }
  // Pause / map.
  if (G.input.hit('KeyM') || G.input.hit('Escape')) {
    if (G.mode === 'play') openPause();
    else if (G.mode === 'pause') closePause();
  }
  if (G.input.hit('KeyN')) {
    nextStation();
    toast(currentStation().name + ' — ' + currentTrack());
  }
  if (G.input.hit('KeyZ')) maraRepair();
  if (G.input.hit('KeyX')) zedFence();
  // Click the canvas to lock the mouse for aiming.
  if (G.input.mousePressed && !G.input.locked && G.mode === 'play' && !player.inCar) {
    requestPointerLock(canvas);
  }
  // Audio.
  updateAudio(dt, {
    wanted: G.police.wanted,
    speed: player.inCar && player.car ? Math.abs(player.car.speed) : 0,
    driving: player.inCar,
  });
}

function openPause() {
  G.mode = 'pause';
  exitPointerLock();
  fillPauseScreen(hudView());
  showScreen('pause-screen');
  sfxClick();
}

function closePause() {
  G.mode = 'play';
  showScreen(null);
  sfxClick();
}

function frameLoop(timeMs) {
  const t = timeMs / 1000;
  const dt = Math.min(0.05, t - (frameLoop.last || t));
  frameLoop.last = t;
  update(dt);
  G.camView = updateCamera(dt);
  renderFrame(G.time);
  if (G.mode !== 'title') updateHUD(hudView());
  G.input.endFrame();
  requestAnimationFrame(frameLoop);
}

// ============================================================================
// Screens + wiring
// ============================================================================
function wireScreens() {
  const $ = (id) => document.getElementById(id);
  const startPlay = () => {
    initAudio();
    G.mode = 'play';
    showScreen(null);
    document.getElementById('hud').style.display = 'block';
    sfxClick();
    if (!missions().active && !missions().done.length) {
      showBanner('PALOMA BAY', 'Drive to the marker to start Night Shift', 3200);
    }
  };
  $('btn-continue').addEventListener('click', () => {
    const saved = loadGame(1) || loadGame(2) || loadGame(3);
    if (saved) {
      G.state = saved;
      player.x = saved.profile.spawn.x;
      player.z = saved.profile.spawn.z;
      player.yaw = saved.profile.spawn.yaw;
      G.hour = saved.profile.hour;
      G.day = saved.profile.day;
      updateMissionBeacon();
      toast('Save loaded — welcome back to Paloma Bay.');
    }
    startPlay();
  });
  $('btn-new').addEventListener('click', () => {
    G.state = createGameState();
    player.x = 15; player.z = -45; player.yaw = 0;
    player.hp = 100;
    updateMissionBeacon();
    startPlay();
  });
  $('btn-howto').addEventListener('click', () => {
    const p = $('howto-panel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    sfxClick();
  });
  $('btn-resume').addEventListener('click', closePause);
  $('btn-title').addEventListener('click', () => {
    G.mode = 'title';
    showScreen('title-screen');
    document.getElementById('hud').style.display = 'none';
  });
  $('btn-sound').addEventListener('click', () => {
    setMuted(!isMuted());
    $('btn-sound').textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
  });
  document.querySelectorAll('#pause-saves .btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = Number(btn.dataset.slot);
      profile().spawn = { x: player.x, z: player.z, yaw: player.yaw, inCar: player.inCar, carModel: player.car ? player.car.model : 'taxi', carColor: 0 };
      profile().hour = G.hour;
      profile().day = G.day;
      saveGame(G.state, slot);
      toast('Saved to slot ' + slot + '.');
      sfxCash();
      fillPauseScreen(hudView());
    });
  });
  $('btn-shop-close').addEventListener('click', closeShop);
  $('btn-ending-roam').addEventListener('click', () => {
    G.mode = 'play';
    showScreen(null);
    sfxClick();
  });
  $('btn-ending-title').addEventListener('click', () => {
    G.mode = 'title';
    showScreen('title-screen');
    document.getElementById('hud').style.display = 'none';
  });
  $('btn-respawn').addEventListener('click', () => {
    respawnPlayer();
    sfxClick();
  });
  // Continue button label depends on saves.
  const hasAnySave = hasSave(1) || hasSave(2) || hasSave(3);
  if (!hasAnySave) $('btn-continue').disabled = true;
  else {
    const info = saveSlotInfo(1) || saveSlotInfo(2) || saveSlotInfo(3);
    if (info) $('btn-continue').textContent = 'CONTINUE — $' + Math.floor(info.cash).toLocaleString('en-US') + ' · ' + info.missions + '/8 MISSIONS';
  }
}

// ============================================================================
// Boot
// ============================================================================
function boot() {
  const params = new URLSearchParams(location.search);
  G.shotName = params.get('shot');
  G.freezeT = params.has('t') ? parseFloat(params.get('t')) : null;

  if (!initGL(canvas, showError)) return;
  resizeCanvas();
  initHUD();
  initWorld();
  initRain();
  wireScreens();

  // Resizing resets the canvas — repaint after any resize (a late viewport
  // resize in headless mode would otherwise wipe the frozen frame).
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderFrame(G.freezeT !== null ? G.freezeT : G.time);
  });

  if (G.shotName) {
    // Deterministic screenshot mode: stage, render ONE frozen frame, stop.
    // (No rAF loop: the headless screenshot captures the painted frame.)
    const t = G.freezeT !== null ? G.freezeT : 24;
    stageShot(G, shotApi(), G.shotName);
    G.time = t;
    // Snap the camera to its staged position (damping needs a big dt to
    // converge in a single frame) and build rain drops if it is raining.
    G.camView = updateCamera(3);
    if (G.rain > 0.05) { rebuildRain(0.2); rebuildRain(0.2); rebuildRain(0.2); }
    renderFrame(t);
    if (G.mode === 'play' || G.mode === 'choice') {
      document.getElementById('hud').style.display = 'block';
      updateHUD(hudView());
    }
    return;
  }

  // Interactive mode: title screen over a slow orbit shot.
  showScreen('title-screen');
  renderFrame(0);
  requestAnimationFrame(frameLoop);
}

// API the shot stager uses to place things (kept small and explicit).
function shotApi() {
  return {
    player() { return player; },
    missions() { return missions(); },
    profile() { return profile(); },
    addCar(model, colorIdx, x, z, yaw, kind) {
      return spawnCar(model, colorIdx, x, z, yaw, kind || 'traffic');
    },
    addPed(x, z) {
      const ped = spawnPed(x, z, [[x, z], [x + 6, z + 2]]);
      ped.yaw = Math.PI / 2;
      return ped;
    },
    setPlayerCar(model, colorIdx, x, z, yaw, speed) {
      const car = spawnCar(model, colorIdx, x, z, yaw, 'player');
      car.speed = speed || 0;
      enterCar(car);
      return car;
    },
    setPlayerOnFoot(x, z, yaw, weapon, aiming) {
      player.x = x; player.z = z; player.yaw = yaw;
      player.aimYaw = yaw;
      G.camera.yaw = yaw;
      player.aiming = aiming ? 1 : 0;
      if (weapon) {
        profile().loadout.owned[weapon].owned = true;
        profile().loadout.owned[weapon].mag = WEAPONS[weapon].mag;
        profile().loadout.owned[weapon].reserve = WEAPONS[weapon].startReserve;
        profile().loadout.current = weapon;
      }
    },
    addPoliceCar(x, z, yaw, speed) {
      const u = {
        name: 'PBPD-' + (G.police.units.length + 1), kind: 'car',
        x, z, yaw, speed: speed || 0, state: 'PURSUING', dist: 0, spawnT: G.gameTime,
      };
      u.car = spawnCar('police', 0, x, z, yaw, 'police');
      u.car.speed = speed || 0;
      G.police.units.push(u);
      return u;
    },
    setHeli(x, z, y) {
      G.police.heli = { x, y: y || 26, z, angle: 0, rotor: 2.4 };
    },
    spawnEnemiesAt(x, z, count) {
      const out = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + 0.5;
        const e = spawnEnemy(x + Math.cos(a) * 9, z + Math.sin(a) * 9, 'thug', i % 2 ? 'smg' : 'pistol');
        // Face the player, weapons raised — the frame must read as a fight.
        e.yaw = Math.atan2(-(player.z - e.z), player.x - e.x);
        e.aimYaw = e.yaw;
        e.aiming = 1;
        out.push(e);
      }
      return out;
    },
    setWanted(n) {
      setWanted(G.police, n, G.gameTime);
    },
    setTime(hour, rain) {
      G.hour = hour;
      G.rain = rain || 0;
      G.rainTarget = rain || 0;
      updateSky(hour, rain || 0);
    },
    startMissionAt(id, stageIndex) {
      const active = startMission(missions(), id, profile());
      if (active) {
        missions().active.stageIndex = stageIndex || 0;
        beginStage();
      }
      return active;
    },
    setCash(n) { profile().cash = n; },
    setRep(n) { profile().rep = n; },
    setLoyaltyFavor(l, f) { profile().loyalty = l; profile().favor = f; },
    openChoice() {
      const stage = currentStage(missions());
      if (stage && stage.type === 'choice') {
        G.mode = 'choice';
        showChoices(stage, () => {});
      }
    },
    openDialog(speaker, text) {
      showDialog(speaker, text);
    },
    openPause() {
      G.mode = 'pause';
      fillPauseScreen(hudView());
      showScreen('pause-screen');
    },
    showEnding(endingId) {
      G.mode = 'ending';
      fillEndingScreen(ENDINGS[endingId], profile());
      showScreen('ending-screen');
    },
    completeAllForEnding(endingId) {
      const ms = missions();
      ms.done = [1, 2, 3, 4, 5, 6, 7, 8];
      ms.nextId = 9;
      profile().missionsDone = ms.done;
      ms.ending = endingId;
      profile().endingsSeen = [endingId];
      profile().postcards = POSTCARDS.map((_, i) => i);
      profile().upgrades = { engine: true, armour: true, nitro: true, respray: 3 };
      profile().cash = 48250;
      profile().rep = 4;
      profile().stats.kills = 47;
      profile().stats.carsStolen = 12;
      profile().stats.distanceDriven = 128400;
      profile().stats.moneyEarned = 48250;
      updateMissionBeacon();
    },
  };
}

boot();
