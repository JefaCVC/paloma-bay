// render.js — WebGL setup and draw helpers for PALOMA BAY.
// Owns the GL context, the three programs, mesh upload/update, and the
// per-frame draw calls. Everything else hands it meshes + transforms.

import { TAU } from './math.js';
import { sky } from './sky.js';
import { BLOB_FS, BLOB_VS, LIT_FS, LIT_VS, SKY_FS, SKY_VS, makeProgram } from './shaders.js';

export let gl = null;
export let canvas = null;
let litProg = null;
let skyProg = null;
let blobProg = null;
let skyVbo = null;

// Current camera position, read by the lit shader for view-dependent terms.
export const camPos = [0, 0, 0];

export function initGL(canvasEl, onError) {
  canvas = canvasEl;
  gl =
    canvas.getContext('webgl2', { antialias: true, alpha: false }) ||
    canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    if (onError) onError('WebGL is unavailable in this browser.');
    return false;
  }
  litProg = makeProgram(gl, LIT_VS, LIT_FS, onError);
  skyProg = makeProgram(gl, SKY_VS, SKY_FS, onError);
  blobProg = makeProgram(gl, BLOB_VS, BLOB_FS, onError);
  if (!litProg || !skyProg || !blobProg) return false;
  skyVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return true;
}

// --- mesh upload ------------------------------------------------------------
export function uploadMesh(built, dynamic) {
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, built.data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, built.indices, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  return { vbo, ibo, count: built.count, verts: built.verts };
}

export function updateMesh(mesh, built) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, built.data, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, built.indices, gl.DYNAMIC_DRAW);
  mesh.count = built.count;
  mesh.verts = built.verts;
}

// --- lit draws ---------------------------------------------------------------
const LIT_STRIDE = 14 * 4;
function bindLit(mesh) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
  const A = litProg.attrib;
  const set = (name, size, off) => {
    const loc = A[name];
    if (loc === undefined || loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, LIT_STRIDE, off * 4);
  };
  set('aPos', 3, 0);
  set('aNormal', 3, 3);
  set('aColor', 3, 6);
  set('aUV', 2, 9);
  set('aMat', 1, 11);
  set('aSeed', 1, 12);
  set('aSway', 1, 13);
}

function litUniforms(model, mvp, time, alpha) {
  const U = litProg.uniform;
  gl.uniformMatrix4fv(U.uMVP, false, mvp);
  gl.uniformMatrix4fv(U.uModel, false, model);
  gl.uniform1f(U.uTime, time);
  gl.uniform1f(U.uAlpha, alpha);
  gl.uniform3fv(U.uCamPos, camPos);
  gl.uniform3fv(U.uSunDir, sky.sunDir);
  gl.uniform3fv(U.uSunColor, sky.sunColor);
  gl.uniform1f(U.uSunIntensity, sky.sunIntensity);
  gl.uniform3fv(U.uZenith, sky.zenith);
  gl.uniform3fv(U.uHorizon, sky.horizon);
  gl.uniform3fv(U.uFogColor, sky.fogColor);
  gl.uniform2f(U.uFogRange, sky.fogNear, sky.fogFar);
  gl.uniform3fv(U.uAmbSky, sky.ambSky);
  gl.uniform3fv(U.uAmbGround, sky.ambGround);
  gl.uniform1f(U.uAmbStrength, sky.ambStrength);
  gl.uniform2f(U.uResolution, canvas.width, canvas.height);
  gl.uniform1f(U.uWet, sky.wet);
  gl.uniform1f(U.uWindowLit, sky.windowLit);
}

// Draw a lit mesh. blend=true draws it transparent (glass, rain, cones).
export function drawLit(mesh, model, mvp, time, alpha, blend) {
  if (!mesh || mesh.count === 0) return;
  gl.useProgram(litProg);
  bindLit(mesh);
  if (blend) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
  }
  litUniforms(model, mvp, time, alpha === undefined ? 1 : alpha);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  if (blend) {
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}

// --- sky ---------------------------------------------------------------------
export function drawSky(invVP) {
  gl.useProgram(skyProg);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
  const loc = skyProg.attrib.aPos;
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = skyProg.uniform;
  gl.uniformMatrix4fv(U.uInvVP, false, invVP);
  gl.uniform3fv(U.uCamPos, camPos);
  gl.uniform3fv(U.uZenith, sky.zenith);
  gl.uniform3fv(U.uHorizon, sky.horizon);
  gl.uniform3fv(U.uSunDir, sky.sunDir);
  gl.uniform3fv(U.uSunColor, sky.sunColor);
  gl.uniform2f(U.uResolution, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
}

// --- blob shadows ------------------------------------------------------------
// Geometry: { pos: [x,y,z...], edge: [0..1...], idx: [...] } — a fan whose
// alpha fades toward the rim. Used for contact shadows AND the heli spotlight.
export function discBlob(rx, rz, sides) {
  const pos = [0, 0, 0], edge = [0], idx = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    pos.push(Math.cos(a) * rx, 0, Math.sin(a) * rz);
    edge.push(1);
  }
  for (let i = 0; i < sides; i++) idx.push(0, 1 + i, 1 + ((i + 1) % sides));
  return { pos, edge, idx };
}

export function starBlob(r, points) {
  const pos = [0, 0, 0], edge = [0], idx = [];
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    edge.push(i % 2 === 0 ? 1 : 0.45);
  }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  return { pos, edge, idx };
}

export function mergeBlobs(geoms) {
  const pos = [], edge = [], idx = [];
  let base = 0;
  for (const g of geoms) {
    pos.push(...g.pos);
    edge.push(...g.edge);
    for (const i of g.idx) idx.push(i + base);
    base += g.pos.length / 3;
  }
  return { pos, edge, idx };
}

export function offsetBlob(g, dx, dy, dz) {
  const pos = g.pos.slice();
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += dx;
    pos[i + 1] += dy;
    pos[i + 2] += dz;
  }
  return { pos, edge: g.edge.slice(), idx: g.idx.slice() };
}

export function uploadBlob(built) {
  const vbo = gl.createBuffer();
  const data = new Float32Array((built.pos.length / 3) * 4);
  for (let i = 0; i < built.pos.length / 3; i++) {
    data[i * 4] = built.pos[i * 3];
    data[i * 4 + 1] = built.pos[i * 3 + 1];
    data[i * 4 + 2] = built.pos[i * 3 + 2];
    data[i * 4 + 3] = built.edge[i];
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(built.idx), gl.STATIC_DRAW);
  return { vbo, ibo, count: built.idx.length };
}

export function drawBlob(mesh, mvp, color) {
  if (!mesh || mesh.count === 0) return;
  gl.useProgram(blobProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
  const A = blobProg.attrib;
  gl.enableVertexAttribArray(A.aPos);
  gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(A.aEdge);
  gl.vertexAttribPointer(A.aEdge, 1, gl.FLOAT, false, 16, 12);
  gl.uniformMatrix4fv(blobProg.uniform.uMVP, false, mvp);
  gl.uniform4fv(blobProg.uniform.uColor, color);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

// --- frame helpers ------------------------------------------------------------
export function beginFrame() {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
}

export function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
