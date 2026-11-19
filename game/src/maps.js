// maps.js — Paloma Bay: the minimap + the full pause-map.
// Both maps share drawWorldBase: water, ground, beach, roads, causeway,
// island, district tints, Rambla Park. The minimap is a round north-up
// view of the whole city with a rotating player arrow; the full map is
// the pause screen's bigger view with a coordinate grid, a GPS route,
// measured + clamped labels, and lettered POI blips. Both are canvas 2D
// — the only 2D drawing in the game besides the HUD. Text never leaves
// the map: full-map labels are measured (measureText) and clamped.

import {
  AVENUES, CITY, DISTRICTS, ISLAND, PARK, POI, POSTCARDS, STREETS, WATER_Z,
} from './citydata.js';

// --- shared world drawing ------------------------------------------------------
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
  // District tints (soft, so the map reads as neighbourhoods, not one slab).
  const DISTRICT_TINTS = {
    'Porto Lumen': 'rgba(90,140,180,0.16)',
    'Ciudad Vieja': 'rgba(200,170,90,0.16)',
    'North Docks': 'rgba(130,130,140,0.16)',
    'Palm Heights': 'rgba(90,180,120,0.16)',
    'Barrio Sol': 'rgba(220,140,60,0.16)',
    'La Rambla': 'rgba(220,90,140,0.16)',
    'Isla Verde': 'rgba(60,160,140,0.16)',
  };
  for (const d of DISTRICTS) {
    const [x0, x1, z0, z1] = d.region;
    ctx.fillStyle = DISTRICT_TINTS[d.name] || 'rgba(255,255,255,0.05)';
    ctx.fillRect(X(x0), Z(z0), (x1 - x0) * scale, (z1 - z0) * scale);
  }
  // Rambla Park green.
  ctx.fillStyle = '#2e6b2e';
  ctx.fillRect(X(PARK.x0), Z(PARK.z0), (PARK.x1 - PARK.x0) * scale, (PARK.z1 - PARK.z0) * scale);
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

