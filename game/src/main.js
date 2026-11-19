// main.js — PALOMA BAY entry point.
// Integrates everything: the city (worldbuild.js), vehicles, characters,
// weapons, missions, police, audio, saves and HUD. One frame loop, one
// update that routes by mode (title / pause / choice / play), one boot
// that wires the screens and either starts the interactive title or
// stages a deterministic screenshot (?shot=). shotApi is the small,
// explicit API the shot stager (shots.js) uses to place things.

import { TAU } from './math.js';
import { initGL, resizeCanvas } from './render.js';
import { POSTCARDS, districtInfo } from './citydata.js';
import { CAR_MODELS } from './vehicles.js';
import { WEAPONS } from './weapons.js';
import { ENDINGS, currentStage, startMission } from './missions.js';
import { setWanted, updatePolice } from './police.js';
import {
  currentStation, currentTrack, nextStation, updateAudio,
} from './audio.js';
import { saveGame } from './save.js';
import { requestPointerLock } from './input.js';
import { updateSky } from './sky.js';
import {
  hideDialog, initHUD, showBanner, showChoices, showDialog,
  showDistrictCard, showScreen, toast, updateHUD,
} from './hud.js';
import { fillEndingScreen, fillPauseScreen } from './panels.js';
import { stageShot } from './shots.js';
import { G, canvas, enemies, missions, player, profile, showError, wakePuffs } from './state.js';
import {
  spawnCar, spawnCrossingPed, spawnEnemy, spawnJetSki,
  spawnPed, spawnPoliceBoat, initWorld,
} from './spawning.js';
import {
  busted, updateEnemies, updateOnFoot, updatePickups,
} from './combat.js';
import {
  enterCar, enterJetSki, updateBoats, updateDriving, updateJetSki,
} from './driving.js';
import { updatePeds, updateTraffic } from './traffic.js';
import { updatePoliceUnits } from './policeai.js';
import {
  beginStage, doInteract, maraRepair, nearestInteraction,
  updateMission, updateMissionBeacon, zedFence,
} from './missionflow.js';
import { enterPhotoMode, updateCamera, updatePhotoMode } from './camera.js';
import { initRain, rebuildRain, updateWeather } from './weather.js';
import { renderFrame } from './scene.js';
import { hudView } from './hudview.js';
import {
  closeMenuPanels, closePause, menuMove, menuPanelOpen, menuSelect,
  openPause, refreshContinueButton, setPauseTab, wireScreens,
} from './screens.js';

