// camera.js — Paloma Bay: the chase camera + photo mode.
// One camera with four behaviours: the title orbit (a slow drift along
// the beachfront), the driving chase (distance + FOV grow with speed,
// drift-aware yaw), the jet-ski chase, and the on-foot third person
// (closer when aiming, kept out of the ground and the buildings). Photo
// mode freezes the world and hands the player a free orbit camera with
// five CSS filters. G.camDistOverride (set only by the screenshot
// stager) pins the chase distance for a closer staged frame.

import { clamp, damp } from './math.js';
import { collideCircle } from './citydata.js';
import { camPos } from './render.js';
import { sfxClick } from './audio.js';
import { exitPointerLock, requestPointerLock } from './input.js';
import { G, canvas, player } from './state.js';

// Photo-mode filters (CSS filters on the canvas — free, instant, no shader work).
export const PHOTO_FILTERS = [
  { name: 'NONE', css: 'none' },
  { name: 'GOLDEN', css: 'sepia(0.25) saturate(1.3) contrast(1.05)' },
  { name: 'NOIR', css: 'grayscale(1) contrast(1.15) brightness(1.05)' },
  { name: 'VIVID', css: 'saturate(1.6) contrast(1.08)' },
  { name: 'TEAL', css: 'hue-rotate(-15deg) saturate(1.2) contrast(1.05)' },
];
let photoFilterIdx = 0;

// Staged camera distance (G.camDistOverride) wins over the speed-based
// default; null means live play — the default applies untouched.
function camDist(def) {
  return G.camDistOverride != null ? G.camDistOverride : def;
}

