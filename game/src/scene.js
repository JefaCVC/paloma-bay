// scene.js — Paloma Bay: the renderer.
// One frame: sky, static chunks, traffic lamps, the rotating Ferris
// wheel, the mission beacon, postcards, ammo pickups, cars (body + glass
// pass + wheels + siren bars + contact shadows + siren wash), jet skis
// and police boats with wake foam, the player (on foot / in a car / on a
// jet ski), pedestrians, enemies (with hostile markers, muzzle flashes
// and tracers), the police helicopter with its spotlight cone, rain
// puddles, lamp pools and rain streaks. Character meshes rebuild per
// frame (far-away ones only every 6th frame — the LOD). projectWorld
// turns a world point into screen pixels for the damage numbers.

import { clamp, frame, m4 } from './math.js';
import { POI, POSTCARDS } from './citydata.js';
import { CAR_MODELS } from './vehicles.js';
import { THEO_LOOK, buildCharacter } from './characters.js';
import { sky } from './sky.js';
import {
  beginFrame, camPos, drawBlob, drawLit, drawSky,
  updateMesh, uploadMesh,
} from './render.js';
import {
  G, boats, canvas, cars, enemies, jetskis, meshes, peds, pickups,
  player, profile, wakePuffs,
} from './state.js';
import { carBodyMesh, carGlassMesh } from './spawning.js';
import { refreshLightLamps } from './traffic.js';
import { updateCamera } from './camera.js';

export function charMeshFor(entity, look, pose) {
  let mesh = meshes.charMeshes.get(entity);
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
    meshes.charMeshes.set(entity, mesh);
  } else {
    updateMesh(mesh, built);
  }
  return mesh;
}

// Model matrix for a car: flipped cars lie on their side (pitch ~90 deg
// around the forward axis, origin lifted so the flank rests on the ground);
// normal cars sit on the road. Used by BOTH the body loop and the glass
// pass, so a flipped car never keeps an upright glasshouse.
export function carFrame(car) {
  if (car.flipped) {
    return frame(car.x, 1.0, car.z, car.yaw, car.flipPitch || Math.PI / 2, 0, 1);
  }
  return frame(car.x, 0.02, car.z, car.yaw, 0, 0, 1);
}

// Project a world point to screen pixels (for damage numbers). Returns
// null when behind the camera or far outside the frame.
export function projectWorld(x, y, z) {
  const vp = G.lastVP;
  if (!vp) return null;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0) return null;
  const nx = cx / cw, ny = cy / cw;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const sx = (nx * 0.5 + 0.5) * w;
  const sy = (1 - (ny * 0.5 + 0.5)) * h;
  if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) return null;
  return { sx, sy };
}

