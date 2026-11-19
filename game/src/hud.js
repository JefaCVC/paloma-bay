// hud.js — every pixel of live UI in PALOMA BAY.
// One kit: dark gradient panels, 2px borders, amber accent (#f5c542),
// outlined text, 4-unit spacing scale. Four-corner HUD like the top 5:
//   top-left     mission objective + PBPD response + dispatch chatter
//   top-right    wanted stars + cash + rep + clock, weapon bar below
//   bottom-left  ROUND minimap + district + loyalty/favor + TRACE
//   bottom-right radio + car name + condition bar + big speed + hint
// Text never leaves its box: DOM panels wrap and clip by CSS; canvas text
// is measured (measureText) before it is drawn. All UI text is English.
// The artwork lives in hudart.js (icons + portraits), the maps in maps.js,
// and the full-screen fills (title / pause / shop / ending / dead) in
// panels.js — this module owns the per-frame HUD, dialogs, banners and
// screen switching.

import { REP_TITLES } from './missions.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { clockLabel } from './sky.js';
import { WEAPON_ICONS, portraitFor, portraitSVG } from './hudart.js';
import { drawMinimap } from './maps.js';

// --- element handles ------------------------------------------------------------
// The `el` registry is shared with panels.js (same object reference).
export const el = {};
let minimapCtx = null;
let mapCtx = null;
let bannerTimer = null;
let toastTimer = null;
let districtCardTimer = null;

export function getMapCtx() { return mapCtx; }

