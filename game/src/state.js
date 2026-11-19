// state.js — Paloma Bay: the one game state object + the entity lists.
// Every module reads and writes this state; nothing else owns game data.
// G holds the mode, the save, the police, the input, the clocks, the
// camera, the mission runtime and the feedback lists. The entity arrays
// (cars, peds, enemies, pickups, jet skis, wake puffs, boats) and the
// mesh cache (`meshes`) live here too, so the split modules share them
// without a circular import. `colliders` is a G field now (initWorld sets
// it from the built world); `camDistOverride` lets the screenshot stager
// pull the chase camera closer without touching live play (null = off).

import { createGameState } from './save.js';
import { createPolice } from './police.js';
import { createInput } from './input.js';
import { TRAFFIC_LIGHTS } from './citydata.js';

export const G = {
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
  lightOverrides: {}, // "x,z" -> forced phase name (screenshot staging)
  redLightFlag: null, // intersection last flagged for running a red light
  photoMode: false, // photo mode: world frozen, free camera, filters
  photoCam: null, // { yaw, pitch, dist, target: [x, y, z] }
  missionTimer: null, // seconds left on the active stage's timer (null = no timer)
  scorePopups: [], // { label, amount, t } DRIFT / NEAR MISS feedback
  damageNumbers: [], // { x, y, z, text, sub, t } floating combat numbers
  combatTotal: 0, // enemies in the active combat stage (0 = not combat)
  combatDown: 0, // enemies down in the active combat stage
  lastVP: null, // view-projection matrix of the last rendered frame
  lastDistrict: null, // district name at the last district-card check
  driftT: 0, // seconds of continuous handbrake drift
  driftChain: 0, // current drift chain (reset on award)
  nearMissed: new Set(), // traffic cars already awarded a near miss
  colliders: [], // building AABBs from buildWorld (initWorld sets this)
  camDistOverride: null, // staged camera distance (null = speed-based default)
};

export const profile = () => G.state.profile;
export const missions = () => G.state.missions;

// Player: on foot or in a car. Position is always world (x, z); y = 0.
export const player = {
  x: 18, z: -52, yaw: Math.PI, speed: 0, vx: 0, vz: 0,
  hp: 100, armor: 50, inCar: false, car: null,
  onJetSki: false, jetski: null, // riding a jet ski (player.x/z follow it)
  phase: 0, dist: 0, walking: 0, aiming: 0, aimYaw: 0,
  reloadTimer: 0, fireTimer: 0, swing: 0, swingTimer: 0,
  flashTimer: 0, flashAt: null, tracerTimer: 0, tracerFrom: null, tracerTo: null,
};

// --- entities -----------------------------------------------------------------
export const cars = []; // { model, color, x, z, yaw, speed, steer, spin, hp, kind, ai }
export const peds = []; // { look, x, z, yaw, speed, phase, dist, path, pathI, flee, hp, dead, deadT, cross, walking }
export const enemies = []; // { look, x, z, yaw, hp, weapon, state, fireTimer, kind, dead, deadT, phase, dist }
export const pickups = []; // { kind: 'ammo', weapon, x, z, t }
export const jetskis = []; // { x, z, yaw, speed, steer, colorIdx, bobPhase, wakeT }
export const wakePuffs = []; // { x, z, t, s } fading foam discs behind a moving jet ski
export const boats = []; // police boats { x, z, yaw, speed, steer, bobPhase } — PBPD marine units

// Traffic-light lookup by "x,z" key (the stop + crosswalk checks run per frame).
export const LIGHT_BY_KEY = new Map(TRAFFIC_LIGHTS.map((l) => [l.x + ',' + l.z, l]));
export const JETSKI_COLORS = [[0.85, 0.15, 0.12], [0.15, 0.45, 0.85], [1.0, 0.75, 0.15], [0.10, 0.70, 0.60]];

// Mesh caches: every uploaded mesh the game draws, in one object so the
// split modules share them. initWorld (spawning.js) fills them; scene.js
// draws them; traffic.js rebuilds the lamp mesh on phase flips.
export const meshes = {
  carBodyCache: new Map(), // "model:colorIdx" -> mesh
  carGlassCache: new Map(), // "model" -> mesh
  wheelMesh: null,
  lightBarMeshes: null,
  heliMeshes: null,
  beaconMesh: null,
  postcardMesh: null,
  ammoMesh: null,
  flashMesh: null,
  tracerMesh: null, // unit tracer (1 unit long), scaled per shot
  markerMesh: null, // enemy marker: crossed red arrows above hostile heads
  ferrisMesh: null,
  staticMeshes: [],
  puddleMesh: null,
  lampPoolMesh: null, // warm ground pools under every streetlight (night)
  carBlobMesh: null,
  charBlobMesh: null,
  spotBlobMesh: null,
  rainMesh: null,
  lightLampMesh: null, // dynamic traffic-light lamps (one mesh, all heads)
  lightLampSig: '', // phase signature the lamp mesh was built from
  jetskiMeshes: [], // one mesh per JETSKI_COLORS entry
  policeBoatMesh: null, // PBPD marine unit hull (uploaded once)
  charMeshes: new Map(), // entity -> dynamic mesh
};

export const canvas = document.getElementById('c');
const errEl = document.getElementById('load-error');
export function showError(msg) {
  errEl.textContent = msg;
  errEl.style.display = 'block';
  console.error(msg);
}
