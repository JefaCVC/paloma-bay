// screens.js — Paloma Bay: pause, main menu, screen wiring.
// The pause screen (map / stats / story / settings tabs), the title menu
// navigation (arrows + Enter, hover sync, sub-panels for controls and
// settings), and wireScreens: every button on every screen — continue /
// new game, pause tabs + saves, shop close, ending roam / title,
// respawn. refreshContinueButton rebuilds the CONTINUE button's state
// from the saves on disk, so the title-shot stager can seed a save and
// have the menu show it.

import { districtInfo } from './citydata.js';
import { missionById } from './missions.js';
import { createGameState, hasSave, loadGame, saveGame, saveSlotInfo } from './save.js';
import {
  getVolume, initAudio, isMuted, setMuted, setVolume, sfxCash, sfxClick,
} from './audio.js';
import { exitPointerLock } from './input.js';
import { showBanner, showScreen, toast } from './hud.js';
import { fillPauseScreen, fillTitleScreen } from './panels.js';
import { G, missions, player, profile } from './state.js';
import { updateCamera } from './camera.js';
import { respawnPlayer } from './combat.js';
import { closeShop, updateMissionBeacon } from './missionflow.js';
import { hudView } from './hudview.js';

export function openPause() {
  G.mode = 'pause';
  G.pauseTab = 'map';
  exitPointerLock();
  fillPauseScreen(hudView(), 'map');
  showScreen('pause-screen');
  sfxClick();
}

export function setPauseTab(tab) {
  G.pauseTab = tab;
  fillPauseScreen(hudView(), tab);
  sfxClick();
}

export function closePause() {
  G.mode = 'play';
  showScreen(null);
  sfxClick();
}

// --- main menu navigation ------------------------------------------------------
// The four menu buttons; arrows move the .selected highlight, Enter clicks
// it. Hover syncs the highlight too. While a sub-panel (controls/settings)
// is open, arrows are suspended and Enter/Esc closes the panel.
export const MENU_BTNS = ['btn-continue', 'btn-new', 'btn-controls', 'btn-settings'];
let menuSel = 0;

export function menuPanelOpen() {
  const c = document.getElementById('controls-panel');
  const s = document.getElementById('settings-panel');
  return (c && c.style.display === 'block') || (s && s.style.display === 'block');
}
export function closeMenuPanels() {
  const c = document.getElementById('controls-panel');
  const s = document.getElementById('settings-panel');
  if (c) c.style.display = 'none';
  if (s) s.style.display = 'none';
  sfxClick();
}
export function menuMove(dir) {
  const btns = MENU_BTNS.map((id) => document.getElementById(id)).filter((b) => b && !b.disabled);
  if (!btns.length) return;
  const cur = btns.findIndex((b) => b.classList.contains('selected'));
  const next = cur < 0 ? 0 : (cur + dir + btns.length) % btns.length;
  btns.forEach((b) => b.classList.remove('selected'));
  btns[next].classList.add('selected');
  menuSel = next;
  sfxClick();
}
export function menuSelect() {
  const btns = MENU_BTNS.map((id) => document.getElementById(id)).filter((b) => b && !b.disabled);
  const sel = document.querySelector('.menu .btn.selected') || btns[menuSel] || btns[0];
  if (sel) sel.click();
}

// Continue button: dimmed with no save; otherwise the save info line
// (chapter + mission name, cash, day + time). Extracted from wireScreens
// so the title-shot stager can refresh it after seeding a save.
export function refreshContinueButton() {
  const $ = (id) => document.getElementById(id);
  const hasAnySave = hasSave(1) || hasSave(2) || hasSave(3);
  const contSub = $('continue-sub');
  if (!hasAnySave) {
    $('btn-continue').disabled = true;
    if (contSub) contSub.textContent = 'No save yet — start a new game';
  } else {
    $('btn-continue').disabled = false;
    const info = saveSlotInfo(1) || saveSlotInfo(2) || saveSlotInfo(3);
    if (info && contSub) {
      const next = missionById(info.nextId);
      const hh = String(Math.floor(info.hour)).padStart(2, '0');
      const mm = String(Math.floor((info.hour % 1) * 60)).padStart(2, '0');
      contSub.textContent = 'Ch. ' + info.nextId + ' ' + (next ? next.name : '') +
        ' · $' + Math.floor(info.cash).toLocaleString('en-US') +
        ' · Day ' + info.day + ', ' + hh + ':' + mm;
    }
    // CONTINUE is the primary action once a save exists: put the keyboard
    // selection on it (it started on NEW GAME when there was no save yet).
    document.querySelectorAll('.menu .btn').forEach((b) => b.classList.remove('selected'));
    $('btn-continue').classList.add('selected');
    menuSel = 0;
  }
}