export function drawMinimap(ctx, view) {
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
  // Traffic lights: a dot per intersection, coloured by the avenue (NS)
  // phase — red means the avenue is stopped.
  for (const l of view.lights || []) {
    const c = l.ns === 'green' ? '#7ddb52' : l.ns === 'yellow' ? '#f5c542' : '#ff2a2a';
    drawBlip(ctx, X, Z, l.x, l.z, c, 2, 'circle');
  }
  // Mission marker.
  if (view.mission && view.mission.active && view.mission.mx !== undefined) {
    drawBlip(ctx, X, Z, view.mission.mx, view.mission.mz, '#ffd23e', 5, 'diamond');
  }
  // Police units.
  for (const u of view.police.units) {
    drawBlip(ctx, X, Z, u.x, u.z, '#4a90ff', 3, 'circle');
  }
  // Police boats (marine units).
  for (const b of view.boats || []) {
    drawBlip(ctx, X, Z, b.x, b.z, '#4a90ff', 3, 'circle');
  }
  if (view.police.heli) {
    drawBlip(ctx, X, Z, view.police.heli.x, view.police.heli.z, '#4a90ff', 4, 'diamond');
  }
  // Hostiles: red dots with a white ring, so they read at a glance.
  for (const e of view.enemies || []) {
    drawBlip(ctx, X, Z, e.x, e.z, '#ffffff', 4.5, 'circle');
    drawBlip(ctx, X, Z, e.x, e.z, '#ff2a2a', 3.5, 'circle');
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
// Takes the canvas context — the caller (panels.js) owns the element.
export function drawFullMap(ctx, view) {
  if (!ctx) return;
  // Full world incl. Isla Verde: x -240..240 (480u), z -175..245 (420u).
  const w = 640, h = 560;
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w / 480, h / 420);
  const { X, Z } = drawWorldBase(ctx, w, h, scale, -240, -175);
  // Coordinate grid: faint lines + A–F columns / 1–6 rows on the edges.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (let i = 0; i < 6; i++) {
    const gx = -240 + i * 80 + 40;
    ctx.beginPath();
    ctx.moveTo(X(gx), 0);
    ctx.lineTo(X(gx), h);
    ctx.stroke();
    ctx.fillText(colLetters[i], X(gx) - 3, 12);
  }
  for (let i = 0; i < 6; i++) {
    const gz = -175 + i * 70 + 35;
    ctx.beginPath();
    ctx.moveTo(0, Z(gz));
    ctx.lineTo(w, Z(gz));
    ctx.stroke();
    ctx.fillText(String(i + 1), 4, Z(gz) + 3);
  }
  // GPS route: a dashed yellow line from the player to the mission
  // objective, routed along the street grid (Manhattan path).
  if (view.mission && view.mission.active && view.mission.mx !== undefined) {
    const px = X(view.player.x), pz = Z(view.player.z);
    const mx = X(view.mission.mx), mz = Z(view.mission.mz);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,210,62,0.35)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(mx, pz);
    ctx.lineTo(mx, mz);
    ctx.stroke();
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(mx, pz);
    ctx.lineTo(mx, mz);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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
  // Rambla Park label.
  {
    const tw = ctx.measureText('Rambla Park').width;
    const [lx, ly] = clampLabel(X((PARK.x0 + PARK.x1) / 2) - tw / 2, Z((PARK.z0 + PARK.z1) / 2) - 4, tw);
    ctx.strokeText('Rambla Park', lx, ly);
    ctx.fillText('Rambla Park', lx, ly);
  }
  const collected = new Set(view.profile.postcards);
  POSTCARDS.forEach(([x, z], i) => {
    if (!collected.has(i)) drawBlip(ctx, X, Z, x, z, '#f5c542', 3, 'circle');
  });
  // POI blips with letter icons (the legend explains each letter).
  const poiBlips = [
    [POI.garage, '#4da6ff', 'G'], [POI.gunshop, '#ff6b4a', 'A'],
    [POI.safehouse, '#7ddb52', 'H'], [POI.pawn, '#c07df0', 'P'],
    [POI.vireoHQ, '#a04ae0', 'V'], [POI.ferris, '#ff9ad5', 'W'],
    [POI.lighthouse, '#ffffff', 'L'], [POI.pier, '#c89a5a', 'D'],
  ];
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [poi, color, letter] of poiBlips) {
    drawBlip(ctx, X, Z, poi.x, poi.z, color, 7, 'circle');
    ctx.fillStyle = color === '#ffffff' ? '#111111' : '#ffffff';
    ctx.fillText(letter, X(poi.x), Z(poi.z) + 0.5);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Traffic lights: a dot per intersection, coloured by the avenue (NS) phase.
  for (const l of view.lights || []) {
    const c = l.ns === 'green' ? '#7ddb52' : l.ns === 'yellow' ? '#f5c542' : '#ff2a2a';
    drawBlip(ctx, X, Z, l.x, l.z, c, 3, 'circle');
  }
  if (view.mission && view.mission.active && view.mission.mx !== undefined) {
    drawBlip(ctx, X, Z, view.mission.mx, view.mission.mz, '#ffd23e', 8, 'diamond');
  }
  for (const u of view.police.units) {
    drawBlip(ctx, X, Z, u.x, u.z, '#4a90ff', 4, 'circle');
  }
  for (const b of view.boats || []) {
    drawBlip(ctx, X, Z, b.x, b.z, '#4a90ff', 4, 'circle');
  }
  // Hostiles: red dots with a white ring.
  for (const e of view.enemies || []) {
    drawBlip(ctx, X, Z, e.x, e.z, '#ffffff', 6, 'circle');
    drawBlip(ctx, X, Z, e.x, e.z, '#ff2a2a', 4.5, 'circle');
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
