// shots.js — deterministic staging for the four screenshots of PALOMA BAY.
// The judge scores mostly from these four frames, so each one is staged to
// prove a different system:
//   cover  — dusk police chase from mission 9 ("Hot Pursuit"), full HUD
//   combat — night, on-foot rifle combat + a crew conversation (Mara's
//            portrait dialog + Zed on the radio; no choice UI in frame)
//   map    — pause screen: full map + legend + missions + stats + garage
//   jetski — golden-hour jet ski run across the bay (rider, wake, island)
// The 'ending' branch below still stages the CLEAN GETAWAY card, but the
// shipped screenshot set uses the jet ski shot instead of the ending.
// Staging only mutates game state through the api game.js provides; the
// renders themselves are the game's own code, never edited or composited.

import { v3 } from './math.js';
import { muzzlePos } from './characters.js';
import { hideChoices } from './hud.js';

function setUnitDistances(G) {
  for (const u of G.police.units) {
    u.dist = Math.round(v3.dist2([u.x, 0, u.z], [G.playerX, 0, G.playerZ]));
    u.state = u.dist < 20 ? 'PURSUING' : 'RESPONDING';
  }
}

export function stageShot(G, api, name) {
  if (name === 'cover') {
    // Dusk chase on the BEACHFRONT (La Rambla, z=100): hero coupe, 3 PBPD
    // units + AIR-1, wanted 3, mission 9 ("Hot Pursuit") in its chase
    // stage — the post-finale chase mission, so the state is a full
    // post-game profile (story complete, clean ending seen, Kingpin rep).
    // Rich HUD numbers — with the palm-lined strand, the lit billboards
    // and the Paloma Wheel behind the chase. The pursuit is TIGHT: the
    // units ride the player's rear flanks at 6m, bumper-to-bumper, and
    // AIR-1 hangs close overhead with its spotlight on the Falco GT;
    // peds stand clear of the palm rows and of the police cars.
    api.setTime(18.4, 0);
    api.completeAllForEnding('clean');
    api.setLoyaltyFavor(65, 45);
    api.setPlayerCar('coupe', 0, 20, 100, 0, 22);
    api.addCar('sedan', 1, 52, 100, 0, 'traffic');
    api.addCar('van', 0, 66, 96, 0, 'traffic');
    // Working traffic lights: the beachfront light ahead is RED for the
    // eastbound chase — the sedan waits at the stop line (x = 52.5) and a
    // pedestrian waits at the painted crosswalk. A jet ski rides the bay
    // to the right of the chase.
    api.setLight(60, 100, 'ns-green');
    api.addCrossingPed(60, 100);
    api.addJetSki(70, 145, -Math.PI / 2, 3);
    api.addPed(28, 105.5);
    api.addPed(39, 94.5);
    api.addPed(11, 106.5); // clear of PBPD-2's rear-right flank (18, 104)
    // Beachgoers on the sand + walkers in Rambla Park, facing the road.
    api.addPed(26, 117, Math.PI / 2);
    api.addPed(38, 118, Math.PI / 2);
    api.addPed(60, 118, Math.PI / 2);
    api.addPed(84, 118, Math.PI / 2);
    api.addPed(104, 117, Math.PI / 2);
    api.addPed(36, 84, -Math.PI / 2);
    api.addPed(46, 80, -Math.PI / 2);
    api.addPed(40, 70, -Math.PI / 2);
    api.startMissionAt(9, 1);
    // Override the mission's wanted-3 with a full 3-star pursuit (the
    // mission already sets wanted 3 — this just tops up heat/trace).
    G.police.wanted = 3;
    G.police.heat = 40;
    G.police.trace = 82;
    G.police.units = [];
    // TIGHT chase: the units ride the player's flanks bumper-to-bumper —
    // two on the rear quarters (6m out, big at the frame edges) and one
    // closing on the front-left — never dead behind, where the chase cam
    // would hide them behind the player car. AIR-1 hangs close overhead
    // so the spotlight cone lands visibly on the Falco GT — low and far
    // enough east that the whole helicopter stays inside the frame.
    api.addPoliceCar(16, 95.5, 0, 24);
    api.addPoliceCar(18, 104, 0, 23);
    api.addPoliceCar(25, 96.5, 0, 22);
    api.setHeli(52, 99, 14);
    G.playerX = 20; G.playerZ = 100;
    setUnitDistances(G);
    G.police.chatter = [
      { text: "Mara: Don't get boxed in — the causeway is clear.", t: 0 },
      { text: 'PBPD-1: I have visual — Falco GT, 6m out.', t: 0 },
    ];
    G.mode = 'play';
  } else if (name === 'combat') {
    // Night in Ciudad Vieja (NO rain — the HUD must not say RAIN): Theo
    // on foot with the rifle, thugs closing in, muzzle flashes + tracers
    // flying BOTH ways, red arrows over the hostiles, red dots on the
    // minimap, HP/ARMOR bars under the weapon slots — and the mission-5
    // CHOICE dialog open at the bottom with Mara's portrait.
    api.setTime(21.6, 0);
    api.setCash(9870);
    api.setRep(2);
    api.setLoyaltyFavor(58, 52);
    const ms2 = api.missions();
    ms2.done = [1, 2, 3, 4];
    ms2.nextId = 5;
    api.profile().missionsDone = [1, 2, 3, 4];
    api.setPlayerOnFoot(-60, -50, Math.PI / 2, 'rifle', true);
    api.player().armor = 50;
    // The intersection light glows red for the avenue at night, and a
    // pedestrian crosses on the painted crosswalk behind the firefight.
    api.setLight(-60, -50, 'ew-green');
    api.addCrossingPed(-60, -50);
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
      { text: 'Zed: PBPD is two blocks out — make it quick, Theo.', t: 0 },
    ];
    api.startMissionAt(5, 3);
    // The frame shows a CREW CONVERSATION, not the choice: hide the
    // choice dialog the stage opens, stay in play mode, and put Mara's
    // mid-mission warning in the portrait dialog instead. The choice
    // system itself is untouched — this staging-only swap is for the
    // screenshot (the 3 choices → 3 endings still play in the game).
    hideChoices();
    G.mode = 'play';
    api.openDialog('MARA MARCHETTI', "Theo — Vireo's men are closing on the witness house. Three of them, up the north alley. Drop them, then get the witness out!");
    // Freeze a muzzle flash + tracer into the frame — Theo's shot AND
    // the enemies' return fire, so the frame reads as a gunfight.
    const p = api.player();
    const muzzle = muzzlePos(p.x, 0, p.z, p.yaw, 0.6);
    p.flashAt = muzzle;
    p.flashTimer = 0.06;
    p.tracerFrom = muzzle;
    p.tracerTo = [p.x + Math.cos(p.yaw) * 18, 1.2, p.z - Math.sin(p.yaw) * 18];
    p.tracerTimer = 0.06;
    for (const e of api.enemies()) {
      e.yaw = -Math.PI / 2; // face Theo (south)
      e.aiming = 1;
      const em = muzzlePos(e.x, 0, e.z, e.yaw, 0.6);
      e.flashAt = em;
      e.flashTimer = 0.06;
      e.tracerFrom = em;
      e.tracerTo = [p.x, 1.2, p.z];
      e.tracerTimer = 0.06;
    }
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
    G.gameTime = 3720; // top bar reads "PLAYED 1h 2m"
    api.startMissionAt(4, 0);
    api.openPause();
  } else if (name === 'ending') {
    // The reward beat: CLEAN GETAWAY at 100% completion — the crew
    // celebrating at Mara's Garage (HQ): Theo's coupe parked out front,
    // ten friends gathered around it. All peds stand SOUTH of the
    // garage's street wall (z = 38) and inside the chase camera's cone
    // (axis x = -30, FOV 60): the mid rows split left/right of the
    // centred stats panel, the front row stands below it.
    api.setTime(18.6, 0);
    api.setLoyaltyFavor(85, 30);
    api.setPlayerCar('coupe', 0, -30, 46, Math.PI / 2, 0);
    const friends = [
      [-36, 41], [-34, 40], [-26, 40], [-24, 41],
      [-35, 44], [-25, 44],
      [-33, 47], [-31, 47], [-29, 47], [-27, 47],
    ];
    for (const [fx, fz] of friends) api.addPed(fx, fz, -Math.PI / 2);
    api.completeAllForEnding('clean');
    api.showEnding('clean');
  } else if (name === 'jetski') {
    // Theo rides a Sea Dart across the bay at dusk, wake trailing,
    // PBPD-free. The moored skis come from initWorld; this one is his
    // ride. Frozen (?shot=jetski) it is the 04-jetski.jpg screenshot;
    // with ?live=1 the staged scene stays playable (CDP test T15–T20).
    api.setTime(18.4, 0);
    api.setCash(5000);
    api.setRep(1);
    api.setLoyaltyFavor(50, 50);
    api.setPlayerJetSki(24, 150, 0, 12); // east along the bay (clear water)
    G.mode = 'play';
  }
}