function update(dt) {
  // Photo mode: the world is frozen; only the orbit camera moves.
  if (G.photoMode) {
    updatePhotoMode(dt);
    return;
  }
  G.time += dt;
  if (G.mode === 'play' || G.mode === 'choice') G.gameTime += dt;
  updateWeather(dt);
  if (G.rain > 0.05) rebuildRain(dt);
  if (G.mode === 'title') {
    // Main menu: arrows move, Enter selects, Esc closes sub-panels.
    if (menuPanelOpen()) {
      if (G.input.hit('Escape') || G.input.hit('Enter')) closeMenuPanels();
    } else if (G.input.hit('ArrowDown') || G.input.hit('ArrowUp')) {
      menuMove(G.input.hit('ArrowDown') ? 1 : -1);
    } else if (G.input.hit('Enter')) {
      menuSelect();
    }
    return;
  }
  if (G.mode === 'pause') {
    // Pause screen: M/Esc resume, Q/E switch tabs.
    if (G.input.hit('KeyM') || G.input.hit('Escape')) {
      closePause();
    } else if (G.input.hit('KeyQ') || G.input.hit('KeyE')) {
      const tabs = ['map', 'stats', 'story', 'settings'];
      const dir = G.input.hit('KeyE') ? 1 : -1;
      const cur = tabs.indexOf(G.pauseTab || 'map');
      setPauseTab(tabs[(cur + dir + tabs.length) % tabs.length]);
    }
    return;
  }
  if (G.mode === 'choice') {
    // Modal choice: the world freezes; only the 1-3 keys work.
    for (let i = 0; i < 3; i++) {
      if (G.input.hit('Digit' + (i + 1))) {
        const btns = document.querySelectorAll('.choice-btn');
        if (btns[i]) btns[i].click();
      }
    }
    return;
  }
  if (G.mode !== 'play') return;

  if (G.maraCooldown > 0) G.maraCooldown -= dt;
  // Health regen after 8s without damage.
  if (G.gameTime - G.lastDamageT > 8 && player.hp > 0 && player.hp < 100) {
    player.hp = Math.min(100, player.hp + 1.5 * dt);
  }

  if (player.inCar) updateDriving(dt);
  else if (player.onJetSki) updateJetSki(dt);
  else updateOnFoot(dt);
  updateTraffic(dt);
  updatePeds(dt);
  updateEnemies(dt);
  updatePoliceUnits(dt);
  updateBoats(dt);
  updatePolice(G.police, dt, G.gameTime, {
    x: player.x, z: player.z,
    vx: player.inCar && player.car ? Math.cos(player.car.yaw) * player.car.speed : 0,
    vz: player.inCar && player.car ? -Math.sin(player.car.yaw) * player.car.speed : 0,
    carName: player.inCar && player.car ? CAR_MODELS[player.car.model].name : 'on foot',
  });
  updateMission(dt);
  updatePickups(dt);

  // District intro card: entering a new district flashes its GTA-style
  // card (name + subtitle) for a few seconds.
  {
    const d = districtInfo(player.x, player.z);
    if (d && d.name !== G.lastDistrict) {
      G.lastDistrict = d.name;
      showDistrictCard(d.name, d.sub, 3200);
    } else if (!d) {
      G.lastDistrict = null;
    }
  }

  // Busted: on foot, wanted, cops close and the player is still.
  if (!player.inCar && G.police.wanted > 0) {
    const closeCops = enemies.filter(
      (e) => e.kind === 'cop' && !e.dead && Math.hypot(e.x - player.x, e.z - player.z) < 4,
    ).length;
    if (closeCops >= 1 && player.speed < 0.5) {
      G.bustedTimer += dt;
      if (G.bustedTimer > 1 && G.bustedTimer < 1.1) toast('The PBPD is closing in — RUN!');
      if (G.bustedTimer > 2.5) {
        G.bustedTimer = 0;
        busted();
      }
    } else {
      G.bustedTimer = 0;
    }
  }

  // Interactions.
  G.interactTarget = nearestInteraction();
  if (G.input.hit('KeyE')) {
    if (G.dialogAdvance) {
      const fn = G.dialogAdvance;
      G.dialogAdvance = null;
      fn();
    } else if (G.mode === 'play') {
      doInteract();
    }
  }
  if (G.input.mousePressed && G.dialogAdvance && G.mode === 'play') {
    const fn = G.dialogAdvance;
    G.dialogAdvance = null;
    fn();
  }
  // Pause / map.
  if (G.input.hit('KeyM') || G.input.hit('Escape')) {
    if (G.mode === 'play') openPause();
    else if (G.mode === 'pause') closePause();
  }
  if (G.input.hit('KeyN')) {
    nextStation();
    toast(currentStation().name + ' — ' + currentTrack());
  }
  if (G.input.hit('KeyP')) enterPhotoMode();
  if (G.input.hit('KeyZ')) maraRepair();
  if (G.input.hit('KeyX')) zedFence();
  // Click the canvas to lock the mouse for aiming.
  if (G.input.mousePressed && !G.input.locked && G.mode === 'play' && !player.inCar) {
    requestPointerLock(canvas);
  }
  // Audio.
  updateAudio(dt, {
    wanted: G.police.wanted,
    speed: player.inCar && player.car ? Math.abs(player.car.speed) : 0,
    driving: player.inCar,
  });
}

function frameLoop(timeMs) {
  const t = timeMs / 1000;
  const dt = Math.min(0.05, t - (frameLoop.last || t));
  frameLoop.last = t;
  update(dt);
  G.camView = updateCamera(dt);
  renderFrame(G.time);
  if (G.mode !== 'title') updateHUD(hudView());
  G.input.endFrame();
  requestAnimationFrame(frameLoop);
}