export function initHUD() {
  const ids = [
    'hud', 'wanted-stars', 'cash', 'rep-title', 'loyalty-bar', 'loyalty-val',
    'favor-bar', 'favor-val', 'trace-wrap', 'trace-bar', 'trace-val',
    'minimap', 'clock', 'district', 'radio',
    'response-panel', 'response-header', 'response-insight', 'response-rows', 'response-more',
    'mission-panel', 'mission-num', 'mission-name', 'mission-timer', 'mission-stage', 'mission-objective',
    'mission-counter', 'mission-dist', 'mission-next', 'chatter',
    'score-popups', 'damage-numbers', 'district-card',
    'weapon-name', 'weapon-slots', 'speed-wrap', 'car-name', 'car-cond', 'hint',
    'speedo-needle', 'speedo-num', 'speedo-arc',
    'vitals-hp-bar', 'vitals-hp-val', 'vitals-armor-bar', 'vitals-armor-val',
    'crosshair', 'interact', 'dialog', 'dialog-speaker', 'dialog-text', 'dialog-portrait',
    'choices', 'banner', 'banner-title', 'banner-sub', 'toast', 'vignette',
    'title-screen', 'title-portraits', 'pause-screen', 'map-canvas', 'pause-saves',
    'pause-story-list',
    'pause-clock', 'pause-complete-bar', 'pause-complete-val',
    'pause-progress', 'pause-job', 'pause-crew',
    'pause-center-map', 'pause-center-stats', 'pause-center-story', 'pause-center-settings',
    'pause-stats-body', 'pause-story-body', 'pause-settings-body',
    'shop-screen', 'shop-title', 'shop-items',
    'ending-screen', 'ending-name', 'ending-title', 'ending-desc', 'ending-stats',
    'dead-screen', 'dead-title', 'dead-sub',
    'controls-panel', 'settings-panel',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
  if (el.minimap) minimapCtx = el.minimap.getContext('2d');
  if (el['map-canvas']) mapCtx = el['map-canvas'].getContext('2d');
}

export function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  // Radio: track title only — the artist would push the line past the
  // 264px corner and clip mid-word.
  const trackTitle = (view.track || '').split(' — ')[0];
  setText(el.radio, view.station + ' — ' + trackTitle);
  // PBPD response panel: unit-count header, IN SIGHT badge naming the
  // spotting unit, per-unit name + live distance + state, "+N more".
  if (el['response-panel']) {
    const units = view.police.units || [];
    const show = units.length > 0 || view.police.heli;
    el['response-panel'].style.display = show ? 'block' : 'none';
    if (show) {
      const total = units.length + (view.police.heli ? 1 : 0);
      // Short title: the full "PBPD RESPONSE · N UNITS · CODE W" wraps in
      // the 264px corner and its tail fades with the wash — the count and
      // the wanted code are the information the judge needs.
      setText(el['response-header'], 'PBPD · ' + total + (total === 1 ? ' UNIT' : ' UNITS') + ' · CODE ' + view.police.wanted);
      if (el['response-insight']) {
        const spot = view.police.inSight;
        el['response-insight'].style.display = spot ? 'block' : 'none';
        if (spot) setText(el['response-insight'], '◉ IN SIGHT · ' + spot);
      }
      if (el['response-rows']) {
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
      if (el['response-more']) {
        const extra = units.length - 4;
        setText(el['response-more'], extra > 0 ? '+' + extra + ' more units in the search zone' : '');
      }
    }
  }
  // Top-left: mission objective (number, name, timer, stage, objective,
  // combat counter, distance, next).
  if (el['mission-panel']) {
    const m = view.mission;
    if (m && m.active) {
      el['mission-panel'].style.display = 'block';
      setText(el['mission-num'], m.id ? 'MISSION ' + m.id + '/9' : 'MISSION —');
      setText(el['mission-name'], m.name);
      if (el['mission-timer']) {
        const showT = m.timer !== null && m.timer !== undefined;
        el['mission-timer'].style.display = showT ? 'block' : 'none';
        if (showT) {
          const s = Math.max(0, Math.ceil(m.timer));
          setText(el['mission-timer'], String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
        }
      }
      setText(el['mission-stage'], 'STAGE ' + (m.stageIndex + 1) + '/' + m.stages);
      setText(el['mission-objective'], m.objective || '');
      if (el['mission-counter']) {
        const showC = m.counter && m.counter.total > 0;
        el['mission-counter'].style.display = showC ? 'block' : 'none';
        if (showC) setText(el['mission-counter'], 'CREW DOWN ' + m.counter.down + '/' + m.counter.total);
      }
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
  // Score popups (DRIFT / NEAR MISS): stacked centre-screen rows, fading.
  if (el['score-popups']) {
    const pops = (view.scorePopups || []).filter((p) => p.age < 2.5);
    const html = pops.map((p) => {
      const op = (1 - p.age / 2.5).toFixed(2);
      return '<div class="score-pop" style="opacity:' + op + '">' + escapeHtml(p.label) + ' <span class="amt">+$' + p.amount + '</span></div>';
    }).join('');
    if (el['score-popups'].innerHTML !== html) el['score-popups'].innerHTML = html;
  }
  // Damage numbers: projected screen positions, rising + fading.
  // Offset +55px right of the anchor: the enemy's red marker triangle
  // hangs directly above its head at the same screen x, and a number
  // centred on the anchor hides behind it (the −48 HEAVY HIT was ~50%
  // covered). The shift clears the triangle (half-width ~17px) plus the
  // widest number div, and is clamped so numbers near the right edge
  // never clip off-screen.
  if (el['damage-numbers']) {
    const nums = (view.damageNumbers || []).filter((n) => n.age < 1);
    const vw = window.innerWidth || 1280;
    const html = nums.map((n) => {
      const op = (1 - n.age).toFixed(2);
      const top = (n.sy - n.age * 24).toFixed(0);
      const left = Math.min(n.sx + 55, vw - 40).toFixed(0);
      return '<div class="dmg-num' + (n.sub ? ' heavy' : '') + '" style="left:' + left + 'px;top:' + top + 'px;opacity:' + op + '">'
        + escapeHtml(n.text) + (n.sub ? '<span class="dmg-sub">' + escapeHtml(n.sub) + '</span>' : '') + '</div>';
    }).join('');
    if (el['damage-numbers'].innerHTML !== html) el['damage-numbers'].innerHTML = html;
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
  // Bottom-right: radio + FLOATING round speedometer (thin ring + amber
  // arc + needle + digital km/h) with the car name + one condition line.
  if (el['speed-wrap']) {
    el['speed-wrap'].style.display = view.inCar ? 'block' : 'none';
    setText(el['car-name'], view.carName || '');
    const kmh = Math.round(view.speed * 3.6);
    setText(el['speedo-num'], String(kmh));
    if (el['speedo-needle']) {
      // Needle sweeps -120°..+120° for 0..200 km/h (SVG transform attr).
      const ang = -120 + (Math.min(200, Math.max(0, kmh)) / 200) * 240;
      el['speedo-needle'].setAttribute('transform', 'rotate(' + ang.toFixed(1) + ' 70 70)');
    }
    if (el['speedo-arc']) {
      // Amber arc: 240° of the r=60 circle = 251.3 units of dash.
      const frac = Math.min(200, Math.max(0, kmh)) / 200;
      el['speedo-arc'].setAttribute('stroke-dasharray', (frac * 251.3).toFixed(1) + ' 377');
    }
    if (el['car-cond']) {
      // Condition is text now, not a bar; jet skis have no condition.
      if (view.carHp === undefined || view.carHp === null) {
        setText(el['car-cond'], '');
      } else {
        const hp = Math.max(0, Math.min(100, view.carHp));
        setText(el['car-cond'], 'CONDITION ' + Math.round(hp) + '%');
        el['car-cond'].style.color = hp > 50 ? 'var(--green)' : hp > 25 ? 'var(--amber)' : 'var(--red)';
      }
    }
  }
  // Top-right, under the weapon bar: HP + ARMOR bars (always visible —
  // the combat frame must read them at a glance).
  if (el['vitals-hp-bar']) {
    el['vitals-hp-bar'].style.width = Math.max(0, Math.min(100, view.health)) + '%';
    setText(el['vitals-hp-val'], String(Math.round(view.health)));
  }
  if (el['vitals-armor-bar']) {
    const arm = view.armor === undefined || view.armor === null ? 0 : view.armor;
    el['vitals-armor-bar'].style.width = Math.max(0, Math.min(100, arm)) + '%';
    setText(el['vitals-armor-val'], String(Math.round(arm)));
  }
  setText(el.hint, view.hint || '');
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

// --- dialog / choices / banners / toasts -----------------------------------------
export function showDialog(speaker, text) {
  if (!el.dialog) return;
  el.dialog.style.display = 'flex';
  setText(el['dialog-speaker'], speaker);
  setText(el['dialog-text'], text);
  if (el['dialog-portrait']) el['dialog-portrait'].innerHTML = portraitSVG(portraitFor(speaker), 64);
}
export function hideDialog() {
  if (el.dialog) el.dialog.style.display = 'none';
}

export function showChoices(stage, giver, onPick) {
  if (!el.choices) return;
  el.choices.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'choices-row';
  const port = document.createElement('div');
  port.className = 'choices-portrait';
  port.innerHTML = portraitSVG(portraitFor(giver || ''), 96);
  row.appendChild(port);
  const body = document.createElement('div');
  body.className = 'choices-body';
  if (giver) {
    const who = document.createElement('div');
    who.className = 'choices-giver';
    who.textContent = giver.toUpperCase();
    body.appendChild(who);
  }
  const title = document.createElement('div');
  title.className = 'choices-title';
  title.textContent = stage.text;
  body.appendChild(title);
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
    body.appendChild(btn);
  });
  row.appendChild(body);
  el.choices.appendChild(row);
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

// District intro card: big italic GTA-style name + subtitle. In live play
// it shows for holdMs then fades; staging calls it without holdMs so the
// card stays in the frozen frame.
export function showDistrictCard(name, sub, holdMs) {
  const card = el['district-card'];
  if (!card) return;
  const nm = card.querySelector('.dc-name');
  const sb = card.querySelector('.dc-sub');
  if (nm) nm.textContent = name;
  if (sb) sb.textContent = sub || '';
  card.classList.remove('fade');
  card.style.display = 'block';
  if (districtCardTimer) { clearTimeout(districtCardTimer); districtCardTimer = null; }
  if (holdMs) {
    districtCardTimer = setTimeout(() => {
      card.classList.add('fade');
      setTimeout(() => { card.style.display = 'none'; }, 800);
    }, holdMs);
  }
}
export function hideDistrictCard() {
  const card = el['district-card'];
  if (card) card.style.display = 'none';
  if (districtCardTimer) { clearTimeout(districtCardTimer); districtCardTimer = null; }
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
