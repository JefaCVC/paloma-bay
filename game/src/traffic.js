// traffic.js — Paloma Bay: traffic lights, traffic cars, pedestrians.
// The signal system: a phase signature (one letter per intersection)
// rebuilds the 40 lamp heads only when a phase flips. Traffic cars drive
// their roads, stop at red (yellow only when far enough to stop), slow
// for the car ahead, turn at intersections, and recycle near the player.
// Pedestrians walk sidewalk loops, flee from the player, and cross at the
// painted crosswalks only while their road is red.

import { clamp, damp, v3, wrapAngle } from './math.js';
import { AVENUES, STREETS, TRAFFIC_LIGHTS, collideCircle, lightPhase } from './citydata.js';
import { CAR_MODELS } from './vehicles.js';
import { GAIT_K } from './characters.js';
import { updateMesh } from './render.js';
import { buildTrafficLightLamps } from './streetprops.js';
import { G, LIGHT_BY_KEY, cars, meshes, peds, player } from './state.js';
import { damagePed } from './combat.js';

// --- traffic lights ---------------------------------------------------------
// Phase signature: one letter per intersection ('g'/'y'/'r' for the NS
// direction). The lamp mesh rebuilds only when the signature changes, so
// the 40 lamp heads cost one upload per phase flip.
export function lightSignature(t) {
  return TRAFFIC_LIGHTS.map((l) => {
    const p = lightPhase(l, t, G.lightOverrides);
    return p.ns === 'green' ? 'g' : p.ns === 'yellow' ? 'y' : 'r';
  }).join('');
}

export function refreshLightLamps(t) {
  const sig = lightSignature(t);
  if (sig !== meshes.lightLampSig) {
    meshes.lightLampSig = sig;
    updateMesh(meshes.lightLampMesh, buildTrafficLightLamps(t, G.lightOverrides).build());
  }
}

// Must a car travelling in `dir` ('ns' | 'ew') stop at intersection (av, st)?
// Red always stops; yellow stops only when far enough to stop comfortably.
export function mustStopAtLight(av, st, dir, distToStopLine, t) {
  const light = LIGHT_BY_KEY.get(av + ',' + st);
  if (!light) return false;
  const phase = lightPhase(light, t, G.lightOverrides)[dir];
  if (phase === 'red') return true;
  if (phase === 'yellow') return distToStopLine > 6;
  return false;
}

export function updateTraffic(dt) {
  for (const car of cars) {
    if (car.kind !== 'traffic' || !car.ai) continue;
    const ai = car.ai;
    const model = CAR_MODELS[car.model];
    // Drive along the current road; at intersections, sometimes turn.
    car.speed = damp(car.speed, ai.speed, 2, dt);
    // Traffic lights: stop at the stop line on red (or on yellow when far
    // enough to stop comfortably). The stop line sits 7.5 units before the
    // intersection centre, clear of the crosswalk.
    const alongZ = Math.abs(Math.sin(car.yaw)) > 0.7;
    let stopAt = null; // { axis: 'x'|'z', line, dir }
    if (alongZ) {
      const av = AVENUES.find((a) => Math.abs(car.x - a) < 2);
      const dirZ = Math.sign(-Math.sin(car.yaw)) || 1;
      if (av !== undefined) {
        const st = STREETS.find((s) => (s - car.z) * dirZ > 0 && Math.abs(s - car.z) < 16);
        if (st !== undefined) {
          const line = st - dirZ * 7.5;
          const dist = (line - car.z) * dirZ;
          if (dist > 0 && mustStopAtLight(av, st, 'ns', dist, G.time)) {
            stopAt = { axis: 'z', line, dir: dirZ };
          }
        }
      }
    } else {
      const st = STREETS.find((s) => Math.abs(car.z - s) < 2);
      const dirX = Math.sign(Math.cos(car.yaw)) || 1;
      if (st !== undefined) {
        const av = AVENUES.find((a) => (a - car.x) * dirX > 0 && Math.abs(a - car.x) < 16);
        if (av !== undefined) {
          const line = av - dirX * 7.5;
          const dist = (line - car.x) * dirX;
          if (dist > 0 && mustStopAtLight(av, st, 'ew', dist, G.time)) {
            stopAt = { axis: 'x', line, dir: dirX };
          }
        }
      }
    }
    if (stopAt) car.speed = damp(car.speed, 0, 6, dt);
    const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw);
    let nx = car.x + fx * car.speed * dt;
    let nz = car.z + fz * car.speed * dt;
    // Never creep past the stop line.
    if (stopAt) {
      if (stopAt.axis === 'z') {
        if ((nz - stopAt.line) * stopAt.dir > 0) { nz = stopAt.line; car.speed = 0; }
      } else if ((nx - stopAt.line) * stopAt.dir > 0) { nx = stopAt.line; car.speed = 0; }
    }
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
    if (collideCircle(G.colliders, pos, 1.8)) {
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

export function updatePeds(dt) {
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
    // Crosswalk rule: a crossing ped waits on the kerb while avenue
    // traffic has the green — they cross only on the avenue's red.
    let waiting = false;
    if (pd.cross && pd.flee <= 0) {
      const { av, st } = pd.cross;
      const wp = pd.path[pd.pathI];
      const headingAcross = Math.sign(wp[0] - av) !== Math.sign(pd.x - av);
      if (headingAcross && Math.abs(pd.x - av) > 4.5) {
        const light = LIGHT_BY_KEY.get(av + ',' + st);
        if (light && lightPhase(light, G.time, G.lightOverrides).ns !== 'red') {
          waiting = true;
        }
      }
    }
    if (waiting) speed = 0;
    pd.walking = waiting ? 0 : 1;
    const dx = tx - pd.x, dz = tz - pd.z;
    const d = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dz, dx);
    pd.yaw = pd.yaw + wrapAngle(wantYaw - pd.yaw) * Math.min(1, 6 * dt);
    const step = Math.min(d, speed * dt);
    const nx = pd.x + Math.cos(pd.yaw) * step;
    const nz = pd.z - Math.sin(pd.yaw) * step;
    const pos = [nx, 0, nz];
    collideCircle(G.colliders, pos, 0.4);
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
