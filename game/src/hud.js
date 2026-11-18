// hud.js — every pixel of UI in PALOMA BAY.
// One kit: dark gradient panels, 2px borders, amber accent (#f5c542),
// outlined text, 4-unit spacing scale. Four-corner HUD like the top 5:
//   top-left     mission objective + PBPD response + dispatch chatter
//   top-right    wanted stars + cash + rep + clock, weapon bar below
//   bottom-left  ROUND minimap + district + loyalty/favor + TRACE
//   bottom-right radio + car name + condition bar + big speed + hint
// Text never leaves its box: DOM panels wrap and clip by CSS; canvas text
// is measured (measureText) before it is drawn. All UI text is English.

import { AVENUES, CITY, DISTRICTS, ISLAND, POI, POSTCARDS, STREETS, WATER_Z } from './world.js';
import { REP_TITLES, completionPercent } from './missions.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { clockLabel } from './sky.js';

// --- element handles ------------------------------------------------------------
let el = {};
let minimapCtx = null;
let mapCtx = null;
let bannerTimer = null;
let toastTimer = null;

// Weapon silhouettes for the HUD slots: original inline-SVG paths drawn
// for this game (48×24 viewBox, fill=currentColor so the slot's state
// colours the icon — amber when current, dimmed when locked).
const WEAPON_ICONS = {
  pistol: '<path d="M6 4h34v6H22l-3 11h-7l2-11H6z"/>',
  smg: '<path d="M4 5h30v6H26l-2 8h-6l2-8H16l-2 9H8l2-9H4z"/><rect x="34" y="7" width="10" height="2.5"/>',
  shotgun: '<rect x="4" y="6" width="38" height="4.5"/><rect x="12" y="10.5" width="9" height="4" rx="1"/><path d="M4 10.5h7l-3 9.5H4z"/>',
  rifle: '<rect x="4" y="6" width="36" height="4"/><rect x="40" y="7" width="6" height="2"/><path d="M16 10h8l-2 8h-5z"/><path d="M4 10h5l-1 5H4z"/><rect x="26" y="3" width="6" height="3"/>',
  bat: '<rect x="20" y="2" width="5" height="20" rx="2.5" transform="rotate(35 22 12)"/>',
};

