// missions.js — the story of PALOMA BAY: 8 named missions, sequential with
// locks, multi-stage with NEXT lines and payouts, 3 branching CHOICES
// (missions 3, 5, 7) feeding a visible LOYALTY / FAVOR tracker, and 3
// endings. Data first: the table is the story; the state machine below it
// just walks the table. All names and story are original to this game.

import { POI } from './world.js';

// Stage types:
//   driveTo  — reach a marker (any way you like), radius 6
//   dialog   — a line of story; advance with E / click
//   combat   — eliminate N enemies spawned near the marker
//   chase    — lose the heat (wanted back to 0)
//   choice   — pick one option; consequences apply at once
//   deliver  — reach a marker carrying something (same as driveTo, new label)
//   escape   — reach the marker while wanted (finales)
export const MISSIONS = [
  {
    id: 1, name: 'Night Shift', giver: 'Zed Okafor', district: 'Barrio Sol',
    brief: 'Theo drives the night taxi. Zed has a fare that pays too well.',
    payout: 800, rep: 1,
    stages: [
      { type: 'driveTo', x: POI.pawn.x, z: POI.pawn.z + 8, text: "Drive to Zed's Pawn", next: 'Meet Zed' },
      { type: 'dialog', speaker: 'ZED OKAFOR', text: "Theo! My best driver. A fare at the pier pays triple — but the client is... particular. Take my cab, keep it clean.", next: 'Pick up the fare' },
      { type: 'driveTo', x: POI.pier.x + 8, z: POI.pier.z, text: 'Pick up the fare at Porto Lumen Pier', next: 'Drive the fare to La Rambla' },
      { type: 'driveTo', x: 80, z: 95, text: 'Drop the fare at the Paloma Wheel', next: 'Return to the garage' },
      { type: 'driveTo', x: POI.garage.x, z: POI.garage.z + 14, text: "Return to Mara's Garage", next: 'Mission complete' },
    ],
  },
  {
    id: 2, name: 'The Debt', giver: 'Isadora Vireo', district: 'Porto Lumen',
    brief: 'La Paloma calls the debt in. Theo learns what his father owed.',
    payout: 500, rep: 1,
    stages: [
      { type: 'driveTo', x: POI.vireoHQ.x, z: POI.vireoHQ.z + 14, text: 'Drive to the Vireo Import House', next: 'Meet La Paloma' },
      { type: 'dialog', speaker: 'ISADORA VIREO', text: 'Your father owed me forty thousand, Theo. I am not a cruel woman — work it off. Drive for me, and the debt sleeps. Refuse, and it wakes.', next: 'Drive to the garage' },
      { type: 'driveTo', x: POI.garage.x, z: POI.garage.z + 14, text: "Drive to Mara's Garage", next: 'Tell Mara' },
      { type: 'dialog', speaker: 'MARA MARCHETTI', text: "Forty thousand? Dad never told me. We'll work it off, Theo — together. But don't trust her. Nobody works for La Paloma for free.", next: 'Mission complete' },
    ],
  },
  {
    id: 3, name: 'Paper Plates', giver: 'Zed Okafor', district: 'Palm Heights',
    brief: 'A Falco GT with no plates. Steal it — then decide what it is for.',
    payout: 1200, rep: 1,
    stages: [
      { type: 'driveTo', x: 90, z: -50, text: 'Find the Falco GT in Palm Heights', next: 'Take the car' },
      { type: 'dialog', speaker: 'ZED OKAFOR', text: "There it is — a Falco GT, fresh off a truck. The owner is a surgeon. A good man, by all accounts. Your call what happens next, Theo.", next: 'Choose' },
      {
        type: 'choice', id: 'c1', text: 'The Falco GT is yours. What do you do?',
        options: [
          { label: 'Return it intact', sub: 'The surgeon keeps his car. Word spreads.', loyalty: 20, rep: 2, cash: 0, result: 'You return the Falco. The surgeon pays the finder fee — and owes you one.' },
          { label: 'Strip it for parts', sub: 'Quick cash. The surgeon files a report.', loyalty: -10, favor: 10, rep: -1, cash: 1800, result: 'Zed strips the Falco in an hour. Easy money — and a police report with your name near it.' },
        ],
        next: 'Return to the garage',
      },
      { type: 'driveTo', x: POI.garage.x, z: POI.garage.z + 14, text: "Return to Mara's Garage", next: 'Mission complete' },
    ],
  },
  {
    id: 4, name: 'Low Tide', giver: 'Isadora Vireo', district: 'Porto Lumen',
    brief: 'Move product through the docks while the PBPD patrols the piers.',
    payout: 2000, rep: 2,
    stages: [
      { type: 'driveTo', x: POI.pier.x + 8, z: POI.pier.z, text: 'Pick up the cargo at the pier', next: 'Carry it through the docks' },
      { type: 'driveTo', x: -60, z: -50, text: 'Cross the docks — stay cool', next: 'Deliver to Zed' },
      { type: 'driveTo', x: POI.pawn.x, z: POI.pawn.z + 8, text: "Deliver the cargo to Zed's Pawn", next: 'Mission complete' },
    ],
  },
  {
    id: 5, name: 'Siren Song', giver: 'Mara Marchetti', district: 'La Rambla',
    brief: 'The PBPD is on your tail. Lose them — then a witness needs a choice.',
    payout: 1500, rep: 2,
    stages: [
      { type: 'dialog', speaker: 'MARA MARCHETTI', text: 'Theo, the cops are all over the strip — someone tipped them about the cargo run. Lose them, then meet me at the Wheel. And Theo... bring the witness. Please.', next: 'Lose the heat' },
      { type: 'chase', text: 'Lose the heat — break line of sight', next: 'Meet Mara at the Wheel' },
      { type: 'driveTo', x: 80, z: 95, text: 'Meet Mara at the Paloma Wheel', next: 'Choose the witness fate' },
      {
        type: 'choice', id: 'c2', text: 'The witness saw everything. Vireo wants them gone.',
        options: [
          { label: 'Protect the witness', sub: 'Hide them. Vireo will not forget.', loyalty: 20, rep: 1, cash: 0, result: 'You hide the witness at the safehouse. Mara hugs you — and Vireo marks you.' },
          { label: 'Hand them to Vireo', sub: 'La Paloma rewards loyalty to her.', loyalty: -20, favor: 20, rep: 0, cash: 1500, result: 'Vireo takes the witness away. The money is good. The silence afterwards is not.' },
        ],
        next: 'Mission complete',
      },
    ],
  },
  {
    id: 6, name: 'The Long Way Home', giver: 'Mara Marchetti', district: 'Ciudad Vieja',
    brief: 'An ambush on the old-town road. Get Mara home alive.',
    payout: 3000, rep: 2,
    stages: [
      { type: 'driveTo', x: POI.garage.x, z: POI.garage.z + 14, text: "Pick up Mara at the garage", next: 'Drive through Ciudad Vieja' },
      { type: 'driveTo', x: -60, z: -100, text: 'Drive through Ciudad Vieja', next: 'Ambush!' },
      { type: 'combat', x: -60, z: -100, count: 4, text: 'Ambush! Fight off the Vireo crew', next: 'Get Mara to the safehouse' },
      { type: 'driveTo', x: POI.safehouse.x, z: POI.safehouse.z + 10, text: "Get Mara to the safehouse", next: 'Mission complete' },
    ],
  },
  {
    id: 7, name: 'High Water', giver: 'Zed Okafor', district: 'Porto Lumen',
    brief: 'The big one: the Vireo ledger, in the Import House, tonight.',
    payout: 5000, rep: 3,
    stages: [
      { type: 'driveTo', x: POI.vireoHQ.x, z: POI.vireoHQ.z + 14, text: 'Reach the Vireo Import House', next: 'Get inside' },
      { type: 'combat', x: POI.vireoHQ.x, z: POI.vireoHQ.z + 14, count: 6, text: 'Fight through the Vireo crew', next: 'Take the ledger' },
      { type: 'dialog', speaker: 'ZED OKAFOR', text: "The ledger. Forty thousand in debts, bribes, names — the whole bay in one book. Whatever you do with it, Theo, the bay changes tonight.", next: 'Choose' },
      {
        type: 'choice', id: 'c3', text: 'The ledger is in your hands.',
        options: [
          { label: 'Take the money and run', sub: 'Cash out. Leave the bay behind.', loyalty: 0, favor: 0, rep: 0, cash: 10000, result: 'You empty the safe and walk out rich. The bay keeps its secrets.' },
          { label: 'Burn the ledger', sub: 'Expose Vireo. Free the bay — and yourself.', loyalty: 25, favor: -15, rep: 2, cash: 0, result: 'The ledger burns on the pier. By morning, every debt in it is ash.' },
          { label: 'Side with Vireo', sub: 'Hand it back. Become her right hand.', loyalty: -25, favor: 25, rep: 0, cash: 5000, result: 'You hand the ledger back. La Paloma smiles — and offers you a chair at her table.' },
        ],
        next: 'The finale awaits',
      },
    ],
  },
  {
    id: 8, name: 'Finale', giver: 'Theo Marchetti', district: 'Paloma Bay',
    brief: 'Every choice led here. One last drive decides the bay.',
    payout: 0, rep: 3,
    // Stages are picked at runtime from the ending variant (see FINALES).
    stages: [],
  },
];