// ============================================================================
// Boot
// ============================================================================
function boot() {
  const params = new URLSearchParams(location.search);
  G.shotName = params.get('shot');
  G.freezeT = params.has('t') ? parseFloat(params.get('t')) : null;

  if (!initGL(canvas, showError)) return;
  resizeCanvas();
  initHUD();
  initWorld();
  initRain();
  wireScreens();

  // Resizing resets the canvas — repaint after any resize (a late viewport
  // resize in headless mode would otherwise wipe the frozen frame).
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderFrame(G.freezeT !== null ? G.freezeT : G.time);
  });

  if (G.shotName) {
    // Deterministic screenshot mode: stage, render ONE frozen frame, stop.
    // (No rAF loop: the headless screenshot captures the painted frame.)
    const t = G.freezeT !== null ? G.freezeT : 24;
    stageShot(G, shotApi(), G.shotName);
    G.time = t;
    // Snap the camera to its staged position (damping needs a big dt to
    // converge in a single frame) and build rain drops if it is raining.
    G.camView = updateCamera(3);
    if (G.rain > 0.05) { rebuildRain(0.2); rebuildRain(0.2); rebuildRain(0.2); }
    renderFrame(t);
    if (G.mode === 'play' || G.mode === 'choice') {
      document.getElementById('hud').style.display = 'block';
      updateHUD(hudView());
    }
    // ?live=1: keep the staged scene running instead of stopping — the
    // staged state becomes playable (e.g. riding the jet ski from
    // ?shot=jetski&live=1). Without it, shot mode renders one frame.
    if (params.has('live')) {
      showScreen(null);
      requestAnimationFrame(frameLoop);
    }
    return;
  }

  // Interactive mode: title screen over a slow orbit shot.
  showScreen('title-screen');
  renderFrame(0);
  requestAnimationFrame(frameLoop);
}