export function initHUD() {
  const ids = [
    'hud', 'wanted-stars', 'cash', 'rep-title', 'loyalty-bar', 'loyalty-val',
    'favor-bar', 'favor-val', 'trace-wrap', 'trace-bar', 'trace-val',
    'minimap', 'clock', 'district', 'radio',
    'response-panel', 'response-rows',
    'mission-panel', 'mission-name', 'mission-stage', 'mission-objective',
    'mission-dist', 'mission-next', 'chatter',
    'weapon-name', 'weapon-slots', 'speed', 'speed-wrap', 'car-name', 'car-cond-bar', 'hint',
    'crosshair', 'interact', 'dialog', 'dialog-speaker', 'dialog-text',
    'choices', 'banner', 'banner-title', 'banner-sub', 'toast', 'vignette',
    'health-bar', 'health-wrap',
    'title-screen', 'pause-screen', 'map-canvas', 'pause-missions',
    'pause-stats', 'pause-garage', 'pause-saves',
    'shop-screen', 'shop-title', 'shop-items',
    'ending-screen', 'ending-name', 'ending-title', 'ending-desc', 'ending-stats',
    'dead-screen', 'dead-title', 'dead-sub',
    'howto-panel',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
  if (el.minimap) minimapCtx = el.minimap.getContext('2d');
  if (el['map-canvas']) mapCtx = el['map-canvas'].getContext('2d');
}

function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

// --- HUD update (per frame) -------------------------------------------------------
export function updateHUD(view) {
  const p = view.profile;
  // Top-right status: wanted + money + rep. (Loyalty/favor/TRACE live
  // under the minimap, bottom-left.)
  if (el['wanted-stars']) {
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < view.police.wanted ? '★' : '☆';
    setText(el['wanted-stars'], stars);
    el['wanted-stars'].className = 'stars' + (view.police.wanted > 0 ? ' hot' : '');
  }
  setText(el.cash, '$' + Math.floor(p.cash).toLocaleString('en-US'));
  setText(el['rep-title'], REP_TITLES[p.rep] + ' · REP ' + p.rep);
  if (el['loyalty-bar']) el['loyalty-bar'].style.width = p.loyalty + '%';
  setText(el['loyalty-val'], 'LOYALTY ' + Math.round(p.loyalty));
  if (el['favor-bar']) el['favor-bar'].style.width = p.favor + '%';
  setText(el['favor-val'], 'FAVOR ' + Math.round(p.favor));
  if (el['trace-wrap']) {
    el['trace-wrap'].style.display = view.police.wanted > 0 ? 'flex' : 'none';
    if (el['trace-bar']) el['trace-bar'].style.width = Math.round(view.police.trace) + '%';
    setText(el['trace-val'], 'TRACE ' + Math.round(view.police.trace) + '%' + (view.seen ? ' · IN SIGHT' : ' · HIDDEN'));
  }
  // Clock (top-right status), district (under the minimap, bottom-left),
  // radio (bottom-right).
  setText(el.clock, clockLabel(view.hour) + ' · DAY ' + view.day + (view.rain > 0.3 ? ' · RAIN' : ''));
  setText(el.district, view.district);
  setText(el.radio, view.station + ' — ' + view.track);
  // PBPD response panel: per-unit name + live distance + state.
  if (el['response-panel']) {
    const units = view.police.units || [];
    const show = units.length > 0 || view.police.heli;
    el['response-panel'].style.display = show ? 'block' : 'none';
    if (show && el['response-rows']) {
      let html = '';
      for (const u of units.slice(0, 4)) {
        html += '<div class="resp-row"><span>' + escapeHtml(u.name) + '</span>'
          + '<span class="st">' + escapeHtml(u.state || 'RESPONDING') + '</span>'
          + '<span class="d">' + Math.round(u.dist || 0) + 'm</span></div>';
      }
      if (view.police.heli) {
        html += '<div class="resp-row"><span>AIR-1 HELI</span>'
          + '<span class="st">SPOTLIGHT</span>'
          + '<span class="d">' + Math.round(view.police.heliDist || 0) + 'm</span></div>';
      }
      if (el['response-rows'].innerHTML !== html) el['response-rows'].innerHTML = html;
    }
  }
  // Top-left: mission objective.
  if (el['mission-panel']) {
    const m = view.mission;
    if (m && m.active) {
      el['mission-panel'].style.display = 'block';
      setText(el['mission-name'], m.name);
      setText(el['mission-stage'], 'STAGE ' + (m.stageIndex + 1) + '/' + m.stages);
      setText(el['mission-objective'], m.objective || '');
      setText(el['mission-dist'], m.dist !== null && m.dist !== undefined ? Math.round(m.dist) + ' m' : '');
      setText(el['mission-next'], m.next ? 'NEXT: ' + m.next : '');
    } else {
      el['mission-panel'].style.display = 'none';
    }
  }
  // Dispatch chatter feed.
  if (el.chatter) {
    const html = view.police.chatter.map((c) => '<div>' + escapeHtml(c.text) + '</div>').join('');
    if (el.chatter.innerHTML !== html) el.chatter.innerHTML = html;
  }
  // Top-right: weapon bar — picture-icon slots with ammo under each
  // icon (current raised + amber, locked dimmed + LOCKED label).
  const w = WEAPONS[view.weapon];
  setText(el['weapon-name'], w ? w.name : '');
  if (el['weapon-slots']) {
    const slots = WEAPON_ORDER.map((id) => {
      const w2 = WEAPONS[id];
      const slot = view.loadout.owned[id];
      const owned = slot && slot.owned;
      const cur = id === view.weapon;
      const ammo = !owned ? 'LOCKED' : w2.melee ? '—' : (slot.mag + '/' + slot.reserve);
      return '<span class="slot' + (cur ? ' cur' : '') + (owned ? '' : ' locked') + '">'
        + '<span class="slot-key">' + w2.slot + '</span>'
        + '<svg viewBox="0 0 48 24" fill="currentColor" aria-hidden="true">' + WEAPON_ICONS[id] + '</svg>'
        + '<span class="slot-ammo">' + ammo + '</span></span>';
    }).join('');
    if (el['weapon-slots'].innerHTML !== slots) el['weapon-slots'].innerHTML = slots;
  }
  // Bottom-right: radio + big speed (car name + condition bar + huge speed).
  if (el['speed-wrap']) {
    el['speed-wrap'].style.display = view.inCar ? 'block' : 'none';
    setText(el['car-name'], view.carName || '');
    setText(el.speed, String(Math.round(view.speed * 3.6)));
    if (el['car-cond-bar']) {
      const hp = view.carHp === undefined || view.carHp === null ? 100 : view.carHp;
      el['car-cond-bar'].style.width = Math.max(0, Math.min(100, hp)) + '%';
      el['car-cond-bar'].style.background = hp > 50 ? 'var(--green)' : hp > 25 ? 'var(--amber)' : 'var(--red)';
    }
  }
  setText(el.hint, view.hint || '');
  // Health bar.
  if (el['health-wrap']) {
    el['health-wrap'].style.display = view.health < 100 ? 'block' : 'none';
    if (el['health-bar']) el['health-bar'].style.width = Math.max(0, view.health) + '%';
  }
  // Crosshair + interact prompt.
  if (el.crosshair) el.crosshair.style.display = view.aiming ? 'block' : 'none';
  if (el.interact) {
    el.interact.style.display = view.interact ? 'block' : 'none';
    setText(el.interact, view.interact || '');
  }
  // Damage vignette.
  if (el.vignette) {
    el.vignette.style.opacity = view.health < 35 ? String(0.25 + 0.45 * (1 - view.health / 35)) : '0';
  }
  // Minimap.
  if (minimapCtx) drawMinimap(minimapCtx, view);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- minimap + full map ----------------------------------------------------------
// Shared world drawing: water, ground, beach, roads, causeway, island.
// `scale` maps world units to canvas pixels; `ox/oy` is the world origin
// offset (top-left of the drawn area).
function drawWorldBase(ctx, w, h, scale, ox, oy) {
  const X = (wx) => (wx - ox) * scale;
  const Z = (wz) => (wz - oy) * scale;
  // Water background.
  ctx.fillStyle = '#1d4a66';
  ctx.fillRect(0, 0, w, h);
  // Mainland ground.
  ctx.fillStyle = '#3f4a3a';
  ctx.fillRect(X(CITY.x0), Z(CITY.z0), (CITY.x1 - CITY.x0) * scale, (100 - CITY.z0) * scale);
  // Beach sand.
  ctx.fillStyle = '#b8a86a';
  ctx.fillRect(X(CITY.x0), Z(100), (CITY.x1 - CITY.x0) * scale, (WATER_Z - 100) * scale);
  // Island.
  ctx.fillStyle = '#3f4a3a';
  ctx.beginPath();
  ctx.ellipse(
    X(ISLAND.cx), Z(ISLAND.cz),
    ISLAND.rx * scale, ISLAND.rz * scale, 0, 0, Math.PI * 2,
  );
  ctx.fill();
  // Roads.
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = Math.max(1, 8 * scale);
  for (const x of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(X(x), Z(CITY.z0));
    ctx.lineTo(X(x), Z(100));
    ctx.stroke();
  }
  for (const z of STREETS) {
    ctx.beginPath();
    ctx.moveTo(X(CITY.x0), Z(z));
    ctx.lineTo(X(CITY.x1), Z(z));
    ctx.stroke();
  }
  // Causeway.
  ctx.beginPath();
  ctx.moveTo(X(0), Z(100));
  ctx.lineTo(X(0), Z(ISLAND.cz - ISLAND.rz));
  ctx.stroke();
  return { X, Z };
}

function drawBlip(ctx, X, Z, x, z, color, size, shape) {
  const px = X(x), pz = Z(z);
  ctx.fillStyle = color;
  if (shape === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(px, pz - size);
    ctx.lineTo(px + size, pz);
    ctx.lineTo(px, pz + size);
    ctx.lineTo(px - size, pz);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(px, pz, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMinimap(ctx, view) {
  const w = 180, h = 180;
  ctx.clearRect(0, 0, w, h);
  // Round minimap: clip the world to a circle (the CSS border-radius
  // rounds the canvas box; the clip rounds the drawing itself).
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.clip();
  // The minimap shows the whole city (north up); the player arrow rotates.
  const scale = w / (CITY.x1 - CITY.x0 + 20);
  const { X, Z } = drawWorldBase(ctx, w, h, scale, CITY.x0 - 10, CITY.z0 - 10);
  // Postcards (uncollected).
  const collected = new Set(view.profile.postcards);
  POSTCARDS.forEach(([x, z], i) => {
    if (!collected.has(i)) drawBlip(ctx, X, Z, x, z, '#f5c542', 2, 'circle');
  });
  // Shops.
  drawBlip(ctx, X, Z, POI.garage.x, POI.garage.z, '#4da6ff', 3, 'circle');
  drawBlip(ctx, X, Z, POI.gunshop.x, POI.gunshop.z, '#ff6b4a', 3, 'circle');
  drawBlip(ctx, X, Z, POI.safehouse.x, POI.safehouse.z, '#7ddb52', 3, 'circle');
  drawBlip(ctx, X, Z, POI.pawn.x, POI.pawn.z, '#c07df0', 3, 'circle');
  // Mission marker.
  if (view.mission && view.mission.active && view.mission.mx !== undefined) {
    drawBlip(ctx, X, Z, view.mission.mx, view.mission.mz, '#ffd23e', 5, 'diamond');
  }
  // Police units.
  for (const u of view.police.units) {
    drawBlip(ctx, X, Z, u.x, u.z, '#4a90ff', 3, 'circle');
  }
  if (view.police.heli) {
    drawBlip(ctx, X, Z, view.police.heli.x, view.police.heli.z, '#4a90ff', 4, 'diamond');
  }
  // Player arrow (rotates with yaw).
  const px = X(view.player.x), pz = Z(view.player.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.atan2(-Math.sin(view.player.yaw), Math.cos(view.player.yaw)) + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore(); // end the circular clip
}

// Full map for the pause screen: bigger, with district labels (measured).
export function drawFullMap(view) {
  if (!mapCtx) return;
  const ctx = mapCtx;
  // Full world incl. Isla Verde: x -240..240 (480u), z -175..245 (420u).
  const w = 640, h = 560;
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w / 480, h / 420);
  const { X, Z } = drawWorldBase(ctx, w, h, scale, -240, -175);
  // Labels are clamped to the canvas: no text may leave the map.
  const clampLabel = (x, y, tw) => [
    Math.max(4, Math.min(w - tw - 4, x)),
    Math.max(12, Math.min(h - 4, y)),
  ];
  // District labels — at the top edge of each region (clear of the POI
  // labels, which sit near the region centres), measured + clamped.
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3;
  for (const d of DISTRICTS) {
    const [x0, x1, z0, z1] = d.region;
    const cx = X((x0 + x1) / 2), cz = Z(z0 + 6);
    const tw = ctx.measureText(d.name).width;
    const [lx, ly] = clampLabel(cx - tw / 2, cz, tw);
    ctx.strokeText(d.name, lx, ly);
    ctx.fillText(d.name, lx, ly);
  }
  // POI labels.
  ctx.font = '11px Arial, sans-serif';
  const labels = [
    [POI.garage, "Mara's Garage"], [POI.gunshop, 'Iron & Oak Guns'],
    [POI.safehouse, "Theo's Apartment"], [POI.pawn, "Zed's Pawn"],
    [POI.vireoHQ, 'Vireo Import House'], [POI.ferris, 'Paloma Wheel'],
    [POI.lighthouse, 'Isla Verde Light'], [POI.pier, 'Porto Lumen Pier'],
  ];
  for (const [poi, name] of labels) {
    const tw = ctx.measureText(name).width;
    const [lx, ly] = clampLabel(X(poi.x) - tw / 2, Z(poi.z) - 8, tw);
    ctx.strokeText(name, lx, ly);
    ctx.fillText(name, lx, ly);
  }
  const collected = new Set(view.profile.postcards);
  POSTCARDS.forEach(([x, z], i) => {
    if (!collected.has(i)) drawBlip(ctx, X, Z, x, z, '#f5c542', 3, 'circle');
  });
  drawBlip(ctx, X, Z, POI.garage.x, POI.garage.z, '#4da6ff', 5, 'circle');
  drawBlip(ctx, X, Z, POI.gunshop.x, POI.gunshop.z, '#ff6b4a', 5, 'circle');
  drawBlip(ctx, X, Z, POI.safehouse.x, POI.safehouse.z, '#7ddb52', 5, 'circle');
  drawBlip(ctx, X, Z, POI.pawn.x, POI.pawn.z, '#c07df0', 5, 'circle');
  if (view.mission && view.mission.active && view.mission.mx !== undefined) {
    drawBlip(ctx, X, Z, view.mission.mx, view.mission.mz, '#ffd23e', 8, 'diamond');
  }
  for (const u of view.police.units) {
    drawBlip(ctx, X, Z, u.x, u.z, '#4a90ff', 4, 'circle');
  }
  const px = X(view.player.x), pz = Z(view.player.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.atan2(-Math.sin(view.player.yaw), Math.cos(view.player.yaw)) + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- dialog / choices / banners / toasts -----------------------------------------
export function showDialog(speaker, text) {
  if (!el.dialog) return;
  el.dialog.style.display = 'block';
  setText(el['dialog-speaker'], speaker);
  setText(el['dialog-text'], text);
}
export function hideDialog() {
  if (el.dialog) el.dialog.style.display = 'none';
}

export function showChoices(stage, onPick) {
  if (!el.choices) return;
  el.choices.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'choices-title';
  title.textContent = stage.text;
  el.choices.appendChild(title);
  stage.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    const label = document.createElement('div');
    label.className = 'choice-label';
    label.textContent = (i + 1) + '. ' + opt.label;
    const sub = document.createElement('div');
    sub.className = 'choice-sub';
    sub.textContent = opt.sub || '';
    btn.appendChild(label);
    btn.appendChild(sub);
    btn.addEventListener('click', () => onPick(i));
    el.choices.appendChild(btn);
  });
  el.choices.style.display = 'block';
}
export function hideChoices() {
  if (el.choices) el.choices.style.display = 'none';
}

export function showBanner(title, sub, ms) {
  if (!el.banner) return;
  setText(el['banner-title'], title);
  setText(el['banner-sub'], sub || '');
  el.banner.style.display = 'block';
  el.banner.classList.remove('fade');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    el.banner.classList.add('fade');
    setTimeout(() => { el.banner.style.display = 'none'; }, 600);
  }, ms || 2800);
}

export function toast(text, ms) {
  if (!el.toast) return;
  setText(el.toast, text);
  el.toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.style.display = 'none'; }, ms || 2600);
}

// --- screens -----------------------------------------------------------------------
const SCREENS = ['title-screen', 'pause-screen', 'shop-screen', 'ending-screen', 'dead-screen'];
export function showScreen(name) {
  for (const id of SCREENS) {
    if (el[id]) el[id].style.display = id === name ? 'flex' : 'none';
  }
  // The HUD hides under every screen (pause included): the pause screen
  // carries missions, stats and the map itself, and a HUD bleeding through
  // the overlay reads as clutter.
  if (el.hud) el.hud.style.display = name === null ? 'block' : 'none';
}

export function fillPauseScreen(view) {
  const p = view.profile;
  if (el['pause-missions']) {
    const rows = view.missionList.map((m) => {
      const state = m.done ? 'DONE' : m.unlocked ? 'AVAILABLE' : 'LOCKED';
      const cls = m.done ? 'done' : m.unlocked ? 'open' : 'locked';
      return '<div class="prow ' + cls + '"><span>' + m.id + '. ' + escapeHtml(m.name) + '</span><span>' + state + '</span></div>';
    }).join('');
    el['pause-missions'].innerHTML = rows;
  }
  if (el['pause-stats']) {
    const s = p.stats;
    el['pause-stats'].innerHTML =
      '<div class="prow"><span>Completion</span><span>' + completionPercent(p) + '%</span></div>' +
      '<div class="prow"><span>Cash</span><span>$' + Math.floor(p.cash).toLocaleString('en-US') + '</span></div>' +
      '<div class="prow"><span>Reputation</span><span>' + REP_TITLES[p.rep] + '</span></div>' +
      '<div class="prow"><span>Postcards</span><span>' + p.postcards.length + ' / 20</span></div>' +
      '<div class="prow"><span>Enemies down</span><span>' + s.kills + '</span></div>' +
      '<div class="prow"><span>Cars stolen</span><span>' + s.carsStolen + '</span></div>' +
      '<div class="prow"><span>Distance driven</span><span>' + (s.distanceDriven / 1000).toFixed(1) + ' km</span></div>' +
      '<div class="prow"><span>Endings seen</span><span>' + (p.endingsSeen || []).length + ' / 3</span></div>';
  }
  if (el['pause-garage']) {
    const u = p.upgrades;
    el['pause-garage'].innerHTML =
      '<div class="prow"><span>Engine</span><span>' + (u.engine ? 'LVL 2 ✓' : 'STOCK') + '</span></div>' +
      '<div class="prow"><span>Armour</span><span>' + (u.armour ? 'FITTED ✓' : 'NONE') + '</span></div>' +
      '<div class="prow"><span>Nitro</span><span>' + (u.nitro ? 'READY ✓' : 'LOCKED') + '</span></div>' +
      '<div class="prow"><span>Resprays</span><span>' + (u.respray || 0) + '</span></div>';
  }
  drawFullMap(view);
}

export function fillShopScreen(kind, view, onBuy) {
  if (!el['shop-screen'] || !el['shop-items']) return;
  const p = view.profile;
  if (kind === 'gunshop') {
    setText(el['shop-title'], 'IRON & OAK GUNS — Buy weapons & ammo');
    el['shop-items'].innerHTML = '';
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const owned = p.loadout.owned[id];
      const row = document.createElement('div');
      row.className = 'shop-row';
      const locked = p.rep < w.repReq;
      const name = document.createElement('div');
      name.className = 'shop-name';
      name.textContent = w.name + (w.melee ? '' : '  ·  DMG ' + w.dmg + '  ·  MAG ' + w.mag);
      const desc = document.createElement('div');
      desc.className = 'shop-desc';
      desc.textContent = w.desc + (locked ? '  [Requires REP ' + w.repReq + ' — ' + REP_TITLES[w.repReq] + ']' : '');
      const btn = document.createElement('button');
      btn.className = 'shop-btn';
      if (!owned.owned) {
        btn.textContent = locked ? 'LOCKED' : 'BUY $' + w.price;
        btn.disabled = locked || p.cash < w.price;
        btn.addEventListener('click', () => onBuy('buy', id));
      } else if (!w.melee) {
        btn.textContent = 'AMMO $' + w.ammoPrice;
        btn.disabled = p.cash < w.ammoPrice;
        btn.addEventListener('click', () => onBuy('ammo', id));
      } else {
        btn.textContent = 'OWNED';
        btn.disabled = true;
      }
      const left = document.createElement('div');
      left.appendChild(name);
      left.appendChild(desc);
      row.appendChild(left);
      row.appendChild(btn);
      el['shop-items'].appendChild(row);
    }
  } else if (kind === 'garage') {
    setText(el['shop-title'], "MARA'S GARAGE — Upgrades & respray");
    el['shop-items'].innerHTML = '';
    const items = [
      { id: 'engine', name: 'Engine Tuning LVL 2', desc: '+25% top speed, faster acceleration.', price: 1500, done: p.upgrades.engine },
      { id: 'armour', name: 'Armour Plating', desc: '+50% car health. Survive the chase.', price: 1200, done: p.upgrades.armour },
      { id: 'nitro', name: 'Nitro System', desc: 'Hold SHIFT for a speed boost.', price: 800, done: p.upgrades.nitro },
      { id: 'respray', name: 'Respray & New Plates', desc: 'Clears your wanted level completely.', price: 300, done: false },
      { id: 'repair', name: 'Full Repair (Mara — FREE)', desc: 'Crew ability: Mara fixes your car for free.', price: 0, done: false },
    ];
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'shop-row';
      const name = document.createElement('div');
      name.className = 'shop-name';
      name.textContent = it.name;
      const desc = document.createElement('div');
      desc.className = 'shop-desc';
      desc.textContent = it.desc;
      const btn = document.createElement('button');
      btn.className = 'shop-btn';
      btn.textContent = it.done ? 'OWNED' : it.price === 0 ? 'FREE' : 'BUY $' + it.price;
      btn.disabled = it.done || p.cash < it.price;
      btn.addEventListener('click', () => onBuy(it.id, null));
      const left = document.createElement('div');
      left.appendChild(name);
      left.appendChild(desc);
      row.appendChild(left);
      row.appendChild(btn);
      el['shop-items'].appendChild(row);
    }
  }
}