export const FINALES = {
  clean: {
    name: 'Finale — Clean Getaway',
    stages: [
      { type: 'dialog', speaker: 'MARA MARCHETTI', text: "The debt is paid, the ledger is ash, and the ferry leaves at dawn. One last drive, Theo — then we're free.", next: 'Drive to the causeway' },
      { type: 'escape', x: 0, z: 175, text: 'Drive Mara across the causeway to Isla Verde', next: 'The ending' },
    ],
  },
  king: {
    name: 'Finale — King of the Bay',
    stages: [
      { type: 'dialog', speaker: 'ISADORA VIREO', text: 'The old guard will not hand the bay to a taxi driver, Theo. Take the Import House tonight, and it is yours by morning.', next: 'Take the Import House' },
      { type: 'combat', x: POI.vireoHQ.x, z: POI.vireoHQ.z + 14, count: 6, text: 'Take the Import House from the old guard', next: 'The ending' },
    ],
  },
  burn: {
    name: 'Finale — Burn It All',
    stages: [
      { type: 'dialog', speaker: 'ZED OKAFOR', text: "The evidence goes to the press at the pier — if you get there. Every crew in the bay wants that bag, Theo. Drive like the bay is burning. Because it is.", next: 'Drive to the pier' },
      { type: 'escape', x: POI.pier.x + 8, z: POI.pier.z, text: 'Deliver the evidence to the pier', next: 'The ending' },
    ],
  },
};

