// missionflow.js — Paloma Bay: missions, interactions, shops, crew abilities.
// The story engine: the mission beacon, stage begin/advance/finish
// (combat spawns, chase wanted + crew chatter, dialog, modal choices),
// mission completion (mission 8 ends the story with an ending screen),
// the nearest-interaction scan (cars, jet skis, beacon, POIs), the gun
// shop + garage, and the crew abilities (Mara's free repair, Zed's fence).

import { TAU, v3 } from './math.js';
import { POI } from './citydata.js';
import { CAR_MODELS } from './vehicles.js';
import { WEAPONS } from './weapons.js';
import {
  ENDINGS, MISSIONS, advanceStage, applyChoice, completeMission,
  currentStage, missionById, startMission,
} from './missions.js';
import { CRIME_HEAT, addHeat, clearWanted, setWanted } from './police.js';
import { sfxCash, sfxClick, sfxMissionComplete } from './audio.js';
import { saveGame } from './save.js';
import { exitPointerLock } from './input.js';
import {
  hideChoices, hideDialog, showBanner, showChoices, showDialog,
  showScreen, toast,
} from './hud.js';
import { fillEndingScreen, fillShopScreen } from './panels.js';
import { G, cars, enemies, jetskis, missions, player, profile } from './state.js';
import { spawnEnemy } from './spawning.js';
import { enterCar, enterJetSki, exitCar, exitJetSki } from './driving.js';
import { hudView } from './hudview.js';

export function updateMissionBeacon() {
  const ms = missions();
  if (ms.active || ms.nextId > MISSIONS.length) {
    G.missionBeacon = null;
    return;
  }
  const m = missionById(ms.nextId);
  if (!m) {
    G.missionBeacon = null;
    return;
  }
  const first = m.stages[0];
  if (first && first.x !== undefined) {
    G.missionBeacon = { x: first.x, z: first.z, missionId: m.id, name: m.name };
  } else {
    G.missionBeacon = { x: POI.garage.x, z: POI.garage.z + 14, missionId: m.id, name: m.name };
  }
}

export function startMissionAtBeacon() {
  const b = G.missionBeacon;
  if (!b) return;
  const active = startMission(missions(), b.missionId, profile());
  if (!active) return;
  profile().stats.missionsPlayed++;
  showBanner(active.mission.name, active.mission.brief, 3200);
  sfxClick();
  beginStage();
  updateMissionBeacon();
}

export function beginStage() {
  const stage = currentStage(missions());
  if (!stage) return;
  // Stage timer (soft display countdown; null = no timer) + combat counter.
  G.missionTimer = stage.timer != null ? stage.timer : null;
  if (stage.type === 'combat') {
    G.combatTotal = stage.count;
    G.combatDown = 0;
  } else {
    G.combatTotal = 0;
    G.combatDown = 0;
  }
  if (stage.type === 'combat') {
    for (let i = 0; i < stage.count; i++) {
      const a = (i / stage.count) * TAU;
      spawnEnemy(stage.x + Math.cos(a) * (8 + i * 2), stage.z + Math.sin(a) * (8 + i * 2), 'thug', i % 3 === 0 ? 'smg' : 'pistol');
    }
  } else if (stage.type === 'chase') {
    setWanted(G.police, stage.wanted || 2, G.gameTime);
    // Crew radio lines for the chase (e.g. mission 9's Mara + Zed): pushed
    // into the dispatch feed so the pursuit opens with the crew talking.
    if (stage.chatter) {
      for (const text of stage.chatter) {
        G.police.chatter.push({ text, t: G.gameTime });
        if (G.police.chatter.length > 3) G.police.chatter.shift();
      }
    }
  } else if (stage.type === 'escape') {
    setWanted(G.police, 2, G.gameTime);
  } else if (stage.type === 'dialog') {
    showDialog(stage.speaker, stage.text);
    G.dialogAdvance = () => {
      hideDialog();
      advanceMissionStage();
    };
  } else if (stage.type === 'choice') {
    G.mode = 'choice';
    exitPointerLock();
    const giver = missions().active ? missions().active.mission.giver : null;
    showChoices(stage, giver, (idx) => {
      const opt = applyChoice(missions(), stage.id, idx, profile());
      hideChoices();
      G.mode = 'play';
      if (opt) {
        showDialog('THEO MARCHETTI', opt.result);
        G.dialogAdvance = () => {
          hideDialog();
          advanceMissionStage();
        };
      }
    });
  }
}

