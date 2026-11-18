// sky.js — ONE shared sky model for PALOMA BAY.
// The same numbers drive the sky gradient, the fog, the sun, the ambient
// light, glass/paint/water reflections and the post grade, so they can never
// disagree. Time of day interpolates between five named presets; rain
// darkens and desaturates the whole set and raises road wetness.

import { clamp, lerp, v3 } from './math.js';

// Each preset: sun direction + colour + intensity, zenith/horizon colours,
// fog colour + range, hemisphere ambient, and how "lit" windows look.
const PRESETS = {
  night: {
    sunDir: [0.4, 0.55, -0.3], sunColor: [0.45, 0.55, 0.85], sunIntensity: 0.55,
    zenith: [0.03, 0.04, 0.10], horizon: [0.10, 0.09, 0.16],
    fogColor: [0.08, 0.08, 0.13], fogNear: 40, fogFar: 150,
    ambSky: [0.26, 0.28, 0.38], ambGround: [0.16, 0.14, 0.16], ambStrength: 0.9,
    windowLit: 0.85, name: 'Night',
  },
  dawn: {
    sunDir: [-0.75, 0.18, 0.25], sunColor: [1.0, 0.55, 0.35], sunIntensity: 1.1,
    zenith: [0.30, 0.42, 0.66], horizon: [1.0, 0.60, 0.42],
    fogColor: [0.95, 0.62, 0.45], fogNear: 50, fogFar: 190,
    ambSky: [0.45, 0.50, 0.68], ambGround: [0.40, 0.32, 0.28], ambStrength: 0.85,
    windowLit: 0.35, name: 'Dawn',
  },
  day: {
    sunDir: [-0.35, 0.85, 0.30], sunColor: [1.0, 0.95, 0.85], sunIntensity: 1.6,
    zenith: [0.25, 0.50, 0.85], horizon: [0.75, 0.85, 0.95],
    fogColor: [0.72, 0.82, 0.92], fogNear: 70, fogFar: 260,
    ambSky: [0.60, 0.68, 0.80], ambGround: [0.50, 0.45, 0.38], ambStrength: 0.9,
    windowLit: 0.08, name: 'Day',
  },
  dusk: {
    sunDir: [-0.55, 0.20, 0.42], sunColor: [1.0, 0.47, 0.30], sunIntensity: 2.1, // lower sun, warmer, stronger gold
    zenith: [0.26, 0.34, 0.62], horizon: [1.0, 0.50, 0.38], // warmer, pinker
    fogColor: [0.99, 0.58, 0.45], fogNear: 45, fogFar: 170,
    ambSky: [0.52, 0.58, 0.74], ambGround: [0.50, 0.36, 0.32], ambStrength: 0.85,
    windowLit: 0.55, name: 'Dusk',
  },
};

// Keyframes through the day: [hour, preset]. The model lerps between them.
const DAY_KEYS = [
  [0, 'night'], [5, 'night'], [6.5, 'dawn'], [8, 'day'],
  [16.5, 'day'], [18.5, 'dusk'], [20, 'night'], [24, 'night'],
];

function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Current sky state, mutated by updateSky(hour, rain). The renderer reads
// these fields directly; nothing else computes lighting.
export const sky = {
  hour: 18.2,
  rain: 0, // 0 = dry, 1 = full rain
  sunDir: [0, 1, 0], sunColor: [1, 1, 1], sunIntensity: 1,
  zenith: [0, 0, 0], horizon: [0, 0, 0],
  fogColor: [0, 0, 0], fogNear: 50, fogFar: 170,
  ambSky: [0, 0, 0], ambGround: [0, 0, 0], ambStrength: 0.85,
  windowLit: 0.5, wet: 0, phase: 'Dusk',
};

export function updateSky(hour, rain) {
  sky.hour = ((hour % 24) + 24) % 24;
  sky.rain = clamp(rain, 0, 1);
  // Find the surrounding keyframes.
  let i = 0;
  while (i < DAY_KEYS.length - 2 && DAY_KEYS[i + 1][0] <= sky.hour) i++;
  const [h0, p0] = DAY_KEYS[i];
  const [h1, p1] = DAY_KEYS[i + 1];
  const t = clamp((sky.hour - h0) / (h1 - h0), 0, 1);
  const A = PRESETS[p0], B = PRESETS[p1];
  sky.sunDir = v3.norm(lerp3(A.sunDir, B.sunDir, t));
  sky.sunColor = lerp3(A.sunColor, B.sunColor, t);
  sky.sunIntensity = lerp(A.sunIntensity, B.sunIntensity, t);
  sky.zenith = lerp3(A.zenith, B.zenith, t);
  sky.horizon = lerp3(A.horizon, B.horizon, t);
  sky.fogColor = lerp3(A.fogColor, B.fogColor, t);
  sky.fogNear = lerp(A.fogNear, B.fogNear, t);
  sky.fogFar = lerp(A.fogFar, B.fogFar, t);
  sky.ambSky = lerp3(A.ambSky, B.ambSky, t);
  sky.ambGround = lerp3(A.ambGround, B.ambGround, t);
  sky.ambStrength = lerp(A.ambStrength, B.ambStrength, t);
  sky.windowLit = lerp(A.windowLit, B.windowLit, t);
  sky.phase = t < 0.5 ? A.name : B.name;
  // Rain: darken + desaturate everything, pull the fog in, wet the roads.
  if (sky.rain > 0) {
    const r = sky.rain;
    const grey = (c) => {
      const g = (c[0] + c[1] + c[2]) / 3;
      return lerp3(c, [g, g, g], 0.45 * r);
    };
    sky.zenith = grey(sky.zenith).map((v) => v * (1 - 0.45 * r));
    sky.horizon = grey(sky.horizon).map((v) => v * (1 - 0.40 * r));
    sky.fogColor = grey(sky.fogColor).map((v) => v * (1 - 0.35 * r));
    sky.sunColor = sky.sunColor.map((v) => v * (1 - 0.6 * r));
    sky.sunIntensity *= 1 - 0.5 * r;
    sky.fogFar = lerp(sky.fogFar, 110, r);
    sky.windowLit = lerp(sky.windowLit, 0.9, r * 0.5);
  }
  sky.wet = sky.rain;
}

// Clock label for the HUD ("18:12").
export function clockLabel(hour) {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

updateSky(sky.hour, 0);