export function fillEndingScreen(ending, profile) {
  setText(el['ending-name'], ending.name);
  setText(el['ending-title'], ending.title);
  setText(el['ending-desc'], ending.desc);
  if (el['ending-stats']) {
    el['ending-stats'].innerHTML =
      '<div class="prow"><span>Completion</span><span>' + completionPercent(profile) + '%</span></div>' +
      '<div class="prow"><span>Missions complete</span><span>' + profile.missionsDone.length + ' / 8</span></div>' +
      '<div class="prow"><span>Cash</span><span>$' + Math.floor(profile.cash).toLocaleString('en-US') + '</span></div>' +
      '<div class="prow"><span>Loyalty / Favor</span><span>' + Math.round(profile.loyalty) + ' / ' + Math.round(profile.favor) + '</span></div>' +
      '<div class="prow"><span>Postcards</span><span>' + profile.postcards.length + ' / 20</span></div>';
  }
  if (el['ending-screen']) {
    el['ending-screen'].style.setProperty('--ending-accent', 'rgb(' + ending.color.map((c) => Math.round(c * 255)).join(',') + ')');
  }
}

export function fillDeadScreen(kind) {
  if (kind === 'busted') {
    setText(el['dead-title'], 'BUSTED');
    setText(el['dead-sub'], 'The PBPD caught you. Bail: $250. Your weapons stay — the bay is not done with you.');
  } else {
    setText(el['dead-title'], 'WASTED');
    setText(el['dead-sub'], 'Theo went down. The hospital patch-up costs $200. Paloma Bay waits for no one.');
  }
}
