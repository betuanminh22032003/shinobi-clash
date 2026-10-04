import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dampAngle(a, b, lambda, dt) {
  return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
}

// ---------- noise ----------
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash2(x, y) {
  return hash3(x, y, 7);
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm3(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * (noise3(x * f, y * f, z * f) * 2 - 1);
    a *= 0.5;
    f *= 2;
  }
  return s;
}
// tileable 2D noise with integer period
export function noise2t(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const m = (n) => ((n % p) + p) % p;
  const a = hash2(m(xi), m(yi)), b = hash2(m(xi + 1), m(yi));
  const c = hash2(m(xi), m(yi + 1)), d = hash2(m(xi + 1), m(yi + 1));
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm2t(x, y, p, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * (noise2t(x * f, y * f, p * f) * 2 - 1);
    a *= 0.5;
    f *= 2;
  }
  return s;
}

// ---------- procedural textures ----------
function heightToNormal(height, size, strength) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

function toTexture(data, size, srgb, repeat = 1) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Stone slab floor: color, normal, roughness. */
export function makeStoneFloorTextures(size = 512) {
  const height = new Float32Array(size * size);
  const color = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const tiles = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const row = Math.floor(v * tiles);
      const off = row % 2 ? 0.5 : 0;
      const tu = u * tiles + off;
      const tv = v * tiles;
      const tx = Math.floor(tu), ty = Math.floor(tv);
      const fx = tu - tx, fy = tv - ty;
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      const wob = fbm2t(u * 16, v * 16, 16, 3) * 0.015;
      const groove = smoothstep(clamp((edge + wob) / 0.03, 0, 1));
      const n = fbm2t(u * 8, v * 8, 8, 5);
      const fine = fbm2t(u * 64, v * 64, 64, 2);
      const crack = Math.abs(fbm2t(u * 6 + 3.1, v * 6 + 1.7, 6, 4));
      const crackMask = crack < 0.03 ? (1 - crack / 0.03) * 0.6 : 0;
      const h = groove * (0.6 + n * 0.25 + fine * 0.05) - crackMask * 0.3;
      height[y * size + x] = h;
      const tileId = hash2(((tx % tiles) + tiles) % tiles, ty);
      const base = 0.42 + tileId * 0.16 + n * 0.12 + fine * 0.04;
      const moss = clamp(fbm2t(u * 5 + 9, v * 5 + 4, 5, 4) * 1.6 - 0.25, 0, 1) * 0.5;
      let r = base * 0.95, g = base * 0.9, b = base * 0.82;
      r = lerp(r, 0.25, moss); g = lerp(g, 0.33, moss); b = lerp(b, 0.18, moss);
      const dark = lerp(0.35, 1, groove) * (1 - crackMask * 0.6);
      const i = (y * size + x) * 4;
      color[i] = clamp(r * dark, 0, 1) * 255;
      color[i + 1] = clamp(g * dark, 0, 1) * 255;
      color[i + 2] = clamp(b * dark, 0, 1) * 255;
      color[i + 3] = 255;
      const ro = clamp(0.75 + n * 0.2 - (1 - groove) * 0.1 + moss * 0.15, 0.3, 1);
      rough[i] = rough[i + 1] = rough[i + 2] = ro * 255;
      rough[i + 3] = 255;
    }
  }
  const normal = heightToNormal(height, size, 6);
  return {
    map: toTexture(color, size, true),
    normalMap: toTexture(normal, size, false),
    roughnessMap: toTexture(rough, size, false),
  };
}

/** Generic rocky surface normal + roughness, tileable. */
export function makeRockTextures(size = 256) {
  const height = new Float32Array(size * size);
  const rough = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = fbm2t(u * 6, v * 6, 6, 6);
      const ridge = 1 - Math.abs(fbm2t(u * 3 + 5, v * 3 + 2, 3, 4)) * 2;
      height[y * size + x] = n * 0.6 + ridge * 0.4;
      const i = (y * size + x) * 4;
      const r = clamp(0.8 + n * 0.3, 0, 1) * 255;
      rough[i] = rough[i + 1] = rough[i + 2] = r;
      rough[i + 3] = 255;
    }
  }
  return {
    normalMap: toTexture(heightToNormal(height, size, 4), size, false),
    roughnessMap: toTexture(rough, size, false),
  };
}

/** Woven cloth normal map. */
export function makeClothNormal(size = 128) {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2 * 16, v = (y / size) * Math.PI * 2 * 16;
      const warp = Math.sin(u) * 0.5 + 0.5;
      const weft = Math.sin(v) * 0.5 + 0.5;
      const checker = (Math.floor(x / (size / 16)) + Math.floor(y / (size / 16))) % 2;
      height[y * size + x] = (checker ? warp : weft) * 0.8 + fbm2t(x / 16, y / 16, size / 16, 2) * 0.2;
    }
  }
  return toTexture(heightToNormal(height, size, 1.5), size, false, 6);
}

/** Tileable water normal map for Water.js */
export function makeWaterNormals(size = 256) {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      height[y * size + x] = fbm2t(u * 8, v * 8, 8, 5) + fbm2t(u * 24 + 3, v * 24 + 8, 24, 2) * 0.25;
    }
  }
  return toTexture(heightToNormal(height, size, 10), size, false);
}

/** Soft radial sprite used for particles / glows. */
export function makeGlowTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}
