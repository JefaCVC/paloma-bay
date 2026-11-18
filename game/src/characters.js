// characters.js — people of Paloma Bay.
// Proportions first (legs ~46% of height, head ~1/6), then tapered tubes
// for limbs — never boxes. Walk comes from ONE phase driven by DISTANCE, so
// feet never skate; knees bend only on the back half of the cycle, and
// positions come from two-angle forward kinematics. Crowd variety is ONE
// combinatorial `look` record (skin/hair/shirt/pants/shoes + hat) with a
// stable hash per person. Characters also breathe at idle — the proof's
// lesson from Halcyon Keys, whose characters had no idle at all.

import { frame, rng32 } from './math.js';
import { MAT, MeshBuilder } from './mesh.js';
import { buildWeaponMesh } from './weapons.js';

// Proportions (character ~1.75 units tall).
export const CHAR = {
  hipY: 0.83, thigh: 0.42, shin: 0.41,
  shoulderY: 1.38, headR: 0.15, shoulderW: 0.24,
};

// Gait constant: phase advance per unit of distance travelled.
// (Halcyon's 0.32 was for a ~20-unit character; rescaled to 1.75 m.)
export const GAIT_K = 0.32 * (20 / 1.75);

// --- looks --------------------------------------------------------------------
const SKINS = [[0.85, 0.65, 0.50], [0.65, 0.45, 0.32], [0.95, 0.78, 0.64], [0.45, 0.30, 0.22]];
const HAIRS = [[0.15, 0.10, 0.08], [0.35, 0.22, 0.10], [0.70, 0.60, 0.45], [0.55, 0.55, 0.55], [0.10, 0.10, 0.12]];
const SHIRTS = [[0.20, 0.50, 0.70], [0.75, 0.30, 0.25], [0.85, 0.80, 0.70], [0.30, 0.65, 0.35], [0.55, 0.35, 0.65], [0.90, 0.60, 0.20]];
const PANTS = [[0.25, 0.25, 0.35], [0.35, 0.30, 0.25], [0.15, 0.20, 0.30], [0.45, 0.45, 0.42]];
const SHOES = [[0.10, 0.10, 0.12], [0.35, 0.22, 0.15], [0.85, 0.85, 0.85]];

export const THEO_LOOK = {
  skin: [0.85, 0.65, 0.50], hair: [0.12, 0.08, 0.06],
  shirt: [0.16, 0.52, 0.55], pants: [0.18, 0.22, 0.32], shoes: [0.30, 0.20, 0.14],
  hat: null, jacket: true,
};
export const MARA_LOOK = {
  skin: [0.85, 0.65, 0.50], hair: [0.30, 0.15, 0.08],
  shirt: [0.75, 0.35, 0.20], pants: [0.25, 0.25, 0.35], shoes: [0.10, 0.10, 0.12],
  hat: null, jacket: false,
};
export const COP_LOOK = {
  skin: [0.85, 0.65, 0.50], hair: [0.15, 0.10, 0.08],
  shirt: [0.10, 0.16, 0.32], pants: [0.10, 0.14, 0.28], shoes: [0.08, 0.08, 0.10],
  hat: 'cap', jacket: false,
};
export const THUG_LOOK = {
  skin: [0.65, 0.45, 0.32], hair: [0.10, 0.10, 0.12],
  shirt: [0.12, 0.12, 0.12], pants: [0.20, 0.20, 0.22], shoes: [0.08, 0.08, 0.10],
  hat: 'bandana', jacket: false,
};

export function randomLook(seed, kind) {
  const rng = rng32((seed * 131 + 17) | 0);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  if (kind === 'cop') return { ...COP_LOOK, skin: pick(SKINS), hair: pick(HAIRS) };
  if (kind === 'thug') return { ...THUG_LOOK, skin: pick(SKINS) };
  if (kind === 'beach') {
    // Beachgoers: bright swim colours, no jacket, often a sunhat.
    return {
      skin: pick(SKINS), hair: pick(HAIRS),
      shirt: pick([[0.95, 0.30, 0.25], [0.20, 0.55, 0.85], [1.0, 0.80, 0.25], [0.30, 0.75, 0.45], [0.85, 0.45, 0.85], [0.95, 0.55, 0.15]]),
      pants: pick([[0.20, 0.50, 0.70], [0.85, 0.30, 0.25], [0.90, 0.85, 0.70], [0.30, 0.65, 0.35]]),
      shoes: pick(SHOES),
      hat: rng() > 0.5 ? 'sunhat' : null, jacket: false,
    };
  }
  return {
    skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS),
    pants: pick(PANTS), shoes: pick(SHOES),
    hat: rng() > 0.8 ? 'cap' : null, jacket: rng() > 0.7,
  };
}

