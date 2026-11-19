// weather.js — Paloma Bay: the clock, the rain, the sky.
// One game hour per 90 real seconds; rain rolls in on a timer (25% chance
// each roll) and fades via damp. The rain streaks are 260 drops in a box
// around the camera, rebuilt every frame into the shared rain mesh while
// it rains; the sky module owns the sun, the wet-road factor and the
// window lights.

import { damp, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';
import { camPos, updateMesh } from './render.js';
import { updateSky } from './sky.js';
import { G, meshes } from './state.js';

export function updateWeather(dt) {
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

let rainDrops = [];
export function initRain() {
  const rng = rng32(4242);
  rainDrops = [];
  for (let i = 0; i < 260; i++) {
    rainDrops.push({
      x: (rng() - 0.5) * 60, y: rng() * 30, z: (rng() - 0.5) * 60,
      speed: 20 + rng() * 8,
    });
  }
}

export function rebuildRain(dt) {
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
  updateMesh(meshes.rainMesh, bd.build());
}
