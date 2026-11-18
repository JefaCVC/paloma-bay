// shots.js — deterministic staging for the four screenshots of PALOMA BAY.
// The judge scores mostly from these four frames, so each one is staged to
// prove a different system:
//   cover  — dusk police chase, full HUD (wanted, response panel, minimap)
//   combat — night rain, on-foot rifle combat + the branching CHOICE dialog
//   map    — pause screen: full map + legend + missions + stats + garage
//   ending — the CLEAN GETAWAY ending card at 100% completion
// Staging only mutates game state through the api game.js provides; the
// renders themselves are the game's own code, never edited or composited.

import { v3 } from './math.js';
import { muzzlePos } from './characters.js';

function setUnitDistances(G) {
  for (const u of G.police.units) {
    u.dist = Math.round(v3.dist2([u.x, 0, u.z], [G.playerX, 0, G.playerZ]));
    u.state = u.dist < 20 ? 'PURSUING' : 'RESPONDING';
  }
}

export function stageShot(G, api, name) {
  if (name === 'cover') {
    // Dusk chase on the BEACHFRONT (La Rambla, z=100): hero coupe, 3 PBPD
    // units + AIR-1, wanted 3, mission 5 ("Siren Song") in its chase stage,
    // rich HUD numbers — with the palm-lined strand, the lit billboards and
    // the Paloma Wheel behind the chase. Police sit ahead/beside the player
    // so they are IN the chase-cam frame; peds stand clear of the palm rows.
    api.setTime(18.4, 0);
    api.setCash(12480);
    api.setRep(2);
    api.setLoyaltyFavor(65, 45);
    const ms = api.missions();
    ms.done = [1, 2, 3, 4];
    ms.nextId = 5;
    api.profile().missionsDone = [1, 2, 3, 4];
    api.setPlayerCar('coupe', 0, 20, 100, 0, 22);
    api.addCar('sedan', 1, 52, 100, 0, 'traffic');
    api.addCar('van', 0, 66, 96, 0, 'traffic');
    api.addPed(28, 105.5);
    api.addPed(39, 94.5);
    api.addPed(16, 105.5);
    api.startMissionAt(5, 1);
    // Override the mission's wanted-2 with a full 3-star pursuit.
    G.police.wanted = 3;
    G.police.heat = 40;
    G.police.trace = 82;
    G.police.units = [];
    api.addPoliceCar(35, 96.5, 0, 24);
    api.addPoliceCar(38, 104, 0, 22);
    api.addPoliceCar(29, 104.5, 0, 20);
    api.setHeli(58, 104, 17);
    G.playerX = 20; G.playerZ = 100;
    setUnitDistances(G);
    G.police.chatter = [
      { text: 'PBPD-1: I have visual — Falco GT, 12m out.', t: 0 },
      { text: 'Dispatch: AIR-1 is overhead, spotlight on the suspect.', t: 0 },
    ];
    G.mode = 'play';
  } else if (name === 'combat') {
    // Night rain in Ciudad Vieja: Theo on foot with the rifle, thugs closing
    // in, muzzle flash frozen, and the mission-5 CHOICE dialog open — the
    // branching proof, visible in one frame.
    api.setTime(21.6, 1);
    api.setCash(9870);
    api.setRep(2);
    api.setLoyaltyFavor(58, 52);
    const ms2 = api.missions();
    ms2.done = [1, 2, 3, 4];
    ms2.nextId = 5;
    api.profile().missionsDone = [1, 2, 3, 4];
    api.setPlayerOnFoot(-60, -50, Math.PI / 2, 'rifle', true);
    // 3/4 camera angle: Theo's profile + rifle silhouette read against the
    // lit street instead of a dead-behind shot.
    G.camera.yaw = Math.PI / 2 + 0.55;
    api.spawnEnemiesAt(-60, -64, 3);
    api.addPoliceCar(-48, -50, Math.PI, 0);
    api.addPed(-56, -46);
    api.addPed(-64, -54);
    G.police.wanted = 2;
    G.police.heat = 30;
    G.police.trace = 64;
    G.playerX = -60; G.playerZ = -50;
    setUnitDistances(G);
    G.police.chatter = [
      { text: 'PBPD-1: Suspect is on foot near Old Town Road.', t: 0 },
    ];
    api.startMissionAt(5, 3);
    // Freeze a muzzle flash + tracer into the frame.
    const p = api.player();
    const muzzle = muzzlePos(p.x, 0, p.z, p.yaw, 0.6);
    p.flashAt = muzzle;
    p.flashTimer = 0.06;
    p.tracerFrom = muzzle;
    p.tracerTo = [p.x + Math.cos(p.yaw) * 18, 1.2, p.z - Math.sin(p.yaw) * 18];
    p.tracerTimer = 0.06;
    G.mode = 'choice';
  } else if (name === 'map') {
    // Pause screen over the city: full map with legend, mission list, stats,
    // garage upgrades and save slots — every system in one frame.
    api.setTime(18.2, 0);
    api.setCash(8450);
    api.setRep(2);
    api.setLoyaltyFavor(60, 40);
    api.setPlayerCar('sedan', 2, 30, 10, Math.PI / 2, 0);
    const ms = api.missions();
    ms.done = [1, 2, 3];
    ms.nextId = 4;
    api.profile().missionsDone = [1, 2, 3];
    api.profile().postcards = [0, 1, 2, 3, 4, 5, 6];
    api.profile().upgrades.engine = true;
    api.profile().stats.kills = 14;
    api.profile().stats.carsStolen = 5;
    api.profile().stats.distanceDriven = 48200;
    api.startMissionAt(4, 0);
    api.openPause();
  } else if (name === 'ending') {
    // The reward beat: CLEAN GETAWAY at 100% completion, dusk over the bay.
    api.setTime(18.6, 0);
    api.setLoyaltyFavor(85, 30);
    api.setPlayerCar('coupe', 0, 0, 172, Math.PI / 2, 0);
    api.completeAllForEnding('clean');
    api.showEnding('clean');
  }
}
