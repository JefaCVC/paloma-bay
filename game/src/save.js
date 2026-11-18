// save.js — the player profile and save slots for PALOMA BAY.
// One profile holds everything persistent: cash, rep, loyalty/favor, mission
// progress, choices, postcards, upgrades, weapons and the player's place in
// the world. Three slots in localStorage; the safehouse and mission
// completions auto-save to the active slot.

import { createLoadout } from './weapons.js';
import { createMissionState } from './missions.js';

const SAVE_KEY = 'paloma-bay-save-';

export function createProfile() {
  return {
    cash: 500,
    rep: 0,
    loyalty: 50,
    favor: 50,
    missionsDone: [],
    choices: {},
    postcards: [], // collected postcard indices
    upgrades: { engine: false, armour: false, nitro: false, respray: 0 },
    loadout: createLoadout(),
    endingsSeen: [],
    stats: {
      kills: 0, carsStolen: 0, distanceDriven: 0,
      missionsPlayed: 0, timePlayed: 0, moneyEarned: 0,
    },
    // Where the player is (respawn point after load / wasted / busted).
    spawn: { x: 15, z: -45, yaw: 0, inCar: false, carModel: 'taxi', carColor: 0 },
    hour: 18.2,
    day: 1,
  };
}

export function createGameState() {
  return {
    profile: createProfile(),
    missions: createMissionState(),
    slot: 1,
  };
}

function serialize(state) {
  return JSON.stringify({
    v: 1,
    profile: state.profile,
    missions: {
      nextId: state.missions.nextId,
      done: state.missions.done,
      choices: state.missions.choices,
      ending: state.missions.ending,
    },
    slot: state.slot,
    savedAt: new Date().toISOString(),
  });
}

function deserialize(json) {
  const data = JSON.parse(json);
  const state = createGameState();
  if (!data || data.v !== 1) return null;
  state.profile = { ...state.profile, ...data.profile };
  state.profile.stats = { ...createProfile().stats, ...(data.profile.stats || {}) };
  state.profile.upgrades = { ...createProfile().upgrades, ...(data.profile.upgrades || {}) };
  state.missions.nextId = data.missions.nextId || 1;
  state.missions.done = data.missions.done || [];
  state.missions.choices = data.missions.choices || {};
  state.missions.ending = data.missions.ending || null;
  state.profile.missionsDone = state.missions.done;
  state.profile.choices = state.missions.choices;
  state.slot = data.slot || 1;
  return state;
}

export function saveGame(state, slot) {
  const s = slot || state.slot || 1;
  state.slot = s;
  try {
    localStorage.setItem(SAVE_KEY + s, serialize(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame(slot) {
  try {
    const raw = localStorage.getItem(SAVE_KEY + slot);
    if (!raw) return null;
    return deserialize(raw);
  } catch (e) {
    return null;
  }
}

export function saveSlotInfo(slot) {
  try {
    const raw = localStorage.getItem(SAVE_KEY + slot);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      cash: data.profile.cash,
      rep: data.profile.rep,
      missions: (data.missions.done || []).length,
      savedAt: data.savedAt,
    };
  } catch (e) {
    return null;
  }
}

export function hasSave(slot) {
  try {
    return !!localStorage.getItem(SAVE_KEY + slot);
  } catch (e) {
    return false;
  }
}
