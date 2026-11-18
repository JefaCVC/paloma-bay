// weapons.js — the five weapons of PALOMA BAY.
// Data-driven: one table holds every stat (damage, rate, mag, range, price,
// rep gate). Meshes are built from the factory — grip at the origin, barrel
// along +X — so they slot into a character's hand or a pickup in the world.
// The user explicitly asked for weapons not to be forgotten: five of them,
// full on-foot combat, a gun shop, and a combat screenshot with a weapon
// clearly visible.

import { MAT, MeshBuilder } from './mesh.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'PB-9 Pistol', slot: 1,
    dmg: 25, rate: 3.2, mag: 12, startReserve: 48, range: 45,
    auto: false, spread: 0.012, pellets: 1,
    price: 0, ammoPrice: 25, repReq: 0,
    desc: 'Reliable sidearm. Every driver in the bay carries one.',
  },
  smg: {
    id: 'smg', name: 'Vesper-9 SMG', slot: 2,
    dmg: 12, rate: 9, mag: 30, startReserve: 90, range: 38,
    auto: true, spread: 0.035, pellets: 1,
    price: 900, ammoPrice: 40, repReq: 1,
    desc: 'Sprays fast, kicks hard. Close-quarters favourite.',
  },
  shotgun: {
    id: 'shotgun', name: 'Boomstick 12', slot: 3,
    dmg: 9, rate: 1.3, mag: 6, startReserve: 24, range: 22,
    auto: false, spread: 0.09, pellets: 6,
    price: 1400, ammoPrice: 50, repReq: 2,
    desc: 'Six pellets of bad news. Devastating up close.',
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Rifle', slot: 4,
    dmg: 40, rate: 5, mag: 30, startReserve: 60, range: 90,
    auto: true, spread: 0.014, pellets: 1,
    price: 2600, ammoPrice: 60, repReq: 3,
    desc: 'Long reach, heavy punch. The Vireo crew standard.',
  },
  bat: {
    id: 'bat', name: 'Slugger Bat', slot: 5,
    dmg: 35, rate: 2.0, mag: Infinity, startReserve: Infinity, range: 2.6,
    auto: false, spread: 0, pellets: 1, melee: true,
    price: 150, ammoPrice: 0, repReq: 0,
    desc: 'Wooden, quiet, final. No ammo required.',
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'bat'];

// A fresh loadout: pistol owned, the rest to buy at Iron & Oak.
export function createLoadout() {
  const owned = {};
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    owned[id] = {
      owned: id === 'pistol',
      mag: id === 'pistol' ? w.mag : 0,
      reserve: id === 'pistol' ? w.startReserve : 0,
    };
  }
  return { current: 'pistol', owned };
}

export function ownedWeapons(loadout) {
  return WEAPON_ORDER.filter((id) => loadout.owned[id].owned);
}

// Damage at distance: full inside half range, linear falloff to 40% at max.
export function damageAt(weapon, dist) {
  const w = WEAPONS[weapon];
  if (dist <= w.range * 0.5) return w.dmg;
  const t = Math.min(1, (dist - w.range * 0.5) / (w.range * 0.5));
  return w.dmg * (1 - 0.6 * t);
}

