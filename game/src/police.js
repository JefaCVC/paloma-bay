// police.js — the PBPD (Paloma Bay Police Department) wanted system.
// Wanted 0–5 stars. Crimes add heat; heat decays when no unit has line of
// sight. Pursuit units are named (PBPD-1..5, AIR-1), each with a live
// distance and state, shown in the response panel. The helicopter joins at
// 3 stars with a spotlight; roadblocks form at 4. TRACE is the second
// detection meter: it rises while you are seen and drains while hidden —
// when it empties, a star drops. Dispatch chatter makes the AI feel alive.

import { clamp, v3 } from './math.js';

export const MAX_WANTED = 5;

const UNIT_NAMES = ['PBPD-1', 'PBPD-2', 'PBPD-3', 'PBPD-4', 'PBPD-5'];

export const DISPATCH_LINES = [
  'All units: suspect vehicle heading {dir} on {street}.',
  '{unit}: I have visual — {car}, {dist}m out.',
  'Dispatch: AIR-1 is overhead, spotlight on the suspect.',
  '{unit}: Suspect is evading, requesting backup.',
  'Dispatch: roadblock forming at {street}, all units converge.',
  '{unit}: Lost visual — sweeping the area.',
  'Dispatch: suspect is on foot near {street}.',
  '{unit}: Ramming the suspect vehicle now.',
];

export const STREET_NAMES = [
  'La Rambla', 'Harbor Ave', 'Sol Street', 'Palm Heights Blvd',
  'Old Town Road', 'Dockside Way', 'Causeway', 'Isla Verde Lane',
];

export function streetAt(x, z) {
  if (Math.abs(x) < 6 && z > 100) return 'Causeway';
  if (z > 150) return 'Isla Verde Lane';
  if (z > 90) return 'La Rambla';
  if (x < -125) return 'Harbor Ave';
  if (x > 60 && z < 0) return 'Palm Heights Blvd';
  if (x < -60 && z < -45) return 'Old Town Road';
  if (z < -100) return 'Dockside Way';
  return 'Sol Street';
}

export function compassDir(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}

export function createPolice() {
  return {
    wanted: 0,
    heat: 0, // 0..100 within the current star; crimes add, hiding drains
    trace: 0, // 0..100 detection meter
    units: [], // { name, kind: 'car'|'heli', x, z, state, dist }
    heli: null, // { x, y, z, angle } when active
    roadblocks: [], // { x, z, yaw } when active
    lastSeen: 0, // game time of last line-of-sight contact
    chatter: [], // { text, t } recent dispatch lines (HUD feed)
    chatterTimer: 0,
    escapeTimer: 0, // counts down while hidden; a star drops at 0
  };
}

// Crime heat values (added to `heat`; 100 heat = +1 star).
export const CRIME_HEAT = {
  killPed: 60,
  killCop: 100,
  carjack: 35,
  hitAndRun: 25,
  shootNearCop: 40,
  redLight: 15, // running a red light in sight of a cop
  speeding: 0,
};

export function addHeat(police, amount, gameTime) {
  if (police.wanted >= MAX_WANTED) return;
  police.heat += amount;
  while (police.heat >= 100 && police.wanted < MAX_WANTED) {
    police.heat -= 100;
    police.wanted++;
    police.trace = Math.max(police.trace, 60);
  }
  if (police.wanted > 0) police.lastSeen = gameTime;
}

export function setWanted(police, stars, gameTime) {
  police.wanted = clamp(stars, 0, MAX_WANTED);
  police.heat = 0;
  police.trace = stars > 0 ? 70 : 0;
  if (stars > 0) police.lastSeen = gameTime;
  syncUnits(police);
}