// --- character builder ----------------------------------------------------------
// pose: { phase, walking (0..1), breathe (0..1), breathT (radians),
//         aiming (0..1), weapon (id | null), swing (0..1, melee swing),
//         sitting (0..1, jet-ski seat: hips at seat height, legs forward) }
// The character faces +X in model space; game.js yaws the transform.
export function buildCharacter(look, pose) {
  const bd = new MeshBuilder();
  const ph = pose.phase || 0;
  const walking = pose.walking || 0;
  const aiming = pose.aiming || 0;
  const sitting = pose.sitting ? 1 : 0;
  // Hips dip when the legs are apart (double support) — this is what keeps
  // the feet on the ground through the stride.
  const dip = Math.abs(Math.sin(ph)) * 0.09 * walking;
  const breathe = (pose.breathe || 0) * Math.sin(pose.breathT || 0);
  // Sitting (jet ski): hips at the seat height (0.62, just above the
  // 0.58 seat top), no gait dip; the rider leans slightly forward
  // toward the handlebars.
  const hipY = sitting ? 0.62 + breathe * 0.006 : CHAR.hipY - dip + breathe * 0.008;
  const lean = sitting ? 0.12 : 0.06 * walking + 0.10 * aiming;
  const hip = [0, hipY, 0];
  const shoulder = [Math.sin(lean) * 0.55, hipY + 0.55, 0];
  const chestR = 0.165 * (1 + breathe * 0.03);

  // Pelvis + torso.
  bd.setMat(MAT.PLAIN).setColor(look.pants[0], look.pants[1], look.pants[2]);
  bd.blob(hip[0], hip[1], hip[2], 0.16, 0.11, 0.13, 3.1);
  bd.setColor(look.shirt[0], look.shirt[1], look.shirt[2]);
  bd.tube(hip, shoulder, 0.15, chestR, 8, true);
  bd.blob(shoulder[0], shoulder[1], shoulder[2], 0.13, 0.08, CHAR.shoulderW, 4.2);
  if (look.jacket) {
    bd.setColor(look.shirt[0] * 0.7, look.shirt[1] * 0.7, look.shirt[2] * 0.7);
    bd.tube([hip[0], hip[1] + 0.05, hip[2]], [shoulder[0], shoulder[1] - 0.05, shoulder[2]], 0.165, chestR + 0.015, 8, true);
  }
  // Neck + head + hair + hat.
  const neckTop = [shoulder[0] + 0.02, shoulder[1] + 0.10, 0];
  bd.setColor(look.skin[0], look.skin[1], look.skin[2]);
  bd.tube(shoulder, neckTop, 0.05, 0.05, 6, true);
  const headC = [neckTop[0] + 0.01, neckTop[1] + 0.13, 0];
  bd.blob(headC[0], headC[1], headC[2], CHAR.headR, CHAR.headR * 1.1, CHAR.headR, 5.5);
  bd.setColor(look.hair[0], look.hair[1], look.hair[2]);
  bd.blob(headC[0] - 0.015, headC[1] + 0.045, headC[2], CHAR.headR * 1.02, CHAR.headR * 0.95, CHAR.headR * 1.02, 6.7);
  if (look.hat === 'cap') {
    bd.setColor(0.10, 0.14, 0.28);
    bd.blob(headC[0], headC[1] + 0.09, headC[2], CHAR.headR * 1.05, CHAR.headR * 0.5, CHAR.headR * 1.05, 8.1);
    bd.box(headC[0] + 0.08, headC[1] + 0.06, headC[2] - 0.09, headC[0] + 0.26, headC[1] + 0.09, headC[2] + 0.09);
  } else if (look.hat === 'bandana') {
    bd.setColor(0.65, 0.12, 0.12);
    bd.blob(headC[0], headC[1] + 0.08, headC[2], CHAR.headR * 1.04, CHAR.headR * 0.55, CHAR.headR * 1.04, 8.3);
  } else if (look.hat === 'sunhat') {
    // Wide-brimmed straw sunhat (beachgoers).
    bd.setColor(0.92, 0.85, 0.60);
    bd.blob(headC[0], headC[1] + 0.08, headC[2], CHAR.headR * 0.95, CHAR.headR * 0.5, CHAR.headR * 0.95, 8.5);
    bd.disc([headC[0], headC[1] + 0.06, headC[2]], [0, 1, 0], CHAR.headR * 1.9, 12);
  }

  // Legs: FK from hip angles + knee bend.
  const leg = (side, phaseOff) => {
    const p = ph + phaseOff;
    let hipA = Math.sin(p) * 0.55 * walking;
    let bend = (0.12 + 0.7 * Math.max(0, -Math.cos(p + 0.4))) * walking;
    // Sitting: thighs forward, shins forward-down — feet land on the deck.
    if (sitting) { hipA = 1.2; bend = 0.1; }
    const hipJ = [hip[0], hip[1] - 0.02, side * 0.09];
    const thighDir = [Math.sin(hipA), -Math.cos(hipA), 0];
    const knee = [hipJ[0] + thighDir[0] * CHAR.thigh, hipJ[1] + thighDir[1] * CHAR.thigh, hipJ[2]];
    const shinA = hipA - bend;
    const shinDir = [Math.sin(shinA), -Math.cos(shinA), 0];
    const ankle = [knee[0] + shinDir[0] * CHAR.shin, knee[1] + shinDir[1] * CHAR.shin, knee[2]];
    bd.setColor(look.pants[0], look.pants[1], look.pants[2]);
    bd.tube(hipJ, knee, 0.075, 0.055, 7, true);
    bd.tube(knee, ankle, 0.055, 0.04, 7, true);
    bd.setColor(look.shoes[0], look.shoes[1], look.shoes[2]);
    bd.box(ankle[0] - 0.06, Math.max(0, ankle[1] - 0.07), ankle[2] - 0.05,
      ankle[0] + 0.16, Math.max(0.02, ankle[1] + 0.01), ankle[2] + 0.05);
  };
  leg(-1, 0);
  leg(1, Math.PI);

  // Arms. Walking: swing opposite the same-side leg. Aiming: right arm points
  // forward holding the weapon, left arm braces across. Melee: right arm
  // swings through an arc (pose.swing 0..1).
  let wristR = null;
  const arm = (side, phaseOff, isRight) => {
    const p = ph + phaseOff;
    const shJ = [shoulder[0], shoulder[1] - 0.02, side * CHAR.shoulderW];
    let upDir, foreDir;
    if (sitting) {
      // Both hands forward-down to the handlebars.
      upDir = [0.85, -0.7, side * 0.05];
      foreDir = [0.8, -0.55, side * 0.05];
    } else if (isRight && aiming > 0.01) {
      // Aim: upper arm forward, forearm forward, slight downward tilt.
      const swing = (pose.swing || 0) * 1.2; // melee wind-up raises the arm
      upDir = [Math.cos(0.15 + swing), -Math.sin(0.15 + swing) * 0.4 + swing * 0.5, 0];
      foreDir = [1, -0.08 + swing * 0.6, 0];
      // Blend from the walk swing into the aim pose.
      const swA = Math.sin(p) * 0.45 * walking;
      const walkUp = [Math.sin(swA), -Math.cos(swA), 0];
      const walkFore = [Math.sin(swA - 0.25), -Math.cos(swA - 0.25), 0];
      const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      upDir = mix(walkUp, upDir, aiming);
      foreDir = mix(walkFore, foreDir, aiming);
    } else if (!isRight && aiming > 0.01 && pose.weapon && pose.weapon !== 'bat') {
      // Support hand: reaches forward and inward toward the weapon.
      const swA = Math.sin(p) * 0.45 * walking;
      const walkUp = [Math.sin(swA), -Math.cos(swA), 0];
      const walkFore = [Math.sin(swA - 0.25), -Math.cos(swA - 0.25), 0];
      const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      upDir = mix(walkUp, [0.9, -0.35, 0.25], aiming);
      foreDir = mix(walkFore, [0.95, -0.1, 0.15], aiming);
    } else {
      const swA = Math.sin(p) * 0.45 * walking;
      upDir = [Math.sin(swA), -Math.cos(swA), 0];
      foreDir = [Math.sin(swA - 0.25), -Math.cos(swA - 0.25), 0];
    }
    const elbow = [shJ[0] + upDir[0] * 0.30, shJ[1] + upDir[1] * 0.30, shJ[2] + upDir[2] * 0.30];
    const wrist = [elbow[0] + foreDir[0] * 0.28, elbow[1] + foreDir[1] * 0.28, elbow[2] + foreDir[2] * 0.28];
    bd.setColor(look.shirt[0], look.shirt[1], look.shirt[2]);
    bd.tube(shJ, elbow, 0.05, 0.042, 6, true);
    bd.setColor(look.skin[0], look.skin[1], look.skin[2]);
    bd.tube(elbow, wrist, 0.042, 0.035, 6, true);
    bd.blob(wrist[0], wrist[1] - 0.03, wrist[2], 0.045, 0.055, 0.045, 7.9);
    if (isRight) wristR = wrist;
  };
  arm(-1, Math.PI, false);
  arm(1, 0, true);

  // Weapon in the right hand, pointing forward (+X) when aiming; carried
  // low at the side when not aiming.
  if (pose.weapon && wristR) {
    const wm = buildWeaponMesh(pose.weapon);
    if (aiming > 0.5) {
      bd.append(wm, frame(wristR[0] + 0.05, wristR[1] - 0.02, wristR[2], 0, 0, 0, 1));
    } else {
      // Carried: muzzle down, grip in hand.
      bd.append(wm, frame(wristR[0], wristR[1] - 0.05, wristR[2], 0, 0, -Math.PI / 2, 1));
    }
  }

  return bd.build();
}

// Muzzle world position for a character at (x, z) facing yaw, aiming.
// (Model-space muzzle ≈ wrist + barrel length along +X.)
export function muzzlePos(charX, charY, charZ, yaw, barrelLen) {
  const fx = Math.cos(yaw), fz = -Math.sin(yaw);
  return [
    charX + fx * (0.55 + barrelLen) + fz * 0.24,
    charY + 1.32,
    charZ + fz * (0.55 + barrelLen) - fx * 0.24,
  ];
}