export function wireScreens() {
  const $ = (id) => document.getElementById(id);
  const startPlay = () => {
    initAudio();
    G.mode = 'play';
    // Seed the district tracker so no intro card fires on load.
    const d0 = districtInfo(player.x, player.z);
    G.lastDistrict = d0 ? d0.name : null;
    // Face the camera behind the player from the first frame: the spawn
    // yaw is west (toward the taxi), so the camera starts east of the
    // player instead of swinging in from the title orbit.
    G.camera.yaw = player.yaw;
    G.camView = updateCamera(2); // dt=2 saturates the damp: snap, don't sweep.
    showScreen(null);
    document.getElementById('hud').style.display = 'block';
    sfxClick();
    if (!missions().active && !missions().done.length) {
      showBanner('PALOMA BAY', 'Drive to the marker to start Night Shift', 3200);
    }
  };
  $('btn-continue').addEventListener('click', () => {
    const saved = loadGame(1) || loadGame(2) || loadGame(3);
    if (saved) {
      G.state = saved;
      player.x = saved.profile.spawn.x;
      player.z = saved.profile.spawn.z;
      player.yaw = saved.profile.spawn.yaw;
      player.onJetSki = false;
      player.jetski = null;
      G.hour = saved.profile.hour;
      G.day = saved.profile.day;
      updateMissionBeacon();
      toast('Save loaded — welcome back to Paloma Bay.');
    }
    startPlay();
  });
  $('btn-new').addEventListener('click', () => {
    G.state = createGameState();
    player.x = 18; player.z = -52; player.yaw = Math.PI;
    player.hp = 100;
    player.armor = 50;
    player.onJetSki = false;
    player.jetski = null;
    updateMissionBeacon();
    startPlay();
  });
  $('btn-controls').addEventListener('click', () => {
    const p = $('controls-panel');
    const s = $('settings-panel');
    if (s) s.style.display = 'none';
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    sfxClick();
  });
  $('btn-settings').addEventListener('click', () => {
    const p = $('settings-panel');
    const c = $('controls-panel');
    if (c) c.style.display = 'none';
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    sfxClick();
  });
  $('btn-controls-back').addEventListener('click', closeMenuPanels);
  $('btn-settings-back').addEventListener('click', closeMenuPanels);
  // Settings: volume slider + mute toggle (both persist and work live).
  const volSlider = $('volume-slider');
  const volVal = $('volume-val');
  const showVol = () => { if (volVal) volVal.textContent = Math.round(getVolume() * 100) + '%'; };
  if (volSlider) {
    volSlider.value = String(Math.round(getVolume() * 100));
    volSlider.addEventListener('input', () => {
      setVolume(Number(volSlider.value) / 100);
      showVol();
    });
  }
  showVol();
  const muteBtn = $('btn-mute');
  const showMute = () => { if (muteBtn) muteBtn.textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON'; };
  if (muteBtn) muteBtn.addEventListener('click', () => { setMuted(!isMuted()); showMute(); sfxClick(); });
  showMute();
  // Menu hover syncs the keyboard highlight.
  MENU_BTNS.forEach((id) => {
    const b = $(id);
    if (!b) return;
    b.addEventListener('mouseenter', () => {
      document.querySelectorAll('.menu .btn').forEach((x) => x.classList.remove('selected'));
      if (!b.disabled) b.classList.add('selected');
    });
  });
  // Pause tabs (click).
  document.querySelectorAll('.pause-tab').forEach((btn) => {
    btn.addEventListener('click', () => setPauseTab(btn.dataset.tab));
  });
  $('btn-resume').addEventListener('click', closePause);
  $('btn-title').addEventListener('click', () => {
    G.mode = 'title';
    showScreen('title-screen');
    document.getElementById('hud').style.display = 'none';
  });
  $('btn-sound').addEventListener('click', () => {
    setMuted(!isMuted());
    $('btn-sound').textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
  });
  document.querySelectorAll('#pause-saves .btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = Number(btn.dataset.slot);
      profile().spawn = { x: player.x, z: player.z, yaw: player.yaw, inCar: player.inCar, carModel: player.car ? player.car.model : 'taxi', carColor: 0 };
      profile().hour = G.hour;
      profile().day = G.day;
      saveGame(G.state, slot);
      toast('Saved to slot ' + slot + '.');
      sfxCash();
      fillPauseScreen(hudView(), G.pauseTab || 'map');
    });
  });
  $('btn-shop-close').addEventListener('click', closeShop);
  $('btn-ending-roam').addEventListener('click', () => {
    G.mode = 'play';
    showScreen(null);
    sfxClick();
    // Post-finale free-roam: the next mission's beacon appears (mission 9,
    // "Hot Pursuit", unlocks at the garage once the story is done).
    updateMissionBeacon();
  });
  $('btn-ending-title').addEventListener('click', () => {
    G.mode = 'title';
    showScreen('title-screen');
    document.getElementById('hud').style.display = 'none';
  });
  $('btn-respawn').addEventListener('click', () => {
    respawnPlayer();
    sfxClick();
  });
  refreshContinueButton();
  // Character portraits on the title screen + the initial menu highlight.
  fillTitleScreen();
  const firstBtn = MENU_BTNS.map((id) => $(id)).find((b) => b && !b.disabled);
  if (firstBtn) firstBtn.classList.add('selected');
}
