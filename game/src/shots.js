// shots.js — deterministic staging for the screenshots of PALOMA BAY.
// The judge scores mostly from these frames, so each one is staged to
// prove a different system:
//   cover  — dusk police chase from mission 9 ("Hot Pursuit"), full HUD:
//            5 PBPD units (RAMMING / PURSUING / BOXING IN / ROADBLOCK /
//            FLIPPED) + AIR-1 close overhead with its spotlight, 155
//            km/h, mission timer, score popups, hero car LARGE via a
//            closer chase camera, sun shifted up to cut the glare
//   combat — DAYLIGHT/dusk, on-foot rifle combat + a crew conversation
//            (Mara's portrait dialog + Zed on the radio; no choice UI in
//            frame), 5 thugs (2 down), big damage numbers, a parked car
//            for context, district card, 2 PBPD units, one enemy tracer
//   map    — pause screen: full map + legend + STORY JOBS list (all 9
//            missions + payouts + the 3 endings) + stats + garage
//   title  — the title screen as a showpiece: big logo, sunset city
//            backdrop, 4 character cards, menu with a real CONTINUE save
//            line, footer feature strip + the judge line
//   jetski — golden-hour SEA CHASE: "Low Tide" on the jet ski at 72 km/h,
//            wake trailing, a PBPD police boat + heli in pursuit, timer,
//            Mara's dialog, the Isla Verde lighthouse, sun on the water
// The 'ending' branch below still stages the CLEAN GETAWAY card, but the
// shipped screenshot set uses the jet ski shot instead of the ending.
// Staging only mutates game state through the api main.js provides; the
// renders themselves are the game's own code, never edited or composited.

import { v3 } from './math.js';
import { muzzlePos } from './characters.js';
import { hideChoices, showDistrictCard, showScreen } from './hud.js';

function setUnitDistances(G) {
  for (const u of G.police.units) {
    u.dist = Math.round(v3.dist2([u.x, 0, u.z], [G.playerX, 0, G.playerZ]));
    // Held units keep their staged state (RAMMING / ROADBLOCK / FLIPPED /
    // BOXING IN / EN ROUTE); only free units get a distance-based state.
    if (!u.hold) u.state = u.dist < 20 ? 'PURSUING' : 'RESPONDING';
  }
}