export function advanceMissionStage() {
  const more = advanceStage(missions());
  if (more) {
    beginStage();
  } else {
    finishMission();
  }
}

export function finishMission() {
  const done = completeMission(missions(), profile());
  if (!done) return;
  const m = done.mission;
  profile().missionsDone = missions().done;
  sfxMissionComplete();
  sfxCash();
  if (m.id === 8) {
    const ending = missions().ending;
    saveGame(G.state);
    G.mode = 'ending';
    exitPointerLock();
    fillEndingScreen(ENDINGS[ending], profile());
    showScreen('ending-screen');
    return;
  }
  showBanner('MISSION COMPLETE', m.name + '  ·  +$' + (m.payout || 0), 3200);
  saveGame(G.state);
  updateMissionBeacon();
}

export function updateMission(dt) {
  const ms = missions();
  if (!ms.active) return;
  const stage = currentStage(ms);
  if (!stage) return;
  // Stage timer: counts down, expires at 00:00, never fails the mission.
  if (G.missionTimer !== null && G.missionTimer > 0) {
    G.missionTimer = Math.max(0, G.missionTimer - dt);
  }
  if (stage.type === 'driveTo' || stage.type === 'deliver' || stage.type === 'escape') {
    const d = Math.hypot(stage.x - player.x, stage.z - player.z);
    if (d < 7) advanceMissionStage();
  } else if (stage.type === 'combat') {
    const alive = enemies.filter((e) => !e.dead && e.kind === 'thug').length;
    if (alive === 0) advanceMissionStage();
  } else if (stage.type === 'chase') {
    if (G.police.wanted === 0) advanceMissionStage();
  }
  // Dialog / choice stages advance through the UI.
}

// ============================================================================
// Interactions + shops
// ============================================================================
export function nearestInteraction() {
  if (player.inCar) return { type: 'exit-car', label: 'Press E — Exit car' };
  if (player.onJetSki) return { type: 'exit-jetski', label: 'Press E — Get off Jet Ski' };
  // Nearest car to enter.
  let bestCar = null, bestD = 4;
  for (const car of cars) {
    if (car.kind === 'police' || car.kind === 'roadblock') continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; bestCar = car; }
  }
  if (bestCar) {
    return { type: 'enter-car', car: bestCar, label: 'Press E — Drive ' + CAR_MODELS[bestCar.model].name };
  }
  // Jet skis moored at the waterline.
  for (const ski of jetskis) {
    const d = Math.hypot(ski.x - player.x, ski.z - player.z);
    if (d < 4.5) {
      return { type: 'jetski', ski, label: 'Press E — Ride Jet Ski' };
    }
  }
  // Mission beacon.
  if (G.missionBeacon) {
    const d = Math.hypot(G.missionBeacon.x - player.x, G.missionBeacon.z - player.z);
    if (d < 8) {
      return { type: 'mission', label: 'Press E — Start Mission: ' + G.missionBeacon.name };
    }
  }
  // POIs.
  const pois = [
    [POI.garage, 'garage', "Press E — Enter Mara's Garage"],
    [POI.gunshop, 'gunshop', 'Press E — Enter Iron & Oak Guns'],
    [POI.safehouse, 'safehouse', 'Press E — Save game & rest'],
    [POI.pawn, 'pawn', "Press E — Talk to Zed"],
  ];
  for (const [poi, type, label] of pois) {
    const d = Math.hypot(poi.x - player.x, poi.z - player.z);
    if (d < 9) return { type, poi, label };
  }
  return null;
}