// Keep the unit list in step with the wanted level: wanted+1 cars (max 5),
// helicopter at 3+, roadblocks at 4+.
export function syncUnits(police) {
  const want = police.wanted === 0 ? 0 : Math.min(5, police.wanted + 1);
  while (police.units.length < want) {
    const i = police.units.length;
    police.units.push({
      name: UNIT_NAMES[i], kind: 'car',
      x: 0, z: 0, yaw: 0, speed: 0, state: 'RESPONDING', dist: 999,
      spawnT: 0,
    });
  }
  police.units.length = want;
  police.heli = police.wanted >= 3 ? police.heli || { x: 0, y: 26, z: 0, angle: 0, rotor: 0 } : null;
  police.roadblocks = police.wanted >= 4 ? police.roadblocks : [];
}

// Line of sight: any unit within sight range sees the player. (The city is
// open; distance + a short memory is the honest model here.)
export function anyUnitSees(police, px, pz) {
  const SIGHT = 70;
  for (const u of police.units) {
    if (v3.dist2([u.x, 0, u.z], [px, 0, pz]) < SIGHT) return true;
  }
  if (police.heli && v3.dist2([police.heli.x, 0, police.heli.z], [px, 0, pz]) < 90) return true;
  return false;
}

export function updatePolice(police, dt, gameTime, player, onChatter) {
  if (police.wanted === 0) {
    police.trace = Math.max(0, police.trace - dt * 20);
    return;
  }
  const seen = anyUnitSees(police, player.x, player.z);
  if (seen) {
    police.lastSeen = gameTime;
    police.trace = Math.min(100, police.trace + dt * 25);
    police.escapeTimer = 0;
  } else {
    police.trace = Math.max(0, police.trace - dt * 12);
    // Hidden: after 6s of no contact, the escape timer runs; a star drops.
    if (gameTime - police.lastSeen > 6) {
      police.escapeTimer += dt;
      if (police.escapeTimer > 8) {
        police.escapeTimer = 0;
        police.wanted = Math.max(0, police.wanted - 1);
        police.heat = 0;
        if (police.wanted === 0) police.trace = 0;
        syncUnits(police);
      }
    }
  }
  // Unit distances + states (positions are driven by game.js).
  // Staged units (u.hold) keep their assigned state — FLIPPED and
  // ROADBLOCK cars are parked by staging and never re-assigned here.
  for (const u of police.units) {
    u.dist = Math.round(v3.dist2([u.x, 0, u.z], [player.x, 0, player.z]));
    if (u.hold) continue;
    if (police.wanted >= 4 && u.dist < 12) u.state = 'RAMMING';
    else if (police.wanted >= 4 && u.dist < 25) u.state = 'BOXING IN';
    else if (u.dist > 120) u.state = 'EN ROUTE';
    else if (seen) u.state = u.dist < 25 ? 'PURSUING' : 'RESPONDING';
    else u.state = 'SEARCHING';
  }
  // Dispatch chatter every 6–11 seconds while wanted.
  police.chatterTimer -= dt;
  if (police.chatterTimer <= 0) {
    police.chatterTimer = 6 + Math.random() * 5;
    const line = DISPATCH_LINES[Math.floor(Math.random() * DISPATCH_LINES.length)];
    const unit = police.units[0] ? police.units[0].name : 'PBPD-1';
    const text = line
      .replace('{unit}', unit)
      .replace('{dir}', compassDir(player.vx || 1, player.vz || 0))
      .replace('{street}', streetAt(player.x, player.z))
      .replace('{car}', player.carName || 'suspect')
      .replace('{dist}', String(police.units[0] ? police.units[0].dist : 0));
    police.chatter.push({ text, t: gameTime });
    if (police.chatter.length > 3) police.chatter.shift();
    if (onChatter) onChatter(text);
  }
  // Prune old chatter.
  police.chatter = police.chatter.filter((c) => gameTime - c.t < 14);
}

// Clear all heat (respray at the garage, or a clean escape).
export function clearWanted(police) {
  police.wanted = 0;
  police.heat = 0;
  police.trace = 0;
  police.units = [];
  police.heli = null;
  police.roadblocks = [];
  police.chatter = [];
}