export const ENDINGS = {
  clean: {
    id: 'clean', name: 'CLEAN GETAWAY',
    title: 'The ferry leaves at dawn.',
    desc: 'The debt is paid, the ledger is ash, and Theo and Mara watch Paloma Bay shrink behind them. Free — and finally clean.',
    color: [0.35, 0.75, 0.55],
  },
  king: {
    id: 'king', name: 'KING OF THE BAY',
    title: 'The bay has a new name on the door.',
    desc: 'Theo Marchetti, taxi driver, now owns the Import House, the docks and the night. La Paloma smiles from her chair — and waits.',
    color: [0.95, 0.75, 0.25],
  },
  burn: {
    id: 'burn', name: 'BURN IT ALL',
    title: 'By morning, every secret is ash.',
    desc: 'The evidence hits the press, the crews scatter, and Theo walks away from the burning bay with empty pockets and a clear conscience.',
    color: [0.95, 0.35, 0.25],
  },
};

// The ending is decided by the LOYALTY / FAVOR meters at the end of mission 7.
// Loyalty high -> Clean Getaway; Favor high -> King of the Bay; balanced -> Burn It All.
export function computeEnding(profile) {
  if (profile.loyalty >= 65) return 'clean';
  if (profile.favor >= 65) return 'king';
  return 'burn';
}

// --- mission state machine ------------------------------------------------------
export function createMissionState() {
  return {
    nextId: 1, // next mission available (sequential + lock)
    done: [], // completed mission ids
    active: null, // { mission, stageIndex } while playing
    choices: {}, // choice id -> option index picked
    ending: null, // set when mission 8 completes
  };
}

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function isUnlocked(state, id) {
  return id <= state.nextId;
}

export function startMission(state, id, profile) {
  const m = missionById(id);
  if (!m || !isUnlocked(state, id)) return null;
  let stages = m.stages;
  let name = m.name;
  if (id === 8) {
    const ending = computeEnding(profile);
    stages = FINALES[ending].stages;
    name = FINALES[ending].name;
  }
  state.active = { mission: { ...m, stages, name }, stageIndex: 0 };
  return state.active;
}

export function currentStage(state) {
  if (!state.active) return null;
  return state.active.mission.stages[state.active.stageIndex] || null;
}

export function advanceStage(state) {
  if (!state.active) return false;
  state.active.stageIndex++;
  return state.active.stageIndex < state.active.mission.stages.length;
}

export function completeMission(state, profile) {
  if (!state.active) return null;
  const m = state.active.mission;
  state.done.push(m.id);
  state.nextId = Math.max(state.nextId, m.id + 1);
  profile.cash += m.payout || 0;
  profile.rep = Math.min(4, profile.rep + (m.rep || 0));
  if (m.id === 8) {
    state.ending = computeEnding(profile);
    profile.endingsSeen = profile.endingsSeen || [];
    if (!profile.endingsSeen.includes(state.ending)) profile.endingsSeen.push(state.ending);
  }
  const done = state.active;
  state.active = null;
  return done;
}

// Apply a choice option's consequences to the profile.
export function applyChoice(state, choiceId, optionIndex, profile) {
  const stage = currentStage(state);
  if (!stage || stage.type !== 'choice') return null;
  const opt = stage.options[optionIndex];
  if (!opt) return null;
  state.choices[choiceId] = optionIndex;
  profile.loyalty = Math.max(0, Math.min(100, profile.loyalty + (opt.loyalty || 0)));
  profile.favor = Math.max(0, Math.min(100, profile.favor + (opt.favor || 0)));
  profile.cash += opt.cash || 0;
  profile.rep = Math.max(0, Math.min(4, profile.rep + (opt.rep || 0)));
  return opt;
}

// Completion %: missions 48 + postcards 20 + upgrades 12 + endings 20.
export function completionPercent(profile) {
  const missions = (profile.missionsDone || []).length * 6;
  const cards = (profile.postcards || []).length * 1;
  const ups = Object.values(profile.upgrades || {}).filter(Boolean).length * 3;
  const ends = (profile.endingsSeen || []).length >= 1 ? 20 : 0;
  return Math.min(100, missions + cards + ups + ends);
}

export const REP_TITLES = ['Rookie', 'Hustler', 'Wheelman', 'Enforcer', 'Kingpin'];