export function renderFrame(t) {
  const cam = G.camView || updateCamera(2);
  const view = m4.lookAt(camPos, cam.target, [0, 1, 0]);
  const proj = m4.perspective((cam.fov * Math.PI) / 180, canvas.width / canvas.height, 0.1, 500);
  const vp = m4.multiply(proj, view);
  G.lastVP = vp; // damage-number projection uses the last rendered frame
  const invVP = m4.invert(vp);
  const IDENT = m4.identity();
  // One tracer streak, shared by the player and every enemy: a unit box
  // stretched from muzzle to target.
  const drawTracer = (from, to) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    const yaw = Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
    const pitch = Math.asin((to[1] - from[1]) / Math.max(len, 0.01));
    const trM = m4.multiply(
      frame(mid[0], mid[1], mid[2], yaw, -pitch, 0, 1),
      m4.scaleXYZ(len, 1, 1),
    );
    drawLit(meshes.tracerMesh, trM, m4.multiply(vp, trM), t, 0.8, true);
  };

  beginFrame();
  drawSky(invVP);

  // Static world (merged chunks).
  for (const mesh of meshes.staticMeshes) drawLit(mesh, IDENT, vp, t, 1);

  // Traffic-light lamps (one dynamic mesh, rebuilt when a phase flips).
  refreshLightLamps(t);
  drawLit(meshes.lightLampMesh, IDENT, vp, t, 1);

  // Ferris wheel (rotates slowly around its axle). The wheel mesh is built in
  // the XY plane with the axle along Z, matching the support towers.
  {
    const F = POI.ferris;
    const wheelM = frame(F.x, 12.5, F.z, 0, 0, 0, 1);
    const spinM = m4.multiply(wheelM, frame(0, 0, 0, 0, 0, t * 0.12, 1));
    drawLit(meshes.ferrisMesh, spinM, m4.multiply(vp, spinM), t, 1);
  }

  // Mission beacon.
  if (G.missionBeacon) {
    const b = G.missionBeacon;
    const pulse = 0.75 + Math.sin(t * 3) * 0.25;
    const bm = frame(b.x, 0.1, b.z, 0, 0, 0, 1);
    drawLit(meshes.beaconMesh, bm, m4.multiply(vp, bm), t, pulse, true);
  }

  // Postcards (uncollected).
  const collected = new Set(profile().postcards);
  POSTCARDS.forEach(([x, z], i) => {
    if (collected.has(i)) return;
    const pm = frame(x, 0, z, t * 0.8, 0, 0, 1);
    drawLit(meshes.postcardMesh, pm, m4.multiply(vp, pm), t, 1);
  });

  // Ammo pickups.
  for (const pk of pickups) {
    const bob = Math.sin(t * 3 + pk.x) * 0.1;
    const am = frame(pk.x, 0.1 + bob, pk.z, t, 0, 0, 1);
    drawLit(meshes.ammoMesh, am, m4.multiply(vp, am), t, 1);
  }

  // Cars.
  for (const car of cars) {
    const model = CAR_MODELS[car.model];
    const carM = carFrame(car);
    const roll = car.flipped ? 0 : car.steer * Math.min(1, Math.abs(car.speed) / 20) * 0.05;
    const bodyM = m4.multiply(carM, frame(0, 0, 0, 0, 0, roll, 1));
    drawLit(carBodyMesh(car.model, car.colorIdx), bodyM, m4.multiply(vp, bodyM), t, 1);
    for (const wx of model.wheelX) {
      for (const wz of [-model.width + 0.13, model.width - 0.13]) {
        const wm = m4.multiply(carM, frame(wx, model.wr, wz, 0, 0, car.spin, model.wr));
        drawLit(meshes.wheelMesh, wm, m4.multiply(vp, wm), t, 1);
      }
    }
    // Police light bar: red left half + blue right half, alternating
    // which side is bright (4 Hz). Both colours always read — the dim
    // side stays visibly coloured, so a frozen frame still shows red
    // on one side and blue on the other.
    if (car.model === 'police') {
      const phase = Math.floor(t * 4) % 2 === 0;
      drawLit(phase ? meshes.lightBarMeshes.redBright : meshes.lightBarMeshes.redDim, carM, m4.multiply(vp, carM), t, 1);
      drawLit(phase ? meshes.lightBarMeshes.blueDim : meshes.lightBarMeshes.blueBright, carM, m4.multiply(vp, carM), t, 1);
    }
    // Contact shadow.
    drawBlob(meshes.carBlobMesh, m4.multiply(vp, frame(car.x, 0.04, car.z, car.yaw, 0, 0, 1)), [0.05, 0.03, 0.02, 0.38]);
    // Siren wash: the flashing bar spills alternating red/blue light onto
    // the road around the car (drawn after the shadow so it blends over).
    if (car.model === 'police') {
      const phase = Math.floor(t * 4) % 2 === 0;
      const glow = phase ? [1.0, 0.12, 0.10, 0.16] : [0.15, 0.35, 1.0, 0.16];
      drawBlob(meshes.spotBlobMesh, m4.multiply(vp, frame(car.x, 0.06, car.z, 0, 0, 0, 0.9)), glow);
    }
  }

  // Jet skis (bobbing on the swell, pitching with speed, rolling in turns).
  // The hull frame sits at y = -0.38 so the keel rides in the water plane.
  for (const ski of jetskis) {
    const bobY = Math.sin(t * 1.6 + ski.x * 0.15 + ski.bobPhase) * 0.07;
    const pitch = Math.sin(t * 1.3 + ski.z * 0.1 + ski.bobPhase) * 0.03
      + clamp(ski.speed * 0.003, 0, 0.06);
    const roll = -ski.steer * clamp(Math.abs(ski.speed) / 20, 0, 1) * 0.12;
    const skiM = frame(ski.x, -0.38 + bobY, ski.z, ski.yaw, pitch, roll, 1);
    drawLit(meshes.jetskiMeshes[ski.colorIdx % meshes.jetskiMeshes.length], skiM, m4.multiply(vp, skiM), t, 1);
    drawBlob(meshes.carBlobMesh, m4.multiply(vp, frame(ski.x, -0.35, ski.z, ski.yaw, 0, 0, 1)), [0.02, 0.05, 0.08, 0.25]);
  }
  // Police boats (PBPD marine units): bobbing hulls with lit light bars.
  for (const b of boats) {
    const bobY = Math.sin(t * 1.6 + b.x * 0.15 + b.bobPhase) * 0.07;
    const pitch = Math.sin(t * 1.3 + b.z * 0.1 + b.bobPhase) * 0.03
      + clamp(b.speed * 0.002, 0, 0.05);
    const roll = -b.steer * clamp(Math.abs(b.speed) / 20, 0, 1) * 0.08;
    const boatM = frame(b.x, -0.35 + bobY, b.z, b.yaw, pitch, roll, 1);
    if (meshes.policeBoatMesh) drawLit(meshes.policeBoatMesh, boatM, m4.multiply(vp, boatM), t, 1);
    drawBlob(meshes.carBlobMesh, m4.multiply(vp, frame(b.x, -0.35, b.z, b.yaw, 0, 0, 1.6)), [0.02, 0.05, 0.08, 0.25]);
  }
  // Wake foam: fading white discs that grow as they age.
  for (let i = wakePuffs.length - 1; i >= 0; i--) {
    const w = wakePuffs[i];
    const age = t - w.t;
    if (age > 1.4) { wakePuffs.splice(i, 1); continue; }
    const a = 0.45 * (1 - age / 1.4);
    const s = (w.s + age * 1.2) / 5; // spotBlobMesh is a 5-unit disc
    drawBlob(meshes.spotBlobMesh, m4.multiply(vp, frame(w.x, -0.35, w.z, 0, 0, 0, s)), [1, 1, 1, a]);
  }

  // Player on the jet ski: seated, hands on the bars, bobbing with the hull.
  if (player.onJetSki && player.jetski) {
    const ski = player.jetski;
    const bobY = Math.sin(t * 1.6 + ski.x * 0.15 + ski.bobPhase) * 0.07;
    const pitch = Math.sin(t * 1.3 + ski.z * 0.1 + ski.bobPhase) * 0.03
      + clamp(ski.speed * 0.003, 0, 0.06);
    const roll = -ski.steer * clamp(Math.abs(ski.speed) / 20, 0, 1) * 0.12;
    const mesh = charMeshFor(player, THEO_LOOK, {
      phase: 0, walking: 0, breathe: 1, breathT: t * 1.6,
      aiming: 0, weapon: null, swing: 0, sitting: 1,
    });
    const chM = frame(ski.x, -0.38 + bobY, ski.z, ski.yaw, pitch, roll, 1);
    drawLit(mesh, chM, m4.multiply(vp, chM), t, 1);
  } else if (!player.inCar) {
    // Player character (on foot).
    const mesh = charMeshFor(player, THEO_LOOK, {
      phase: player.phase, walking: player.walking,
      breathe: 1 - player.walking * 0.85, breathT: t * 1.6,
      aiming: player.aiming, weapon: profile().loadout.current, swing: player.swing,
    });
    const chM = frame(player.x, 0.02, player.z, player.yaw, 0, 0, 1);
    drawLit(mesh, chM, m4.multiply(vp, chM), t, 1);
    drawBlob(meshes.charBlobMesh, m4.multiply(vp, frame(player.x, 0.05, player.z, 0, 0, 0, 1)), [0.05, 0.03, 0.02, 0.32]);
    // Muzzle flash + tracer.
    if (player.flashTimer > 0 && player.flashAt) {
      const fm = frame(player.flashAt[0], player.flashAt[1], player.flashAt[2], player.yaw, 0, 0, 1);
      drawLit(meshes.flashMesh, fm, m4.multiply(vp, fm), t, 1, true);
    }
    if (player.tracerTimer > 0 && player.tracerFrom && player.tracerTo) {
      drawTracer(player.tracerFrom, player.tracerTo);
    }
  }

  // Pedestrians.
  for (const pd of peds) {
    if (pd.dead && G.time - pd.deadT > 8) continue;
    const mesh = charMeshFor(pd, pd.look, {
      phase: pd.phase, walking: pd.dead ? 0 : (pd.walking === undefined ? 1 : pd.walking),
      breathe: 1, breathT: t * 1.6 + pd.x, aiming: 0, weapon: null, swing: 0,
    });
    const fall = pd.dead ? Math.min(1, (G.time - pd.deadT) * 3) : 0;
    // A falling body rotates around its feet, so half the torso ends up
    // below the ground; lift it as it falls so it lies ON the street.
    const chM = frame(pd.x, 0.02 + fall * 0.22, pd.z, pd.yaw, 0, -fall * (Math.PI / 2), 1);
    drawLit(mesh, chM, m4.multiply(vp, chM), t, 1);
    if (!pd.dead) drawBlob(meshes.charBlobMesh, m4.multiply(vp, frame(pd.x, 0.05, pd.z, 0, 0, 0, 1)), [0.05, 0.03, 0.02, 0.3]);
  }

  // Enemies (thugs + cops).
  for (const e of enemies) {
    if (e.dead && G.time - e.deadT > 8) continue;
    const mesh = charMeshFor(e, e.look, {
      phase: e.phase, walking: e.dead ? 0 : e.walking,
      breathe: 1, breathT: t * 1.6 + e.x, aiming: e.aiming, weapon: e.weapon, swing: 0,
    });
    const fall = e.dead ? Math.min(1, (G.time - e.deadT) * 3) : 0;
    // A falling body rotates around its feet, so half the torso ends up
    // below the ground; lift it as it falls so it lies ON the street.
    const chM = frame(e.x, 0.02 + fall * 0.22, e.z, e.yaw, 0, -fall * (Math.PI / 2), 1);
    drawLit(mesh, chM, m4.multiply(vp, chM), t, 1);
    if (!e.dead) drawBlob(meshes.charBlobMesh, m4.multiply(vp, frame(e.x, 0.05, e.z, 0, 0, 0, 1)), [0.05, 0.03, 0.02, 0.3]);
    // Fallen enemies leave a dark stain on the ground — at night a
    // dark-clothed body on dark asphalt is otherwise invisible, and the
    // "2 down" story needs a visible body.
    else drawBlob(meshes.charBlobMesh, m4.multiply(vp, frame(e.x, 0.05, e.z, 0, 0, 0, 2.2)), [0.55, 0.08, 0.08, 0.8]);
    if (e.dead) continue;
    // Hostile marker: a red arrow floating above the head, bobbing and
    // gently pulsing so hostiles read instantly.
    const bob = Math.sin(t * 3 + e.x * 0.7 + e.z) * 0.12;
    const pulse = 1 + Math.sin(t * 3 + e.x) * 0.08;
    const mkM = frame(e.x, 2.45 + bob, e.z, 0, 0, 0, pulse);
    drawLit(meshes.markerMesh, mkM, m4.multiply(vp, mkM), t, 1);
    // Enemy muzzle flash + return-fire tracer.
    if (e.flashTimer > 0 && e.flashAt) {
      const fm = frame(e.flashAt[0], e.flashAt[1], e.flashAt[2], e.yaw, 0, 0, 1);
      drawLit(meshes.flashMesh, fm, m4.multiply(vp, fm), t, 1, true);
    }
    if (e.tracerTimer > 0 && e.tracerFrom && e.tracerTo) {
      drawTracer(e.tracerFrom, e.tracerTo);
    }
  }

  // Police helicopter + spotlight.
  if (G.police.heli) {
    const h = G.police.heli;
    const heliM = frame(h.x, h.y, h.z, Math.atan2(-(player.z - h.z), player.x - h.x) + Math.PI, 0, 0, 1);
    drawLit(meshes.heliMeshes.body, heliM, m4.multiply(vp, heliM), t, 1);
    const rotorM = m4.multiply(heliM, frame(0, 0, 0, h.rotor, 0, 0, 1));
    drawLit(meshes.heliMeshes.rotor, rotorM, m4.multiply(vp, rotorM), t, 1);
    // Tail rotor: translate onto the fin hub, then spin about Z (its axle).
    const tailM = m4.multiply(heliM, m4.multiply(
      m4.translate(4.9, 1.45, 0.18), m4.rotateZ(h.rotor * 2),
    ));
    drawLit(meshes.heliMeshes.tailRotor, tailM, m4.multiply(vp, tailM), t, 1);
    // Spotlight cone from the heli down to the player + ground disc.
    const coneM = frame(h.x, h.y - 1, h.z, 0, 0, 0, 1);
    drawLit(meshes.heliMeshes.cone, coneM, m4.multiply(vp, coneM), t, 0.14, true);
    drawBlob(meshes.spotBlobMesh, m4.multiply(vp, frame(player.x, 0.06, player.z, 0, 0, 0, 1)), [1.0, 0.95, 0.7, 0.5]);
  }

  // Glass pass (car glass, blended, after opaque).
  for (const car of cars) {
    const carM = carFrame(car);
    drawLit(carGlassMesh(car.model), carM, m4.multiply(vp, carM), t, 0.32, true);
  }

  // Rain puddles + rain streaks.
  if (sky.wet > 0.05) {
    drawLit(meshes.puddleMesh, IDENT, vp, t, sky.wet * 0.8, true);
  }
  // Lamp light pools: warm ground glow under every streetlight, fading in
  // with the night (windowLit is ~0.08 by day, 0.55 at dusk, 0.85 at night).
  // Lamp light pools: warm ground glow under every streetlight, fading in
  // with the night (windowLit is ~0.08 by day, 0.55 at dusk, 0.85 at night).
  if (sky.windowLit > 0.05) {
    drawLit(meshes.lampPoolMesh, IDENT, vp, t, sky.windowLit, true);
  }
  if (G.rain > 0.05) {
    drawLit(meshes.rainMesh, IDENT, vp, t, 0.35 * G.rain, true);
  }
}