// --- weapon meshes (grip at origin, barrel along +X) -------------------------
// Returns a MeshBuilder (not built) so callers can append it into a
// character or bake it into a pickup mesh.
export function buildWeaponMesh(id) {
  const bd = new MeshBuilder();
  const gunmetal = () => bd.setMat(MAT.METAL).setColor(0.22, 0.22, 0.24);
  const grip = () => bd.setMat(MAT.PLAIN).setColor(0.25, 0.18, 0.12);
  if (id === 'pistol') {
    gunmetal();
    bd.box(-0.02, -0.02, -0.03, 0.30, 0.06, 0.03); // slide
    bd.box(0.02, -0.10, -0.025, 0.26, -0.02, 0.025); // frame
    grip();
    bd.box(-0.02, -0.20, -0.028, 0.08, -0.08, 0.028); // grip
    bd.setMat(MAT.EMIT).setColor(1.0, 0.9, 0.6);
    bd.box(0.26, 0.06, -0.01, 0.30, 0.09, 0.01); // sight dot
  } else if (id === 'smg') {
    gunmetal();
    bd.box(-0.05, -0.03, -0.04, 0.45, 0.06, 0.04); // receiver
    bd.tube([0.45, 0.01, 0], [0.62, 0.01, 0], 0.03, 0.03, 6, true); // barrel
    grip();
    bd.box(0.02, -0.20, -0.03, 0.12, -0.03, 0.03); // grip
    bd.box(0.18, -0.22, -0.035, 0.26, -0.03, 0.035); // magazine
    bd.setMat(MAT.PLAIN).setColor(0.15, 0.15, 0.16);
    bd.box(0.30, -0.12, -0.03, 0.38, -0.03, 0.03); // foregrip
  } else if (id === 'shotgun') {
    bd.setMat(MAT.PLAIN).setColor(0.35, 0.24, 0.14); // wooden pump + stock
    bd.box(-0.28, -0.06, -0.035, 0.30, 0.02, 0.035);
    bd.box(-0.42, -0.16, -0.03, -0.26, -0.02, 0.03);
    gunmetal();
    bd.tube([0.28, 0.02, 0], [0.72, 0.02, 0], 0.045, 0.045, 8, true); // barrel
    bd.tube([0.28, -0.04, 0], [0.62, -0.04, 0], 0.035, 0.035, 8, true); // tube
    bd.setMat(MAT.EMIT).setColor(1.0, 0.4, 0.15);
    bd.box(0.68, 0.05, -0.01, 0.72, 0.08, 0.01); // bead sight
  } else if (id === 'rifle') {
    gunmetal();
    bd.box(-0.10, -0.03, -0.035, 0.55, 0.07, 0.035); // receiver
    bd.tube([0.55, 0.02, 0], [0.85, 0.02, 0], 0.028, 0.028, 6, true); // barrel
    bd.setMat(MAT.PLAIN).setColor(0.30, 0.20, 0.12);
    bd.box(-0.38, -0.14, -0.03, -0.10, -0.02, 0.03); // stock
    bd.box(0.30, -0.12, -0.03, 0.48, -0.02, 0.03); // handguard
    grip();
    bd.box(0.05, -0.20, -0.03, 0.14, -0.03, 0.03); // grip
    bd.setMat(MAT.METAL).setColor(0.55, 0.55, 0.58);
    bd.box(0.16, -0.24, -0.025, 0.24, -0.03, 0.025); // curved mag
    bd.box(0.38, 0.07, -0.01, 0.46, 0.12, 0.01); // front sight
  } else if (id === 'bat') {
    bd.setMat(MAT.PLAIN).setColor(0.72, 0.55, 0.32); // wooden bat
    bd.tube([0, 0, 0], [0.85, 0, 0], 0.035, 0.055, 8, true);
    bd.setColor(0.55, 0.40, 0.22);
    bd.tube([-0.05, 0, 0], [0.18, 0, 0], 0.04, 0.04, 8, true); // taped handle
  }
  return bd;
}

// Muzzle flash: a small star of emissive quads at the muzzle (barrel tip).
// Built in weapon space; the caller draws it at the muzzle for ~60ms.
export function buildMuzzleFlash() {
  const bd = new MeshBuilder();
  bd.setMat(MAT.EMIT).setColor(1.0, 0.85, 0.35);
  const s = 0.22;
  bd.quad([0, -s, 0], [0, s, 0], [0, s * 0.4, s * 0.4], [0, -s * 0.4, s * 0.4]);
  bd.quad([0, 0, -s], [0, 0, s], [0, s * 0.4, s * 0.4], [0, -s * 0.4, s * 0.4]);
  bd.setColor(1.0, 0.6, 0.15);
  bd.blob(0, 0, 0, 0.12, 0.12, 0.12, 7);
  return bd.build();
}

// Ammo pickup: a glowing green box with a bullet stripe.
export function buildAmmoPickup() {
  const bd = new MeshBuilder();
  bd.setMat(MAT.EMIT).setColor(0.25, 0.9, 0.35);
  bd.box(-0.22, 0.05, -0.15, 0.22, 0.30, 0.15);
  bd.setMat(MAT.PLAIN).setColor(0.15, 0.5, 0.2);
  bd.box(-0.22, 0.30, -0.15, 0.22, 0.38, 0.15);
  bd.setMat(MAT.METAL).setColor(0.85, 0.75, 0.35);
  bd.box(-0.16, 0.38, -0.05, 0.16, 0.46, 0.05);
  return bd.build();
}
