// shaders.js — GLSL for PALOMA BAY (GLSL ES 1.00: runs on WebGL1 and WebGL2).
// Three programs, all fed by the ONE shared sky model (sky.js):
//   lit  — everything solid; material branches chosen per vertex.
//   sky  — fullscreen-triangle gradient + sun disc + halo.
//   blob — soft contact shadows (own tiny vertex layout).
// The lit shader also carries rain: uWet darkens wettable ground (seed >= 900)
// and adds a sky reflection, and uWindowLit sets the fraction of lit windows.

export const LIT_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec2 aUV;
attribute float aMat;
attribute float aSeed;
attribute float aSway;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUV;
varying float vMat;
varying float vSeed;
varying vec3 vWorld;
void main() {
  vec3 p = aPos;
  if (aSway > 0.001) {
    float w = aSway * aSway; // frond tips move most
    p.x += sin(uTime * 1.4 + aSeed * 6.2831) * 0.30 * w;
    p.z += cos(uTime * 1.1 + aSeed * 4.0) * 0.22 * w;
    p.y -= sin(uTime * 1.4 + aSeed * 6.2831) * 0.08 * w;
  }
  vec4 world = uModel * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor; vUV = aUV; vMat = aMat; vSeed = aSeed;
  gl_Position = uMVP * vec4(p, 1.0);
}
`;

export const LIT_FS = `
precision highp float;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUV;
varying float vMat;
varying float vSeed;
varying vec3 vWorld;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform float uAmbStrength;
uniform vec2 uResolution;
uniform float uAlpha;
uniform float uWet;
uniform float uWindowLit;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorld);
  vec3 L = normalize(uSunDir);
  float ndl = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5) * uAmbStrength;
  vec3 skyRef = mix(uHorizon, uZenith, clamp(V.y * 0.5 + 0.35, 0.0, 1.0));
  vec3 base = vColor;
  vec3 col;

  if (vMat < 0.5) {
    // PLAIN — diffuse + optional wet-road sheen (seed >= 900 marks roads).
    col = base * (amb + uSunColor * uSunIntensity * ndl);
    float wettable = step(900.0, vSeed);
    if (wettable > 0.5 && uWet > 0.001) {
      col *= (1.0 - 0.35 * uWet);
      col += skyRef * (0.25 + 0.55 * fres) * uWet;
      col += uSunColor * pow(ndh, 60.0) * 1.5 * uWet;
    }
  } else if (vMat < 1.5) {
    // FACADE — procedural windows from UV + seed. Seed encodes style*100 + hash.
    // Varying interpolation jitters the seed ~1e-5; rounding first kills speckle.
    float seedI = floor(vSeed + 0.5);
    float style = floor(seedI / 100.0);
    float hseed = seedI - style * 100.0;
    // Three window patterns, picked per building from the seed: standard
    // grid, wide windows, staggered rows — no two neighbours read alike.
    float pattern = mod(hseed, 3.0);
    vec2 wuv = vUV;
    if (pattern > 0.5 && pattern < 1.5) wuv = vec2(vUV.x * 0.62, vUV.y);
    float fl = floor(wuv.y);
    float co = floor(wuv.x);
    vec2 cell = fract(wuv);
    if (pattern > 1.5) cell.x = fract(wuv.x + mod(fl, 2.0) * 0.5);
    float lit = step(1.0 - uWindowLit, hash21(vec2(co * 1.7 + hseed, fl * 2.3 + hseed)));
    float winX = step(0.16, cell.x) * step(cell.x, 0.84);
    float winY = step(0.24, cell.y) * step(cell.y, 0.86);
    float win = winX * winY;
    vec3 litWall = base * (amb + uSunColor * uSunIntensity * ndl);
    vec3 glassCol = mix(vec3(0.10, 0.14, 0.20), skyRef, 0.25 + 0.55 * fres);
    vec3 litCol = vec3(1.0, 0.72, 0.38) * 1.6;
    vec3 winCol = mix(glassCol, litCol, lit);
    if (style > 1.5 && fl < 0.5) {
      // Shop style: big lit glass band on the ground floor.
      float band = step(0.10, cell.y) * step(cell.y, 0.86);
      float mull = step(0.44, fract(vUV.x * 2.0)) * step(fract(vUV.x * 2.0), 0.56);
      win = max(win, band * (1.0 - mull));
      winCol = mix(vec3(1.0, 0.78, 0.45) * 1.3, glassCol, 0.25);
    }
    col = mix(litWall, winCol, win);
    float contact = smoothstep(0.0, 0.7, vUV.y); // contact shadow at wall base
    col *= mix(0.5, 1.0, contact);
  } else if (vMat < 2.5) {
    // GLASS — sky reflection + fresnel (car glass, water, puddles).
    vec3 refl = mix(uHorizon, uZenith, clamp(0.35 + V.y * 0.5, 0.0, 1.0));
    col = mix(base * 0.15, refl, 0.10 + 0.45 * fres) + uSunColor * pow(ndh, 90.0) * 1.2;
  } else if (vMat < 3.5) {
    // PAINT — clearcoat: sharp specular + fresnel rim.
    col = base * (amb + uSunColor * uSunIntensity * ndl)
        + uSunColor * 1.4 * pow(ndh, 90.0)
        + skyRef * fres * 0.35;
  } else if (vMat < 4.5) {
    // FOLIAGE — wrap lighting + backlight translucency.
    float wrap = clamp((dot(N, L) + 0.6) / 1.6, 0.0, 1.0);
    float back = clamp(dot(-N, L), 0.0, 1.0) * 0.5;
    col = base * (amb + uSunColor * uSunIntensity * wrap) + base * uSunColor * back * 0.6;
  } else if (vMat < 5.5) {
    col = base * 1.8; // EMIT — unlit (signs, lamps, beacons, flashes)
  } else {
    // METAL — low diffuse, broad spec, sky tint.
    col = base * (amb * 0.4 + uSunColor * uSunIntensity * ndl * 0.4)
        + mix(skyRef, uSunColor, 0.3) * pow(ndh, 40.0) * 1.5
        + skyRef * fres * 0.5;
  }

  float dist = length(uCamPos - vWorld);
  float fog = smoothstep(uFogRange.x, uFogRange.y, dist);
  col = mix(col, uFogColor, fog);
  col = aces(col);
  vec2 q = gl_FragCoord.xy / uResolution;
  col *= 1.0 - 0.32 * pow(length(q - 0.5) * 1.35, 2.2); // vignette
  gl_FragColor = vec4(col, uAlpha);
}
`;

export const SKY_VS = `
attribute vec2 aPos;
varying vec2 vClip;
void main() { vClip = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const SKY_FS = `
precision highp float;
varying vec2 vClip;
uniform mat4 uInvVP;
uniform vec3 uCamPos;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec2 uResolution;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec4 far4 = uInvVP * vec4(vClip, 1.0, 1.0);
  vec3 farPt = far4.xyz / far4.w;
  vec3 dir = normalize(farPt - uCamPos);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  float s = max(dot(dir, normalize(uSunDir)), 0.0);
  // Sun disc: a CRISP big disc (smoothstep edge, ~5-6 deg radius) in a
  // white-hot colour, so it reads as a sun against the orange halo
  // instead of melting into it (a pow-only disc ACES-compresses into the
  // halo and vanishes). The soft pow rim + dimmed halo/glow keep the
  // sunset glow without swallowing the disc.
  float disc = smoothstep(0.9945, 0.9965, s);
  col += mix(uSunColor, vec3(1.0, 0.98, 0.92), 0.55) * disc * 4.0;
  col += uSunColor * pow(s, 150.0) * 1.2;  // soft rim around the disc
  col += uSunColor * pow(s, 24.0) * 0.30;  // halo (dimmed so the disc pops)
  col += uSunColor * pow(s, 5.0) * 0.12;   // wide glow (dimmed)
  col = mix(vec3(0.55, 0.42, 0.34), col, smoothstep(-0.08, 0.02, dir.y));
  col = aces(col);
  vec2 q = gl_FragCoord.xy / uResolution;
  col *= 1.0 - 0.32 * pow(length(q - 0.5) * 1.35, 2.2);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const BLOB_VS = `
attribute vec3 aPos;
attribute float aEdge;
uniform mat4 uMVP;
varying float vEdge;
void main() { vEdge = aEdge; gl_Position = uMVP * vec4(aPos, 1.0); }
`;

export const BLOB_FS = `
precision highp float;
varying float vEdge;
uniform vec4 uColor;
void main() {
  float a = uColor.a * (1.0 - smoothstep(0.45, 1.0, vEdge));
  gl_FragColor = vec4(uColor.rgb, a);
}
`;

// --- program helpers --------------------------------------------------------
export function compileShader(gl, type, src, onError) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const msg = 'Shader compile: ' + gl.getShaderInfoLog(s);
    if (onError) onError(msg);
    return null;
  }
  return s;
}

export function makeProgram(gl, vsSrc, fsSrc, onError) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, onError);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, onError);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    if (onError) onError('Program link: ' + gl.getProgramInfoLog(p));
    return null;
  }
  p.attrib = {};
  p.uniform = {};
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) {
    const a = gl.getActiveAttrib(p, i);
    p.attrib[a.name] = gl.getAttribLocation(p, a.name);
  }
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) {
    const u = gl.getActiveUniform(p, i);
    p.uniform[u.name] = gl.getUniformLocation(p, u.name);
  }
  return p;
}
