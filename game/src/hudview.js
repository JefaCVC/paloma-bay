// hudview.js — Paloma Bay: the HUD view model.
// hudView() assembles everything the HUD and the pause screen render from
// the live state: the mission block (objective, distance, GPS target,
// timer, combat counter, next stage), the police block (units, heli
// distance, IN SIGHT badge), the feedback lists (score popups, damage
// numbers projected to screen pixels via scene.js), the player block
// (health, armour, weapon, speed, car), and the lights/enemies for the
// maps. It also prunes expired feedback — hud.js only renders survivors.

import { TRAFFIC_LIGHTS, districtAt, lightPhase } from './citydata.js';
import { CAR_MODELS } from './vehicles.js';
import { WEAPONS } from './weapons.js';
import { MISSIONS, currentStage, isUnlocked } from './missions.js';
import { anyUnitSees } from './police.js';
import { currentStation, currentTrack } from './audio.js';
import { G, boats, enemies, missions, player, profile } from './state.js';
import { projectWorld } from './scene.js';

// "2h 14m" / "14m" for the pause top bar.
export function formatPlayTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

export function hudView() {
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
      id: ms.active.mission.id,
      name: ms.active.mission.name,
      stageIndex: ms.active.stageIndex,
      stages: ms.active.mission.stages.length,
      objective: stage.text,
      dist, mx, mz,
      next: stage.next || '',
      timer: G.missionTimer,
      counter: G.combatTotal > 0 ? { down: G.combatDown, total: G.combatTotal } : null,
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
  // Hints stay short (≤ ~60 chars): the 264px corner wraps at ~44 chars,
  // and a third line crowds the speedo. Photo mode lives in HOW TO PLAY.
  const hint = player.onJetSki
    ? 'WASD ride · E get off · M map'
    : player.inCar
      ? 'WASD drive · SPACE brake · SHIFT nitro · E exit · H horn · M map'
      : 'WASD move · Click shoot · RMB aim · 1-5 weapons · R reload · E use · M map';
  // Live helicopter distance for the response panel.
  if (G.police.heli) {
    G.police.heliDist = Math.round(
      Math.hypot(G.police.heli.x - player.x, G.police.heli.z - player.z),
    );
  }
  // IN SIGHT badge: first unit close enough to have eyes on the player.
  const sighted = G.police.units.find((u) => (u.dist || 999) < 70);
  G.police.inSight = sighted ? sighted.name : null;
  // Prune expired feedback here (hud.js only renders the survivors).
  G.scorePopups = G.scorePopups.filter((p) => G.time - p.t < 2.5);
  G.damageNumbers = G.damageNumbers.filter((n) => G.time - n.t < 1);
  const scorePopups = G.scorePopups.map((p) => ({ label: p.label, amount: p.amount, age: G.time - p.t }));
  const damageNumbers = [];
  for (const n of G.damageNumbers) {
    const s = projectWorld(n.x, n.y, n.z);
    if (s) damageNumbers.push({ sx: s.sx, sy: s.sy, text: n.text, sub: n.sub, age: G.time - n.t });
  }
  return {
    profile: profile(),
    police: G.police,
    boats: boats.map((b) => ({ x: b.x, z: b.z })),
    scorePopups,
    damageNumbers,
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
    inCar: player.inCar || player.onJetSki,
    onJetSki: player.onJetSki,
    speed: player.onJetSki && player.jetski
      ? Math.abs(player.jetski.speed)
      : player.inCar && player.car ? Math.abs(player.car.speed) : player.speed,
    carName: player.onJetSki
      ? 'Sea Dart Jet Ski'
      : player.inCar && player.car ? CAR_MODELS[player.car.model].name : '',
    carHp: player.onJetSki ? null : player.inCar && player.car ? player.car.hp : 100,
    health: player.hp,
    armor: player.armor,
    lights: TRAFFIC_LIGHTS.map((l) => {
      const p = lightPhase(l, G.time, G.lightOverrides);
      return { x: l.x, z: l.z, ns: p.ns, ew: p.ew };
    }),
    enemies: enemies.filter((e) => !e.dead).map((e) => ({ x: e.x, z: e.z, kind: e.kind })),
    playTime: formatPlayTime(G.gameTime),
    aiming: player.aiming > 0.3 && !player.inCar,
    interact: G.interactTarget ? G.interactTarget.label : null,
    hint,
  };
}
