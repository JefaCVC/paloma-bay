// driving.js — Paloma Bay: cars, jet skis, police boats.
// Getting in and out, arcade driving (steer / accel / handbrake drift /
// nitro / near-miss + drift scoring / red-light heat), jet-ski riding on
// the bay (water bounds, island + causeway blocks, anchored-boat push-out,
// wake foam), and the PBPD marine pursuit (updateBoats). Damage from
// crashes and rams flows through combat.js's damageCar.

import { clamp, damp, v3, wrapAngle } from './math.js';
import { BOAT_SPOTS, TRAFFIC_LIGHTS, collideCircle, lightPhase } from './citydata.js';
import { CAR_MODELS } from './vehicles.js';
import { CRIME_HEAT, addHeat } from './police.js';
import { sfxCash, sfxClick, sfxHit, sfxHorn } from './audio.js';
import { toast } from './hud.js';
import { G, boats, cars, player, profile, wakePuffs } from './state.js';
import { damageCar } from './combat.js';

export function enterCar(car) {
  player.inCar = true;
  player.car = car;
  car.kind = 'player';
  player.x = car.x;
  player.z = car.z;
  player.yaw = car.yaw;
  G.camera.yaw = car.yaw;
  if (car.hp <= 0) car.hp = 20;
}

export function exitCar() {
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

// --- jet ski ----------------------------------------------------------------

export function enterJetSki(ski) {
  player.onJetSki = true;
  player.jetski = ski;
  player.x = ski.x;
  player.z = ski.z;
  player.yaw = ski.yaw;
  G.camera.yaw = ski.yaw;
}

export function exitJetSki() {
  const ski = player.jetski;
  if (!ski) return;
  if (ski.z < 152) {
    // Mainland beach: step onto the sand just above the waterline, and
    // beach the ski at the waterline so it stays boardable.
    player.x = ski.x;
    player.z = 138.5;
    player.yaw = Math.PI / 2; // face the city
    ski.z = 141.5;
  } else if (ski.z > 154 && Math.abs(ski.x) < 64) {
    // Isla Verde's north shore.
    player.x = ski.x;
    player.z = 159.5;
    player.yaw = -Math.PI / 2; // face the island
    ski.z = 156.5;
  } else {
    toast('Too far from shore — ride closer to the beach to get off.');
    return;
  }
  player.onJetSki = false;
  player.jetski = null;
  player.speed = 0;
  ski.speed = 0;
  sfxClick();
}

export function updateJetSki(dt) {
  const input = G.input;
  const ski = player.jetski;
  if (!ski) return;
  const steerInput = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
  ski.steer = damp(ski.steer, steerInput, 6, dt);
  if (input.down('KeyW')) ski.speed += 12 * dt;
  if (input.down('KeyS')) ski.speed -= (ski.speed > 0.5 ? 14 : 6) * dt;
  if (!input.down('KeyW') && !input.down('KeyS')) ski.speed = damp(ski.speed, 0, 0.5, dt);
  ski.speed = clamp(ski.speed, -4, 26);
  ski.yaw += ski.steer * clamp(Math.abs(ski.speed) / 8, 0, 1.4) * dt * (ski.speed < 0 ? -1 : 1);
  const fx = Math.cos(ski.yaw), fz = -Math.sin(ski.yaw);
  let nx = ski.x + fx * ski.speed * dt;
  let nz = ski.z + fz * ski.speed * dt;
  // Water bounds: the bay, minus the island and the causeway.
  nx = clamp(nx, -168, 168);
  nz = clamp(nz, 141, 198);
  // Island block (north shore z = 158, radius 1.2): push out along the
  // smallest side so the ski slides around the coast.
  if (nx > -67.2 && nx < 67.2 && nz > 156.8) {
    const pl = nx + 67.2, pr = 67.2 - nx, pt = nz - 156.8;
    if (pt <= pl && pt <= pr) { nz = 156.8; ski.speed *= 0.5; }
    else if (pl < pr) { nx = -67.2; ski.speed *= 0.5; }
    else { nx = 67.2; ski.speed *= 0.5; }
  }
  // Causeway block (|x| < 5.4, z < 159.2): the road slab crosses the bay.
  if (Math.abs(nx) < 5.4 && nz < 159.2 && nz > 140) {
    const pl = nx + 5.4, pr = 5.4 - nx, pb = 159.2 - nz;
    if (pb <= pl && pb <= pr) { nz = 159.2; ski.speed *= 0.5; }
    else if (pl < pr) { nx = -5.4; ski.speed *= 0.5; }
    else { nx = 5.4; ski.speed *= 0.5; }
  }
  // Anchored boats: soft push-out circles.
  for (const b of BOAT_SPOTS) {
    const dx = nx - b.x, dz = nz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      nx = b.x + (dx / d) * 3.4;
      nz = b.z + (dz / d) * 3.4;
      ski.speed *= 0.6;
    }
  }
  ski.x = nx;
  ski.z = nz;
  profile().stats.distanceDriven += Math.abs(ski.speed) * dt;
  player.x = ski.x;
  player.z = ski.z;
  player.yaw = ski.yaw;
  player.speed = Math.abs(ski.speed);
  // Wake: a fading foam puff at the stern while moving.
  ski.wakeT -= dt;
  if (Math.abs(ski.speed) > 6 && ski.wakeT <= 0) {
    ski.wakeT = 0.07;
    wakePuffs.push({
      x: ski.x - fx * 1.4, z: ski.z - fz * 1.4,
      t: G.time, s: 0.9 + Math.abs(ski.speed) * 0.03,
    });
    if (wakePuffs.length > 40) wakePuffs.shift();
  }
  // Camera follows behind the ski.
  const wantYaw = ski.yaw;
  G.camera.yaw = G.camera.yaw + wrapAngle(wantYaw - G.camera.yaw) * Math.min(1, 3.5 * dt);
  if (input.locked) G.camera.yaw -= input.mouseDX * 0.002;
  G.camera.pitch = damp(G.camera.pitch, 0.30, 4, dt);
}