export function doInteract() {
  const t = G.interactTarget;
  if (!t) return;
  if (t.type === 'exit-car') {
    exitCar();
    sfxClick();
  } else if (t.type === 'exit-jetski') {
    exitJetSki();
  } else if (t.type === 'jetski') {
    enterJetSki(t.ski);
    sfxClick();
  } else if (t.type === 'enter-car') {
    const stolen = t.car.kind === 'parked';
    enterCar(t.car);
    if (stolen) {
      profile().stats.carsStolen++;
      const nearCop = G.police.units.some((u) => v3.dist2([u.x, 0, u.z], [player.x, 0, player.z]) < 50);
      if (nearCop || G.police.wanted > 0) addHeat(G.police, CRIME_HEAT.carjack, G.gameTime);
    }
    sfxClick();
  } else if (t.type === 'mission') {
    startMissionAtBeacon();
  } else if (t.type === 'garage' || t.type === 'gunshop') {
    openShop(t.type);
  } else if (t.type === 'safehouse') {
    player.hp = 100;
    player.armor = 50;
    saveGame(G.state);
    toast('Game saved. Theo feels rested.');
    sfxCash();
  } else if (t.type === 'pawn') {
    showDialog('ZED OKAFOR', "Bring me a car and I'll fence it — press X while driving. I pay 25% over street. And Theo... the ledger business? Keep your head down.");
    G.dialogAdvance = () => hideDialog();
  }
}

export function openShop(kind) {
  G.shopKind = kind;
  G.mode = 'shop';
  exitPointerLock();
  fillShopScreen(kind, hudView(), (action, id) => buyFromShop(kind, action, id));
  showScreen('shop-screen');
  sfxClick();
}

export function closeShop() {
  G.mode = 'play';
  G.shopKind = null;
  showScreen(null);
}

export function buyFromShop(kind, action, id) {
  const p = profile();
  if (kind === 'gunshop') {
    const w = WEAPONS[id];
    const slot = p.loadout.owned[id];
    if (action === 'buy' && !slot.owned && p.cash >= w.price && p.rep >= w.repReq) {
      p.cash -= w.price;
      slot.owned = true;
      slot.mag = w.mag;
      slot.reserve = w.startReserve;
      p.loadout.current = id;
      toast(w.name + ' purchased.');
      sfxCash();
    } else if (action === 'ammo' && slot.owned && !w.melee && p.cash >= w.ammoPrice) {
      p.cash -= w.ammoPrice;
      slot.reserve += w.mag * 2;
      toast('Ammo restocked (+' + w.mag * 2 + ').');
      sfxCash();
    }
  } else if (kind === 'garage') {
    const prices = { engine: 1500, armour: 1200, nitro: 800, respray: 300, repair: 0 };
    if (action === 'respray') {
      if (p.cash >= 300) {
        p.cash -= 300;
        p.upgrades.respray++;
        clearWanted(G.police);
        toast('Respray done. The PBPD lost your trail.');
        sfxCash();
      }
    } else if (action === 'repair') {
      if (player.car) player.car.hp = 100;
      toast("Mara fixed your car — free, as always.");
      sfxCash();
    } else if (prices[action] !== undefined && !p.upgrades[action] && p.cash >= prices[action]) {
      p.cash -= prices[action];
      p.upgrades[action] = true;
      toast(action.charAt(0).toUpperCase() + action.slice(1) + ' installed.');
      sfxCash();
    }
  }
  fillShopScreen(kind, hudView(), (a, i) => buyFromShop(kind, a, i));
}

// Crew abilities.
export function maraRepair() {
  if (!player.inCar || !player.car) {
    toast('Get in a car first — Mara fixes cars, not pedestrians.');
    return;
  }
  if (G.maraCooldown > 0) {
    toast("Mara is busy — try again in " + Math.ceil(G.maraCooldown) + "s.");
    return;
  }
  player.car.hp = 100;
  G.maraCooldown = 60;
  toast("Mara fixed your car — free, as always.");
  sfxCash();
}

export function zedFence() {
  if (!player.inCar || !player.car) {
    toast('Get in a car first — Zed fences cars, not pedestrians.');
    return;
  }
  const car = player.car;
  const model = CAR_MODELS[car.model];
  const value = Math.round(model.value * 1.25 * (car.hp / 100));
  profile().cash += value;
  profile().stats.moneyEarned += value;
  toast("Zed fenced the " + model.name + " for $" + value + ".");
  sfxCash();
  const i = cars.indexOf(car);
  if (i >= 0) cars.splice(i, 1);
  player.inCar = false;
  player.car = null;
  player.speed = 0;
}
