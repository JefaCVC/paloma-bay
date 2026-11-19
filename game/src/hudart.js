// hudart.js — Paloma Bay: HUD artwork (weapon icons, crew portraits).
// All original inline SVG, drawn for this game. The weapon silhouettes
// use a 48×24 viewBox with fill=currentColor so the slot's state colours
// the icon (amber when current, dimmed when locked). The portraits are
// flat-style SVG busts (96×96 viewBox), one per story character — same
// flat cut-out language as the weapon icons: bold shapes, no gradients,
// dark ink outlines. CREW_ROLES is the one-line job description shown
// under each name on the title screen and the pause crew list.

export const WEAPON_ICONS = {
  pistol: '<path d="M6 4h34v6H22l-3 11h-7l2-11H6z"/>',
  smg: '<path d="M4 5h30v6H26l-2 8h-6l2-8H16l-2 9H8l2-9H4z"/><rect x="34" y="7" width="10" height="2.5"/>',
  shotgun: '<rect x="4" y="6" width="38" height="4.5"/><rect x="12" y="10.5" width="9" height="4" rx="1"/><path d="M4 10.5h7l-3 9.5H4z"/>',
  rifle: '<rect x="4" y="6" width="36" height="4"/><rect x="40" y="7" width="6" height="2"/><path d="M16 10h8l-2 8h-5z"/><path d="M4 10h5l-1 5H4z"/><rect x="26" y="3" width="6" height="3"/>',
  bat: '<rect x="20" y="2" width="5" height="20" rx="2.5" transform="rotate(35 22 12)"/>',
};

// Character portraits: original flat-style SVG busts (96×96 viewBox),
// one per story character — used by the choice dialog, mission dialogs,
// the pause STORY tab and the title screen.
export const PORTRAITS = {
  theo: { name: 'Theo', svg:
    '<rect width="96" height="96" rx="10" fill="#123a3a"/>'
    + '<path d="M14 96C16 72 30 62 48 62C66 62 80 72 82 96Z" fill="#1f7a7a"/>'
    + '<path d="M40 62L48 78L56 62L52 60L48 68L44 60Z" fill="#f5c542"/>'
    + '<rect x="42" y="50" width="12" height="14" fill="#e8b98a"/>'
    + '<ellipse cx="48" cy="40" rx="16" ry="18" fill="#e8b98a"/>'
    + '<path d="M32 42C30 24 38 15 48 15C58 15 66 24 64 42C62 33 60 30 58 30C59 26 55 24 48 24C41 24 37 26 38 30C36 30 34 33 32 42Z" fill="#241a12"/>'
    + '<circle cx="42" cy="39" r="2.2" fill="#1a1210"/><circle cx="54" cy="39" r="2.2" fill="#1a1210"/>'
    + '<path d="M43 50Q48 53 53 50" stroke="#8a4a3a" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  mara: { name: 'Mara', svg:
    '<rect width="96" height="96" rx="10" fill="#3a2a12"/>'
    + '<path d="M14 96C16 72 30 62 48 62C66 62 80 72 82 96Z" fill="#2a7a8a"/>'
    + '<rect x="36" y="60" width="6" height="12" fill="#c85a1e"/><rect x="54" y="60" width="6" height="12" fill="#c85a1e"/>'
    + '<rect x="34" y="70" width="28" height="26" fill="#c85a1e"/>'
    + '<rect x="42" y="50" width="12" height="14" fill="#eab98a"/>'
    + '<ellipse cx="48" cy="40" rx="16" ry="18" fill="#eab98a"/>'
    + '<path d="M32 42C30 24 38 15 48 15C58 15 66 24 64 42C62 33 60 30 58 30C59 26 55 24 48 24C41 24 37 26 38 30C36 30 34 33 32 42Z" fill="#6b3a1a"/>'
    + '<path d="M62 24C72 24 75 38 70 47C66 43 63 34 62 24Z" fill="#6b3a1a"/>'
    + '<circle cx="42" cy="39" r="2.2" fill="#1a1210"/><circle cx="54" cy="39" r="2.2" fill="#1a1210"/>'
    + '<path d="M43 50Q48 53 53 50" stroke="#8a4a3a" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  zed: { name: 'Zed', svg:
    '<rect width="96" height="96" rx="10" fill="#1a2a1a"/>'
    + '<path d="M14 96C16 72 30 62 48 62C66 62 80 72 82 96Z" fill="#3a5a3a"/>'
    + '<rect x="42" y="50" width="12" height="14" fill="#8a5a3a"/>'
    + '<ellipse cx="48" cy="40" rx="16" ry="18" fill="#8a5a3a"/>'
    + '<path d="M34 48C36 58 42 62 48 62C54 62 60 58 62 48C60 54 56 56 54 56C54 52 52 50 48 50C44 50 42 52 42 56C40 56 36 54 34 48Z" fill="#1a1210"/>'
    + '<path d="M30 30C30 16 38 12 48 12C58 12 66 16 66 30L66 32L30 32Z" fill="#2a3a2a"/>'
    + '<rect x="28" y="30" width="40" height="5" rx="2.5" fill="#1a2a1a"/>'
    + '<circle cx="42" cy="39" r="2.2" fill="#14100e"/><circle cx="54" cy="39" r="2.2" fill="#14100e"/>' },
  isadora: { name: 'Isadora', svg:
    '<rect width="96" height="96" rx="10" fill="#2a1a3a"/>'
    + '<path d="M14 96C16 72 30 62 48 62C66 62 80 72 82 96Z" fill="#7a2a8a"/>'
    + '<rect x="42" y="50" width="12" height="14" fill="#f0c8a0"/>'
    + '<ellipse cx="48" cy="40" rx="16" ry="18" fill="#f0c8a0"/>'
    + '<path d="M28 44C26 20 36 12 48 12C60 12 70 20 68 44L68 58C64 52 62 50 60 50L60 34C58 26 54 22 48 22C42 22 38 26 36 34L36 50C34 50 32 52 28 58Z" fill="#14101a"/>'
    + '<circle cx="33" cy="52" r="2.5" fill="#f5c542"/><circle cx="63" cy="52" r="2.5" fill="#f5c542"/>'
    + '<circle cx="42" cy="39" r="2.2" fill="#1a1210"/><circle cx="54" cy="39" r="2.2" fill="#1a1210"/>'
    + '<path d="M43 50Q48 53 53 50" stroke="#a03040" stroke-width="2" fill="none" stroke-linecap="round"/>' },
};

export function portraitSVG(key, size) {
  const p = PORTRAITS[key] || PORTRAITS.theo;
  return '<svg viewBox="0 0 96 96" width="' + size + '" height="' + size + '" aria-hidden="true">' + p.svg + '</svg>';
}

export function portraitFor(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('MARA')) return 'mara';
  if (n.includes('ZED')) return 'zed';
  if (n.includes('ISADORA') || n.includes('VIREO')) return 'isadora';
  return 'theo';
}

// One-line job description per crew member (title screen + pause crew list).
export const CREW_ROLES = {
  theo: 'Night-taxi driver',
  mara: 'Runs the garage',
  zed: "Fixer · Zed's Pawn",
  isadora: 'La Paloma · Vireo family',
};