export function updateDriving(dt) {
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
  const hit = collideCircle(G.colliders, pos, 2.0);
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
    // Near miss: threading past a traffic car at speed pays $250 (once per
    // car until it is 8m away again).
    if (d >= 3.4 && d < 5.5 && Math.abs(car.speed) > 15 && other.kind === 'traffic' && !G.nearMissed.has(other)) {
      G.nearMissed.add(other);
      profile().cash += 250;
      G.scorePopups.push({ label: 'NEAR MISS', amount: 250, t: G.time });
      sfxCash();
    }
    if (d > 8) G.nearMissed.delete(other);
  }
  // Drift scoring: handbrake + hard steer at speed builds a chain;
  // releasing after 0.8s pays $50 per chain level (max x5) as a popup.
  if (handbrake && Math.abs(car.steer) > 0.5 && Math.abs(car.speed) > 12) {
    G.driftT += dt;
  } else if (G.driftT > 0.8) {
    const chain = Math.min(5, 1 + Math.floor(G.driftT));
    const amount = 50 * chain;
    profile().cash += amount;
    G.scorePopups.push({ label: 'DRIFT x' + chain, amount, t: G.time });
    sfxCash();
    G.driftT = 0;
  } else {
    G.driftT = 0;
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
  // Running a red light draws heat — once per intersection, only when a
  // cop is close or the player is already wanted.
  for (const light of TRAFFIC_LIGHTS) {
    if (Math.abs(car.x - light.x) < 4.5 && Math.abs(car.z - light.z) < 4.5) {
      const dir = Math.abs(Math.sin(car.yaw)) > 0.7 ? 'ns' : 'ew';
      const key = light.x + ',' + light.z;
      if (lightPhase(light, G.time, G.lightOverrides)[dir] === 'red' && G.redLightFlag !== key) {
        G.redLightFlag = key;
        const nearCop = G.police.units.some((u) => v3.dist2([u.x, 0, u.z], [car.x, 0, car.z]) < 60);
        if (nearCop || G.police.wanted > 0) {
          addHeat(G.police, CRIME_HEAT.redLight, G.gameTime);
          toast('You ran a red light.');
        }
      }
    }
  }
  // Clear the flag once the car leaves every intersection box.
  if (!TRAFFIC_LIGHTS.some((l) => Math.abs(car.x - l.x) < 4.5 && Math.abs(car.z - l.z) < 4.5)) {
    G.redLightFlag = null;
  }
  // Camera follows behind the car (drift-aware: aims at car angle + slide).
  const slide = clamp(car.steer * Math.abs(car.speed) / 20, -1, 1);
  const wantYaw = car.yaw + slide * 0.4;
  G.camera.yaw = G.camera.yaw + wrapAngle(wantYaw - G.camera.yaw) * Math.min(1, 3.5 * dt);
  if (input.locked) G.camera.yaw -= input.mouseDX * 0.002;
  G.camera.pitch = damp(G.camera.pitch, 0.30, 4, dt);
  if (input.hit('KeyH')) sfxHorn();
}

// Marine pursuit: while the player rides a jet ski, the boat steers toward
// them (slower than the ski's top speed, so the chase is escapable); on
// land it idles. Water bounds match the jet ski's (bay minus island and
// causeway).
export function updateBoats(dt) {
  for (const b of boats) {
    if (player.onJetSki) {
      const dx = player.x - b.x, dz = player.z - b.z;
      const d = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dz, dx);
      b.yaw = b.yaw + wrapAngle(wantYaw - b.yaw) * Math.min(1, 2.2 * dt);
      const wantSpeed = d > 10 ? 24 : Math.min(24, Math.abs(player.jetski.speed) + 2);
      b.speed = damp(b.speed, wantSpeed, 1.2, dt);
    } else {
      b.speed = damp(b.speed, 0, 1.5, dt);
    }
    const fx = Math.cos(b.yaw), fz = -Math.sin(b.yaw);
    let nx = b.x + fx * b.speed * dt;
    let nz = b.z + fz * b.speed * dt;
    nx = clamp(nx, -168, 168);
    nz = clamp(nz, 141, 198);
    if (nx > -67.2 && nx < 67.2 && nz > 156.8) {
      const pl = nx + 67.2, pr = 67.2 - nx, pt = nz - 156.8;
      if (pt <= pl && pt <= pr) { nz = 156.8; b.speed *= 0.5; }
      else if (pl < pr) { nx = -67.2; b.speed *= 0.5; }
      else { nx = 67.2; b.speed *= 0.5; }
    }
    if (Math.abs(nx) < 5.4 && nz < 159.2 && nz > 140) {
      const pl = nx + 5.4, pr = 5.4 - nx, pb = 159.2 - nz;
      if (pb <= pl && pb <= pr) { nz = 159.2; b.speed *= 0.5; }
      else if (pl < pr) { nx = -5.4; b.speed *= 0.5; }
      else { nx = 5.4; b.speed *= 0.5; }
    }
    b.x = nx;
    b.z = nz;
    // Wake behind the boat while moving.
    b.wakeT -= dt;
    if (Math.abs(b.speed) > 6 && b.wakeT <= 0) {
      b.wakeT = 0.07;
      wakePuffs.push({
        x: b.x - fx * 2.6, z: b.z - fz * 2.6,
        t: G.time, s: 1.2 + Math.abs(b.speed) * 0.03,
      });
      if (wakePuffs.length > 40) wakePuffs.shift();
    }
  }
}
