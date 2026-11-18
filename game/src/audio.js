// audio.js — all sound in PALOMA BAY is synthesized with WebAudio: no
// audio files, no network. Two named radio stations run a tiny step
// sequencer (bass + arpeggio + hats); sirens, engine, gunshots and UI blips
// are oscillators and filtered noise. Audio starts on the first user
// gesture (the title screen click); everything guards a missing context.

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let muted = false;

export const STATIONS = [
  {
    id: 'paloma', name: 'Radio Paloma 88.5', genre: 'Sunset synth',
    bpm: 96, root: 55,
    tracks: [
      'Midnight Causeway — The Palomas',
      'Neon Tide — DJ Sol',
      'Golden Hour Drive — Vega Fields',
    ],
    // Bassline (semitone offsets from root) + arpeggio pattern.
    bass: [0, 0, 7, 0, 10, 0, 7, 5],
    arp: [0, 3, 7, 12, 7, 3, 10, 12],
  },
  {
    id: 'onda', name: 'Onda FM 101.2', genre: 'Bay groove',
    bpm: 112, root: 49,
    tracks: [
      'Low Tide Funk — Los Mariscos',
      'Harbor Lights — Carmen Azul',
      'Isla Verde — The Causeway Kids',
    ],
    bass: [0, 0, 0, 7, 0, 5, 3, 7],
    arp: [0, 7, 12, 7, 3, 10, 7, 12],
  },
];

let stationIndex = 0;
let trackIndex = 0;
let trackTimer = 0;
let seqStep = 0;
let nextNoteTime = 0;
let seqTimer = null;
let sirenOsc = null;
let sirenGain = null;
let engineOsc = null;
let engineGain = null;

export function currentStation() {
  return STATIONS[stationIndex];
}
export function currentTrack() {
  return STATIONS[stationIndex].tracks[trackIndex];
}
export function nextStation() {
  stationIndex = (stationIndex + 1) % STATIONS.length;
  trackIndex = 0;
  trackTimer = 0;
}

export function initAudio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.32;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.6;
    sfxGain.connect(master);
    // Engine hum (sawtooth, pitch follows speed).
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 40;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 220;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(sfxGain);
    engineOsc.start();
    // Siren (two-tone, gain follows police proximity).
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 750;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(sfxGain);
    sirenOsc.start();
    nextNoteTime = ctx.currentTime + 0.1;
    seqTimer = setInterval(scheduleRadio, 90);
    return true;
  } catch (e) {
    return false;
  }
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}
export function isMuted() {
  return muted;
}

function noteFreq(root, semis) {
  return root * Math.pow(2, semis / 12);
}

function scheduleRadio() {
  if (!ctx) return;
  const st = STATIONS[stationIndex];
  const stepDur = 60 / st.bpm / 2; // eighth notes
  while (nextNoteTime < ctx.currentTime + 0.25) {
    const step = seqStep % 8;
    const t = nextNoteTime;
    // Bass (sine, short).
    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = noteFreq(st.root, st.bass[step]);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.5, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.9);
    bass.connect(bg);
    bg.connect(musicGain);
    bass.start(t);
    bass.stop(t + stepDur);
    // Arpeggio (triangle, every other step).
    if (step % 2 === 0) {
      const arp = ctx.createOscillator();
      arp.type = 'triangle';
      arp.frequency.value = noteFreq(st.root * 4, st.arp[step]);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.16, t);
      ag.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.6);
      arp.connect(ag);
      ag.connect(musicGain);
      arp.start(t);
      arp.stop(t + stepDur * 1.8);
    }
    // Hat (highpassed noise, off-beats).
    if (step % 2 === 1) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const hg = ctx.createGain();
      hg.gain.value = 0.12;
      src.connect(hp);
      hp.connect(hg);
      hg.connect(musicGain);
      src.start(t);
    }
    nextNoteTime += stepDur;
    seqStep++;
  }
}

// Called every frame: rotates tracks, drives siren + engine levels.
export function updateAudio(dt, opts) {
  if (!ctx) return;
  trackTimer += dt;
  if (trackTimer > 32) {
    trackTimer = 0;
    trackIndex = (trackIndex + 1) % STATIONS[stationIndex].tracks.length;
  }
  if (sirenOsc && sirenGain) {
    const on = opts.wanted > 0;
    sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.2);
    if (on) {
      const alt = Math.floor(ctx.currentTime * 2.2) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(alt ? 720 : 960, ctx.currentTime, 0.03);
    }
  }
  if (engineOsc && engineGain) {
    const speed = opts.speed || 0;
    const driving = opts.driving;
    engineGain.gain.setTargetAtTime(driving ? 0.05 + Math.min(0.08, speed * 0.002) : 0, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(40 + speed * 2.2, ctx.currentTime, 0.1);
  }
}

function blip(freq, dur, type, vol) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g);
  g.connect(sfxGain);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export function sfxShoot(weaponId) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * 0.09);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = weaponId === 'shotgun' ? 900 : 2200;
  const g = ctx.createGain();
  g.gain.value = weaponId === 'bat' ? 0 : 0.5;
  src.connect(f);
  f.connect(g);
  g.connect(sfxGain);
  src.start();
  if (weaponId === 'bat') blip(140, 0.12, 'sine', 0.35);
}

export function sfxHit() {
  blip(320, 0.06, 'square', 0.12);
}
export function sfxPickup() {
  blip(880, 0.09, 'sine', 0.2);
  setTimeout(() => blip(1320, 0.12, 'sine', 0.2), 70);
}
export function sfxClick() {
  blip(660, 0.05, 'sine', 0.15);
}
export function sfxCash() {
  blip(990, 0.08, 'sine', 0.2);
  setTimeout(() => blip(1480, 0.14, 'sine', 0.2), 90);
}
export function sfxMissionComplete() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
}
export function sfxWasted() {
  [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.15), i * 160));
}
export function sfxHorn() {
  blip(370, 0.25, 'square', 0.12);
  blip(466, 0.25, 'square', 0.12);
}