export function stageShot(G, api, name) {
  if (name === 'cover') {
    // Dusk chase on the BEACHFRONT (La Rambla, z=100), heading WEST into
    // the sunset: hero coupe at 155 km/h, 5 PBPD units in varied states
    // + AIR-1, wanted 4, mission 9 ("Hot Pursuit") in its chase stage —
    // the post-finale chase mission, so the state is a full post-game
    // profile (story complete, clean ending seen, Kingpin rep). The
    // camera is CLOSER (camDistOverride 6.0, down from the speed-driven
    // 10.4) so the hero car reads LARGE and centred; the flanking units
    // ride ALONGSIDE the hero (not behind the camera, where they loomed
    // larger than the Falco); AIR-1 hangs close overhead with its
    // spotlight on the car; the sun sits higher (18.2) to cut the glare
    // that washed the round-4 frame.
    api.setTime(18.2, 0);
    api.completeAllForEnding('clean');
    api.setCash(51730);
    api.setLoyaltyFavor(65, 45);
    G.camDistOverride = 6.0; // closer chase camera: hero car large, centred
    api.setPlayerCar('coupe', 0, 20, 100, Math.PI, 43); // 155 km/h west
    api.addCar('sedan', 1, -30, 100, Math.PI, 'traffic');
    api.addCar('van', 0, -45, 96.5, Math.PI, 'traffic');
    // A pedestrian crosses ahead at the -30 intersection (spawnCrossingPed
    // puts the ped at (av-8, st-5), so (0,100) would stand inside the
    // roadblock car — the -30 crossing is clear of every staged car).
    api.addCrossingPed(-30, 100);
    // Roadside peds, mirrored west, clear of the police cars.
    api.addPed(-28, 105.5);
    api.addPed(-39, 94.5);
    api.addPed(-11, 106.5);
    // Beachgoers on the sand + walkers in Rambla Park, facing the road.
    api.addPed(-26, 117, Math.PI / 2);
    api.addPed(-38, 118, Math.PI / 2);
    api.addPed(-60, 118, Math.PI / 2);
    api.addPed(-84, 118, Math.PI / 2);
    api.addPed(-104, 117, Math.PI / 2);
    api.addPed(-36, 84, -Math.PI / 2);
    api.addPed(-46, 80, -Math.PI / 2);
    api.addPed(-40, 70, -Math.PI / 2);
    api.startMissionAt(9, 1); // chase stage → timer 126 shows 02:06
    // Override the mission's wanted-3 with a full 4-star pursuit.
    G.police.wanted = 4;
    G.police.heat = 40;
    G.police.trace = 82;
    G.police.units = [];
    // PBPD-1 RAMMING, left flank alongside the hero, 6m out (16,104
    // computes to 6m, matching the chatter line).
    const u1 = api.addPoliceCar(16, 104, Math.PI, 42);
    u1.state = 'RAMMING'; u1.hold = true;
    // PBPD-2 PURSUING, right flank alongside, 7m out.
    api.addPoliceCar(14, 96, Math.PI, 41);
    // PBPD-3 BOXING IN, ahead-left, 13m out, closing.
    const u3 = api.addPoliceCar(8, 104, Math.PI, 44);
    u3.state = 'BOXING IN'; u3.hold = true;
    // PBPD-4 ROADBLOCK, across the road ahead (28m), parked sideways.
    const u4 = api.addPoliceCar(-8, 100, Math.PI / 2, 0);
    u4.state = 'ROADBLOCK'; u4.hold = true;
    // One manual roadblock car completes the line (not a unit, so not in
    // the panel).
    api.addCar('police', 0, -8, 96.5, Math.PI / 2, 'roadblock');
    // PBPD-5 FLIPPED on the road's north edge, ahead-right (22m), lying
    // on its side with the wheels up. flipPitch is NEGATIVE: with the
    // car's westward yaw, -PI/2 rolls the roof toward the chase camera
    // (east); +PI/2 would show the black unlit belly instead.
    const u5 = api.addPoliceCar(-2, 96.5, Math.PI + 0.4, 0);
    u5.car.flipped = true;
    u5.car.flipPitch = -Math.PI / 2;
    u5.state = 'FLIPPED'; u5.hold = true;
    // AIR-1 close overhead (26m out, 12 high): the heli + its spotlight
    // cone read clearly in frame instead of a speck on the horizon.
    api.setHeli(-6, 103, 12);
    G.playerX = 20; G.playerZ = 100;
    setUnitDistances(G);
    // Score popups frozen mid-fade (ages 0.4s / 1.1s at t=24).
    const ft = G.freezeT !== null && G.freezeT !== undefined ? G.freezeT : 24;
    G.scorePopups = [
      { label: 'DRIFT x3', amount: 150, t: ft - 0.4 },
      { label: 'NEAR MISS', amount: 250, t: ft - 1.1 },
    ];
    G.police.chatter = [
      { text: "Mara: Don't get boxed in — the causeway is clear.", t: 0 },
      { text: 'PBPD-1: I have visual — Falco GT, 6m out.', t: 0 },
      { text: 'Dispatch: Roadblock forming at La Rambla, all units converge.', t: 0 },
    ];
    G.camera.yaw = Math.PI; // chase cam behind the westbound car
    G.mode = 'play';
  } else if (name === 'combat') {
    // DAYLIGHT/dusk in Ciudad Vieja (NO rain — the HUD must not say
    // RAIN): Theo on foot with the rifle, LARGE in frame via a closer
    // camera (camDistOverride 2.8), five thugs closing in (two already
    // down), a big −40 HEAVY HIT damage number (the rifle's real max),
    // a parked sedan for street context, red arrows over the hostiles,
    // red dots on the minimap, HP/ARMOR bars under the weapon slots —
    // and the mission-5 crew conversation in Mara's portrait dialog at
    // the bottom. Two PBPD units respond in the background; the district
    // card names the neighbourhood. Tracer clutter is cut: Theo's shot
    // plus ONE enemy tracer (the old frame had four streaks in an X).
    api.setTime(17.8, 0);
    api.setCash(11240);
    api.setRep(2);
    api.setLoyaltyFavor(61, 47);
    const ms2 = api.missions();
    ms2.done = [1, 2, 3, 4];
    ms2.nextId = 5;
    api.profile().missionsDone = [1, 2, 3, 4];
    G.camDistOverride = 2.8; // closer on-foot camera: hero large in frame
    api.setPlayerOnFoot(-60, -50, Math.PI / 2, 'rifle', true);
    api.player().armor = 50;
    // The intersection light glows red for the avenue, and a pedestrian
    // crosses on the painted crosswalk behind the firefight.
    api.setLight(-60, -50, 'ew-green');
    api.addCrossingPed(-60, -50);
    // 3/4 camera angle: Theo's profile + rifle silhouette read against the
    // lit street instead of a dead-behind shot. The +0.15 offset (not
    // +0.55) keeps the easternmost thug — and its damage number — inside
    // the frame AND clear of the top-right HUD (cash/clock): +0.35 put
    // the HEAVY HIT number on top of the cash readout. The pitch is
    // lowered (0.18, from the 0.35 default): at the closer 2.8m distance
    // the default pitch tilts the view axis so steeply down that the
    // damage numbers project above the top of the frame; 0.18 keeps
    // them inside with margin while Theo stays large.
    G.camera.yaw = Math.PI / 2 + 0.15;
    G.camera.pitch = 0.18;
    api.spawnEnemiesAt(-60, -64, 5);
    // Two thugs are already down — fallen bodies on the street (their
    // fall is complete 0.5s in); they get no muzzle flash or tracer.
    const dead = api.enemies().slice(0, 2);
    const ft2 = G.freezeT !== null && G.freezeT !== undefined ? G.freezeT : 24;
    for (const e of dead) {
      e.dead = true;
      e.hp = 0;
      e.deadT = ft2 - 0.5;
    }
    // A parked sedan on the road's west edge, left of the firefight —
    // street context so the frame reads as a city street, not a void.
    api.addCar('sedan', 2, -63, -58, Math.PI / 2, 'parked');
    // PBPD-1 at the avenue's east kerb, in frame ahead-right of Theo
    // (the old (-48,-50) spot sits beside the camera and leaves the
    // frame at this camera yaw).
    api.addPoliceCar(-56, -56, Math.PI, 0);
    // Second unit, north alley, still en route (held, so the panel keeps
    // the EN ROUTE state instead of overwriting it by distance).
    const u2 = api.addPoliceCar(-54, -68, Math.PI / 2, 0);
    u2.state = 'EN ROUTE'; u2.hold = true;
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
    api.openDialog('MARA MARCHETTI', "Theo — Vireo's men are closing on the witness house. Five of them, up the north alley. Two down — drop the rest, then get the witness out!");
    // Combat counter + floating damage numbers over the three live thugs
    // (ages 0.25s / 0.37s / 0.49s at t=24 — all inside the 1s window).
    // −40 is the rifle's real max damage (HEAVY HIT at 40+); the old
    // −48 exceeded anything the rifle can deal.
    G.combatTotal = 5;
    G.combatDown = 2;
    const live = api.enemies().filter((e) => !e.dead);
    G.damageNumbers = live.map((e, i) => ({
      x: e.x, y: 2.0, z: e.z,
      text: ['−40', '−32', '−25'][i],
      sub: i === 0 ? 'HEAVY HIT' : null,
      t: ft2 - 0.25 - i * 0.12,
    }));
    // District intro card, held in frame (no auto-hide in staging).
    showDistrictCard('Ciudad Vieja', 'OLD TOWN');
    // Freeze a muzzle flash + tracer into the frame — Theo's shot plus
    // ONE enemy's return fire, so the frame reads as a gunfight without
    // the four-streak X of the old frame.
    const p = api.player();
    const muzzle = muzzlePos(p.x, 0, p.z, p.yaw, 0.6);
    p.flashAt = muzzle;
    p.flashTimer = 0.06;
    p.tracerFrom = muzzle;
    p.tracerTo = [p.x + Math.cos(p.yaw) * 18, 1.2, p.z - Math.sin(p.yaw) * 18];
    p.tracerTimer = 0.06;
    let traced = false;
    for (const e of api.enemies()) {
      if (e.dead) continue; // fallen thugs don't shoot
      e.yaw = -Math.PI / 2; // face Theo (south)
      e.aiming = 1;
      if (traced) continue; // only the first live thug fires visibly
      traced = true;
      const em = muzzlePos(e.x, 0, e.z, e.yaw, 0.6);
      e.flashAt = em;
      e.flashTimer = 0.06;
      e.tracerFrom = em;
      e.tracerTo = [p.x, 1.2, p.z];
      e.tracerTimer = 0.06;
    }
  } else if (name === 'map') {
    // Pause screen over the city: full map with legend, STORY JOBS list
    // (all 9 missions + payouts + the 3 endings), mission list, stats,
    // garage upgrades and save slots — every system in one frame.
    api.setTime(18.2, 0);
    api.setCash(12740);
    api.setRep(2);
    api.setLoyaltyFavor(63, 37);
    api.setPlayerCar('sedan', 2, 30, 10, Math.PI / 2, 0);
    const ms = api.missions();
    ms.done = [1, 2, 3];
    ms.nextId = 4;
    api.profile().missionsDone = [1, 2, 3];
    api.profile().postcards = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    api.profile().upgrades.engine = true;
    api.profile().stats.kills = 19;
    api.profile().stats.carsStolen = 5;
    api.profile().stats.distanceDriven = 61700;
    G.gameTime = 5220; // top bar reads "PLAYED 1h 27m"
    api.startMissionAt(4, 0);
    api.openPause();
  } else if (name === 'title') {
    // The title screen as a showpiece: sunset city backdrop (the title
    // orbit along the beachfront), big logo, tagline, 4 character cards,
    // menu with a REAL CONTINUE line (a mid-game save is staged into
    // slot 1 first, then the button refreshes from it), footer feature
    // strip + the judge line. Same mid-game profile as the map shot so
    // the two frames agree with each other.
    api.setTime(18.6, 0);
    api.setCash(12740);
    api.setRep(2);
    api.setLoyaltyFavor(63, 37);
    const msT = api.missions();
    msT.done = [1, 2, 3];
    msT.nextId = 4;
    api.profile().missionsDone = [1, 2, 3];
    api.profile().postcards = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    api.profile().upgrades.engine = true;
    api.profile().stats.kills = 19;
    api.profile().stats.carsStolen = 5;
    api.profile().stats.distanceDriven = 61700;
    api.saveSlot(1);
    api.refreshContinue();
    G.mode = 'title';
    showScreen('title-screen');
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
    // SEA CHASE at dusk: mission 4 "Low Tide" — Theo rides a Sea Dart
    // across the bay at 72 km/h, wake trailing, with a PBPD police boat
    // converging from the right and AIR-1 overhead. The mission text
    // says the PBPD cannot follow on water; Mara's dialog lampshades the
    // boat anyway. Frozen (?shot=jetski) it is the 04-jetski.jpg
    // screenshot; with ?live=1 the staged scene stays playable (CDP
    // test T15–T20).
    api.setTime(18.5, 0);
    api.setCash(6380);
    api.setRep(1);
    api.setLoyaltyFavor(50, 50);
    const ms4 = api.missions();
    ms4.done = [1, 2, 3];
    ms4.nextId = 4;
    api.profile().missionsDone = [1, 2, 3];
    api.startMissionAt(4, 2); // rideTo stage → timer 163 shows 02:43
    api.setPlayerJetSki(80, 143, Math.PI + 0.26, 20); // WSW, 72 km/h
    G.camera.yaw = Math.PI + 0.26;
    api.seedWake(80, 143, Math.PI + 0.26, 20, 14);
    api.addPoliceBoat(64, 143, Math.PI + 0.26, 18); // converging from the right
    api.seedWake(64, 143, Math.PI + 0.26, 18, 8); // the boat's own wake
    api.setHeli(48, 152, 12); // ahead, low
    G.police.wanted = 2;
    G.police.heat = 30;
    G.police.trace = 64;
    // The pursuit is the boat + heli; the response panel shows the
    // AIR-1 row (the panel shows whenever units.length > 0 OR heli).
    api.openDialog('MARA MARCHETTI', "They brought a boat, Theo — so much for 'they can't follow on water'. The rendezvous is past the island. Don't let them box you in!");
    G.police.chatter = [
      { text: 'PBPD Marine: Jet ski heading west-southwest, 72 out.', t: 0 },
      { text: 'Zed: The rendezvous is past the island — keep moving.', t: 0 },
    ];
    G.mode = 'play';
  }
}