// API the shot stager uses to place things (kept small and explicit).
function shotApi() {
  return {
    player() { return player; },
    missions() { return missions(); },
    profile() { return profile(); },
    addCar(model, colorIdx, x, z, yaw, kind) {
      // Staged traffic cars need an AI (updateTraffic reads ai.speed) or
      // the first live tick throws and kills the frame loop. Parked and
      // police/roadblock cars never enter updateTraffic.
      const ai = kind === 'traffic' ? { speed: 12 } : null;
      return spawnCar(model, colorIdx, x, z, yaw, kind || 'traffic', ai);
    },
    addPed(x, z, yaw) {
      const ped = spawnPed(x, z, [[x, z], [x + 6, z + 2]]);
      ped.yaw = yaw !== undefined ? yaw : Math.PI / 2;
      return ped;
    },
    addCrossingPed(av, st) {
      return spawnCrossingPed(av, st);
    },
    setLight(x, z, phase) {
      // Force one intersection's phase ('ns-green' | 'ns-yellow' | 'ew-green' | 'ew-yellow').
      G.lightOverrides[x + ',' + z] = phase;
    },
    addJetSki(x, z, yaw, colorIdx) {
      return spawnJetSki(x, z, yaw, colorIdx || 0);
    },
    addPoliceBoat(x, z, yaw, speed) {
      const boat = spawnPoliceBoat(x, z, yaw);
      boat.speed = speed || 0;
      return boat;
    },
    seedWake(x, z, yaw, speed, count) {
      // Foam puffs trailing a jet ski / boat in a frozen frame: spaced
      // behind the craft along its heading (one per 0.09s of travel),
      // aged so the trail reads oldest-farthest. All ages stay inside
      // the render window (1.4s) for count <= 15.
      const fx = Math.cos(yaw), fz = -Math.sin(yaw);
      const now = G.freezeT !== null ? G.freezeT : 24;
      for (let i = 0; i < (count || 10); i++) {
        const back = 1.5 + i * ((speed || 12) * 0.09);
        wakePuffs.push({
          x: x - fx * back, z: z - fz * back,
          t: now - i * 0.09, s: 1.0 + i * 0.06,
        });
      }
    },
    setPlayerJetSki(x, z, yaw, speed) {
      const ski = spawnJetSki(x, z, yaw, 0);
      ski.speed = speed || 0;
      enterJetSki(ski);
      return ski;
    },
    enemies() { return enemies; },
    setPlayerCar(model, colorIdx, x, z, yaw, speed) {
      const car = spawnCar(model, colorIdx, x, z, yaw, 'player');
      car.speed = speed || 0;
      enterCar(car);
      return car;
    },
    setPlayerOnFoot(x, z, yaw, weapon, aiming) {
      player.x = x; player.z = z; player.yaw = yaw;
      player.aimYaw = yaw;
      G.camera.yaw = yaw;
      player.aiming = aiming ? 1 : 0;
      if (weapon) {
        profile().loadout.owned[weapon].owned = true;
        profile().loadout.owned[weapon].mag = WEAPONS[weapon].mag;
        profile().loadout.owned[weapon].reserve = WEAPONS[weapon].startReserve;
        profile().loadout.current = weapon;
      }
    },
    addPoliceCar(x, z, yaw, speed) {
      const u = {
        name: 'PBPD-' + (G.police.units.length + 1), kind: 'car',
        x, z, yaw, speed: speed || 0, state: 'PURSUING', dist: 0, spawnT: G.gameTime,
      };
      u.car = spawnCar('police', 0, x, z, yaw, 'police');
      u.car.speed = speed || 0;
      G.police.units.push(u);
      return u;
    },
    setHeli(x, z, y) {
      G.police.heli = { x, y: y || 26, z, angle: 0, rotor: 2.4 };
    },
    spawnEnemiesAt(x, z, count) {
      const out = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + 0.5;
        const e = spawnEnemy(x + Math.cos(a) * 9, z + Math.sin(a) * 9, 'thug', i % 2 ? 'smg' : 'pistol');
        // Face the player, weapons raised — the frame must read as a fight.
        e.yaw = Math.atan2(-(player.z - e.z), player.x - e.x);
        e.aimYaw = e.yaw;
        e.aiming = 1;
        out.push(e);
      }
      return out;
    },
    setWanted(n) {
      setWanted(G.police, n, G.gameTime);
    },
    setTime(hour, rain) {
      G.hour = hour;
      G.rain = rain || 0;
      G.rainTarget = rain || 0;
      updateSky(hour, rain || 0);
    },
    startMissionAt(id, stageIndex) {
      const active = startMission(missions(), id, profile());
      if (active) {
        missions().active.stageIndex = stageIndex || 0;
        beginStage();
      }
      return active;
    },
    setCash(n) { profile().cash = n; },
    setRep(n) { profile().rep = n; },
    setLoyaltyFavor(l, f) { profile().loyalty = l; profile().favor = f; },
    saveSlot(slot) {
      // Stage a real save for the title shot: spawn + clock from the
      // current state, then write the slot (mirrors the pause-save
      // handler in screens.js).
      profile().spawn = {
        x: player.x, z: player.z, yaw: player.yaw,
        inCar: player.inCar, carModel: player.car ? player.car.model : 'taxi', carColor: 0,
      };
      profile().hour = G.hour;
      profile().day = G.day;
      saveGame(G.state, slot);
    },
    refreshContinue() {
      refreshContinueButton();
    },
    openChoice() {
      const stage = currentStage(missions());
      if (stage && stage.type === 'choice') {
        G.mode = 'choice';
        const giver = missions().active ? missions().active.mission.giver : null;
        showChoices(stage, giver, () => {});
      }
    },
    openDialog(speaker, text) {
      showDialog(speaker, text);
      // Staged dialogs must be dismissable in live mode, like every other
      // dialog (the pawn interaction sets the same advance). Without this,
      // the dialog never closes on click/E — and E falls through to
      // doInteract(), so pressing E on the jet ski EXITS it instead.
      G.dialogAdvance = () => hideDialog();
    },
    openPause() {
      G.mode = 'pause';
      fillPauseScreen(hudView());
      showScreen('pause-screen');
    },
    showEnding(endingId) {
      G.mode = 'ending';
      fillEndingScreen(ENDINGS[endingId], profile());
      showScreen('ending-screen');
    },
    completeAllForEnding(endingId) {
      const ms = missions();
      ms.done = [1, 2, 3, 4, 5, 6, 7, 8];
      ms.nextId = 9;
      profile().missionsDone = ms.done;
      ms.ending = endingId;
      profile().endingsSeen = [endingId];
      profile().postcards = POSTCARDS.map((_, i) => i);
      profile().upgrades = { engine: true, armour: true, nitro: true, respray: 3 };
      profile().cash = 48250;
      profile().rep = 4;
      profile().stats.kills = 47;
      profile().stats.carsStolen = 12;
      profile().stats.distanceDriven = 128400;
      profile().stats.moneyEarned = 48250;
      updateMissionBeacon();
    },
  };
}

boot();
