// policeai.js — Paloma Bay: the PBPD pursuit.
// syncUnits keeps the unit roster in step with the wanted level; new units
// spawn on roads near the player with a matching police car in the world.
// Each car steers toward the player (ramming slightly ahead at 4+ stars),
// deploys a cop on foot when close, and damages the player's car on
// contact. The helicopter orbits with its spotlight tracking; roadblocks
// (two cars across the road ahead) appear at 4+ and clear below 4.

import { clamp, damp, wrapAngle } from './math.js';
import { AVENUES, collideCircle } from './citydata.js';
import { CAR_MODELS } from './vehicles.js';
import { syncUnits } from './police.js';
import { G, cars, enemies, player } from './state.js';
import { spawnCar, spawnEnemy } from './spawning.js';
import { damageCar } from './combat.js';

export function updatePoliceUnits(dt) {
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
  // Chase: steer each police car toward the player. Held units (FLIPPED /
  // ROADBLOCK staged by a mission or screenshot) stay parked.
  for (const u of pol.units) {
    if (u.hold) continue;
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
    if (collideCircle(G.colliders, pos, 2.0)) {
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