export function updateCamera(dt) {
  const cam = G.camera;
  // Photo mode: the free orbit camera (world frozen).
  if (G.photoMode && G.photoCam) {
    const pc = G.photoCam;
    const bx = pc.target[0] - Math.cos(pc.yaw) * Math.cos(pc.pitch) * pc.dist;
    const bz = pc.target[2] + Math.sin(pc.yaw) * Math.cos(pc.pitch) * pc.dist;
    camPos[0] = bx;
    camPos[1] = Math.max(0.6, pc.target[1] + Math.sin(pc.pitch) * pc.dist);
    camPos[2] = bz;
    return { target: pc.target, fov: 55 };
  }
  if (G.mode === 'title') {
    // Slow drift along the sand at the west end of the beachfront,
    // looking east: the billboard FACES, the Wheel, palms, umbrellas
    // and the skyline read behind the menu. (Looking west showed the
    // boards' black backs.)
    const t = G.time * 0.05;
    camPos[0] = 14 + Math.sin(t) * 8;
    camPos[1] = 3.2 + Math.sin(t * 0.6) * 0.4;
    camPos[2] = 116 + Math.sin(t * 0.8) * 2;
    return { target: [70, 3.5, 106], fov: 60 };
  }
  if (player.inCar && player.car) {
    const car = player.car;
    const speed = Math.abs(car.speed);
    const dist = camDist(7 + speed * 0.08);
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
  if (player.onJetSki && player.jetski) {
    const ski = player.jetski;
    const speed = Math.abs(ski.speed);
    const dist = 6.5 + speed * 0.06;
    const height = 2.4 + speed * 0.01;
    const bx = ski.x - Math.cos(cam.yaw) * dist;
    const bz = ski.z + Math.sin(cam.yaw) * dist;
    camPos[0] = damp(camPos[0], bx, 6, dt);
    camPos[1] = damp(camPos[1], height, 6, dt);
    camPos[2] = damp(camPos[2], bz, 6, dt);
    const fov = 60 + Math.min(14, speed * 0.4);
    cam.fov = damp(cam.fov, fov, 4, dt);
    return { target: [ski.x + Math.cos(ski.yaw) * 2, 1.2, ski.z - Math.sin(ski.yaw) * 2], fov: cam.fov };
  }
  // On foot: third person behind the camera yaw.
  const dist = camDist(player.aiming > 0.5 ? 3.4 : 5.6);
  const height = 2.0 + Math.sin(cam.pitch) * 2.2;
  const bx = player.x - Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
  const bz = player.z + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
  camPos[0] = damp(camPos[0], bx, 10, dt);
  camPos[1] = damp(camPos[1], height, 10, dt);
  camPos[2] = damp(camPos[2], bz, 10, dt);
  // Keep the camera out of the ground and out of buildings.
  if (camPos[1] < 0.6) camPos[1] = 0.6;
  const cpos = [camPos[0], 0, camPos[2]];
  collideCircle(G.colliders, cpos, 0.6);
  camPos[0] = cpos[0];
  camPos[2] = cpos[2];
  const fov = player.aiming > 0.5 ? 50 : 62;
  cam.fov = damp(cam.fov, fov, 8, dt);
  return { target: [player.x, 1.4, player.z], fov: cam.fov };
}

// --- photo mode ---------------------------------------------------------------
// Freezes the world and hands the player an orbit camera with five filters.
// Enter with P from play mode; exit with P. The HUD is hidden while active
// and the control bar hides with H for a clean frame.
export function enterPhotoMode() {
  if (G.mode !== 'play') return;
  G.photoMode = true;
  photoFilterIdx = 0;
  canvas.style.filter = 'none';
  G.photoCam = {
    yaw: G.camera.yaw, pitch: 0.35, dist: 8,
    target: [player.x, 1.5, player.z],
  };
  document.getElementById('hud').style.display = 'none';
  const bar = document.getElementById('photo-bar');
  if (bar) {
    bar.style.display = 'block';
    updatePhotoBar();
  }
  requestPointerLock(canvas);
  sfxClick();
}

export function exitPhotoMode() {
  G.photoMode = false;
  G.photoCam = null;
  canvas.style.filter = 'none';
  document.getElementById('hud').style.display = 'block';
  const bar = document.getElementById('photo-bar');
  if (bar) bar.style.display = 'none';
  exitPointerLock();
  sfxClick();
}

export function updatePhotoBar() {
  const name = document.getElementById('photo-filter');
  if (name) name.textContent = PHOTO_FILTERS[photoFilterIdx].name;
}

export function updatePhotoMode(dt) {
  const input = G.input;
  const pc = G.photoCam;
  if (!pc) return;
  if (input.hit('KeyP')) {
    exitPhotoMode();
    return;
  }
  if (input.hit('KeyH')) {
    const bar = document.getElementById('photo-bar');
    if (bar) bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
  }
  for (let i = 0; i < PHOTO_FILTERS.length; i++) {
    if (input.hit('Digit' + (i + 1))) {
      photoFilterIdx = i;
      canvas.style.filter = PHOTO_FILTERS[i].css;
      updatePhotoBar();
      sfxClick();
    }
  }
  // Click re-locks the pointer after Esc released it (Esc exits pointer lock
  // without reaching the page, so P stays the reliable exit).
  if (input.mousePressed && !input.locked) requestPointerLock(canvas);
  // Orbit with the mouse, zoom with the wheel, WASD glides the orbit target.
  if (input.locked) {
    pc.yaw -= input.mouseDX * 0.0028;
    pc.pitch = clamp(pc.pitch + input.mouseDY * 0.0022, -0.05, 1.2);
  }
  if (input.wheel !== 0) {
    pc.dist = clamp(pc.dist + input.wheel * 1.2, 3, 30);
  }
  const fx = Math.cos(pc.yaw), fz = -Math.sin(pc.yaw);
  const rx = -fz, rz = fx; // right vector
  let mx = 0, mz = 0;
  if (input.down('KeyW')) { mx += fx; mz += fz; }
  if (input.down('KeyS')) { mx -= fx; mz -= fz; }
  if (input.down('KeyD')) { mx += rx; mz += rz; }
  if (input.down('KeyA')) { mx -= rx; mz -= rz; }
  if (mx !== 0 || mz !== 0) {
    const len = Math.hypot(mx, mz);
    pc.target[0] += (mx / len) * 8 * dt;
    pc.target[2] += (mz / len) * 8 * dt;
    pc.target[0] = clamp(pc.target[0], -170, 170);
    pc.target[2] = clamp(pc.target[2], -150, 240);
  }
  if (input.down('KeyR')) pc.target[1] = clamp(pc.target[1] + 6 * dt, 0.5, 30);
  if (input.down('KeyF')) pc.target[1] = clamp(pc.target[1] - 6 * dt, 0.5, 30);
}
