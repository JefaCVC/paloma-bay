// combat.js — Paloma Bay: on-foot movement, shooting, damage, death.
// Theo on foot: WASD movement with a sprint, mouse-aim, weapon switching
// (keys + wheel), reload, hitscan fire with per-pellet spread, melee arcs,
// and the damage numbers the combat shot is built around. Damage flows
// through damageEnemy / damagePed / damageCar / damagePlayer; death goes
// through wasted / busted / respawnPlayer. Enemies approach and shoot
// (updateEnemies); pickups + postcards are collected in updatePickups.

import { clamp, damp, v3, wrapAngle } from './math.js';
import { POI, POSTCARDS, collideCircle } from './citydata.js';
import { GAIT_K, muzzlePos } from './characters.js';
import { WEAPONS, WEAPON_ORDER, damageAt } from './weapons.js';
import { CRIME_HEAT, MAX_WANTED, addHeat, clearWanted } from './police.js';
import { sfxClick, sfxHit, sfxPickup, sfxShoot, sfxWasted } from './audio.js';
import { exitPointerLock } from './input.js';
import { showScreen, toast } from './hud.js';
import { fillDeadScreen } from './panels.js';
import { G, cars, enemies, missions, peds, pickups, player, profile } from './state.js';
import { updateCamera } from './camera.js';
import { updateMissionBeacon } from './missionflow.js';

export function updateOnFoot(dt) {
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
    collideCircle(G.colliders, pos, 0.5);
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
  for (const e of enemies) {
    if (e.flashTimer > 0) e.flashTimer -= dt;
    if (e.tracerTimer > 0) e.tracerTimer -= dt;
  }
}

export function reloadWeapon() {
  const loadout = profile().loadout;
  const w = WEAPONS[loadout.current];
  if (w.melee) return;
  const slot = loadout.owned[loadout.current];
  if (slot.mag >= w.mag || slot.reserve <= 0 || player.reloadTimer > 0) return;
  player.reloadTimer = 0.8;
}

export function finishReload() {
  const loadout = profile().loadout;
  const w = WEAPONS[loadout.current];
  const slot = loadout.owned[loadout.current];
  const need = w.mag - slot.mag;
  const take = Math.min(need, slot.reserve);
  slot.mag += take;
  slot.reserve -= take;
}

export function fireWeapon() {
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
    for (const b of G.colliders) {
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

export function damageEnemy(e, dmg, fromX, fromZ) {
  e.hp -= dmg;
  // Floating damage number over the enemy (projected in hudView).
  G.damageNumbers.push({
    x: e.x, y: 1.9, z: e.z, text: '−' + dmg,
    sub: dmg >= 40 ? 'HEAVY HIT' : null, t: G.time,
  });
  if (G.damageNumbers.length > 12) G.damageNumbers.shift();
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    e.deadT = G.time;
    profile().stats.kills++;
    if (G.combatTotal > 0) G.combatDown++;
    if (Math.random() < 0.5) {
      pickups.push({ kind: 'ammo', weapon: e.weapon, x: e.x, z: e.z, t: G.time });
    }
    if (e.kind === 'cop') addHeat(G.police, CRIME_HEAT.killCop, G.gameTime);
  }
}

export function damagePed(pd, dmg) {
  pd.hp -= dmg;
  pd.flee = 6;
  if (pd.hp <= 0 && !pd.dead) {
    pd.dead = true;
    pd.deadT = G.time;
    addHeat(G.police, CRIME_HEAT.killPed, G.gameTime);
    toast('A pedestrian is down. The PBPD was notified.');
  }
}

export function damageCar(car, dmg) {
  car.hp -= dmg;
  if (car.hp <= 0 && car.hp + dmg > 0) {
    car.speed = 0;
    if (car === player.car) toast('Your car is wrecked. Find another ride.');
  }
}

export function damagePlayer(dmg, fromX, fromZ) {
  // Armour absorbs damage first, then health.
  const absorbed = Math.min(player.armor, dmg);
  player.armor -= absorbed;
  player.hp -= (dmg - absorbed);
  G.lastDamageT = G.gameTime;
  if (player.hp <= 0) {
    player.hp = 0;
    wasted();
  }
}

export function wasted() {
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

export function busted() {
  const cost = Math.min(250, profile().cash);
  profile().cash -= cost;
  clearWanted(G.police);
  failActiveMission();
  exitPointerLock();
  G.mode = 'dead';
  fillDeadScreen('busted');
  showScreen('dead-screen');
}

export function failActiveMission() {
  if (missions().active) {
    missions().active = null;
    enemies.length = 0;
    updateMissionBeacon();
    toast('MISSION FAILED — return to the marker to retry.');
  }
}

export function respawnPlayer() {
  player.hp = 100;
  player.armor = 50;
  player.x = POI.safehouse.x;
  player.z = POI.safehouse.z + 10;
  player.yaw = 0;
  player.inCar = false;
  player.car = null;
  player.onJetSki = false;
  player.jetski = null;
  player.speed = 0;
  G.mode = 'play';
  G.camera.yaw = player.yaw;
  G.camView = updateCamera(2); // snap the camera behind the player, as in startPlay.
  showScreen(null);
}

export function updateEnemies(dt) {
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
      collideCircle(G.colliders, pos, 0.5);
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
        // Return fire is visible: a muzzle flash + a tracer streaking at
        // the player, so a gunfight reads as a gunfight.
        const em = muzzlePos(e.x, 0, e.z, e.yaw, 0.6);
        e.flashAt = em;
        e.flashTimer = 0.06;
        e.tracerFrom = em;
        e.tracerTo = [player.x, 1.2, player.z];
        e.tracerTimer = 0.06;
        sfxShoot(e.weapon);
      }
    }
  }
  // Remove long-dead enemies.
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead && G.time - enemies[i].deadT > 8) enemies.splice(i, 1);
  }
}

export function updatePickups(dt) {
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
