import * as THREE from 'three';
import { rand } from './utils.js';

// ---------------------------------------------------------------------------
// CPU particle system rendered as a single Points draw call.
// ---------------------------------------------------------------------------
const PARTICLE_VS = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const PARTICLE_FS = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, uSoft);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

export class Particles {
  constructor(scene, max = 3000, { additive = true, soft = 1.6 } = {}) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    scene.add(this.points);
  }

  setScale(viewportHeight) {
    this.mat.uniforms.uScale.value = viewportHeight * 0.9;
  }

  spawn(o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    const c = o.color;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.size0[i] = o.size ?? 0.3;
    this.size1[i] = o.sizeEnd ?? this.size0[i];
    this.size[i] = this.size0[i];
    this.alpha0[i] = o.alpha ?? 1;
    this.alpha[i] = this.alpha0[i];
    this.life[i] = this.life0[i] = o.life ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this._kill(i);
        continue;
      }
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.life0[i];
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      // fade in quickly, fade out smoothly
      this.alpha[i] = this.alpha0[i] * Math.min(1, t * 8) * (1 - t * t);
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }

  _kill(i) {
    const j = --this.count;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k];
      this.vel[i3 + k] = this.vel[j3 + k];
      this.col[i3 + k] = this.col[j3 + k];
    }
    this.size[i] = this.size[j]; this.size0[i] = this.size0[j]; this.size1[i] = this.size1[j];
    this.alpha[i] = this.alpha[j]; this.alpha0[i] = this.alpha0[j];
    this.life[i] = this.life[j]; this.life0[i] = this.life0[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
  }

  clear() {
    this.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Camera-facing ribbon used for limb trails and lightning bolts.
// ---------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

export class Ribbon {
  constructor(scene, maxPoints, color, { opacity = 1 } = {}) {
    this.max = maxPoints;
    this.points = [];
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxPoints * 2 * 3);
    this.alphas = new Float32Array(maxPoints * 2);
    const idx = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uOpacity: { value: opacity } },
      vertexShader: `attribute float aAlpha; varying float vA; void main(){ vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor=vec4(uColor, vA*uOpacity);} `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
  }

  /** Build geometry from an array of {p:Vector3, w:number, a:number}. */
  build(pts, camera) {
    const n = Math.min(pts.length, this.max);
    const camPos = camera.position;
    for (let i = 0; i < n; i++) {
      const p = pts[i].p;
      const prev = pts[Math.max(0, i - 1)].p;
      const next = pts[Math.min(n - 1, i + 1)].p;
      _a.subVectors(next, prev);
      if (_a.lengthSq() < 1e-8) _a.set(0, 1, 0);
      _b.subVectors(camPos, p);
      _c.crossVectors(_a, _b).normalize().multiplyScalar(pts[i].w * 0.5);
      const i6 = i * 6;
      this.positions[i6] = p.x + _c.x; this.positions[i6 + 1] = p.y + _c.y; this.positions[i6 + 2] = p.z + _c.z;
      this.positions[i6 + 3] = p.x - _c.x; this.positions[i6 + 4] = p.y - _c.y; this.positions[i6 + 5] = p.z - _c.z;
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = pts[i].a;
    }
    this.mesh.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.aPos.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  hide() {
    this.mesh.geometry.setDrawRange(0, 0);
  }
  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Swing trail following a bone. */
export class Trail {
  constructor(scene, color, width = 0.35, life = 0.16) {
    this.ribbon = new Ribbon(scene, 24, color, { opacity: 0.9 });
    this.hist = [];
    this.width = width;
    this.life = life;
    this.active = false;
  }
  setColor(c) {
    this.ribbon.mat.uniforms.uColor.value.copy(c);
  }
  update(dt, worldPos, camera) {
    for (const h of this.hist) h.t += dt;
    if (this.active) this.hist.unshift({ p: worldPos.clone(), t: 0 });
    while (this.hist.length && (this.hist[this.hist.length - 1].t > this.life || this.hist.length > 24)) this.hist.pop();
    if (this.hist.length < 2) {
      this.ribbon.hide();
      return;
    }
    const pts = this.hist.map((h, i) => {
      const k = 1 - h.t / this.life;
      return { p: h.p, w: this.width * k * (1 - i / this.hist.length), a: k * 0.85 };
    });
    this.ribbon.build(pts, camera);
  }
}

/** Jagged lightning bolt between two points; call update each frame to flicker. */
export class Bolt {
  constructor(scene, color, segments = 14) {
    this.seg = segments;
    this.ribbon = new Ribbon(scene, segments + 1, color);
    this.glow = new Ribbon(scene, segments + 1, color.clone().multiplyScalar(0.5));
    this.pts = Array.from({ length: segments + 1 }, () => ({ p: new THREE.Vector3(), w: 0.08, a: 1 }));
    this.gpts = Array.from({ length: segments + 1 }, () => ({ p: new THREE.Vector3(), w: 0.5, a: 0.6 }));
  }
  update(a, b, jitter, width, camera, alpha = 1) {
    _d.subVectors(b, a);
    const len = _d.length();
    for (let i = 0; i <= this.seg; i++) {
      const t = i / this.seg;
      const p = this.pts[i].p.copy(a).addScaledVector(_d, t);
      if (i > 0 && i < this.seg) {
        const j = jitter * len * Math.sin(t * Math.PI);
        p.x += rand(-j, j); p.y += rand(-j, j); p.z += rand(-j, j);
      }
      this.pts[i].w = width * (1 - t * 0.5);
      this.pts[i].a = alpha;
      this.gpts[i].p.copy(p);
      this.gpts[i].w = width * 3.5;
      this.gpts[i].a = alpha * 0.28;
    }
    this.ribbon.build(this.pts, camera);
    this.glow.build(this.gpts, camera);
  }
  hide() {
    this.ribbon.hide();
    this.glow.hide();
  }
  dispose() {
    this.ribbon.dispose();
    this.glow.dispose();
  }
}

// ---------------------------------------------------------------------------
// Energy shell shader (chakra spheres, fireballs, auras).
// ---------------------------------------------------------------------------
export function energyMaterial(colA, colB, { intensity = 2.5, swirl = 6, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) },
      uIntensity: { value: intensity },
      uSwirl: { value: swirl },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uIntensity, uSwirl, uOpacity;
      uniform vec3 uColA, uColB;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float n3(vec3 p){
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main(){
        vec3 p = normalize(vP);
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float ang = atan(p.z, p.x) + uTime * uSwirl + p.y * 5.0;
        float n = n3(p * 4.0 + vec3(0.0, uTime * 2.5, 0.0));
        float s = sin(ang * 3.0 + n * 6.0) * 0.5 + 0.5;
        vec3 col = mix(uColA, uColB, clamp(s * 0.7 + fres, 0.0, 1.0));
        float a = clamp(0.35 + fres * 1.2 + s * 0.25, 0.0, 1.0) * uOpacity;
        gl_FragColor = vec4(col * uIntensity * (0.35 + fres * 1.1 + s * 0.35), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Expanding shockwave ring on the ground / in the air. */
export class Shockwaves {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.RingGeometry(0.94, 1, 64);
  }
  spawn(pos, color, { size = 4, life = 0.4, flat = true, normal = null } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(pos);
    if (normal) m.lookAt(pos.clone().add(normal));
    else if (flat) m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.list.push({ m, t: 0, life, size });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        this.scene.remove(s.m);
        s.m.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      s.m.scale.setScalar(0.1 + s.size * (1 - Math.pow(1 - k, 3)));
      s.m.material.opacity = 1 - k;
    }
  }
}

// ---------------------------------------------------------------------------
// Pool of point lights so the shader light count never changes (no recompiles).
// ---------------------------------------------------------------------------
export class LightPool {
  constructor(scene, n = 4) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.userData.free = true;
      scene.add(l);
      this.lights.push(l);
    }
    this.flashes = [];
  }
  acquire() {
    const l = this.lights.find((x) => x.userData.free);
    if (!l) return null;
    l.userData.free = false;
    return l;
  }
  release(l) {
    if (!l) return;
    l.intensity = 0;
    l.userData.free = true;
  }
  flash(pos, color, intensity = 40, dist = 12, life = 0.25) {
    const l = this.acquire();
    if (!l) return;
    l.position.copy(pos);
    l.color.copy(color);
    l.distance = dist;
    l.intensity = intensity;
    this.flashes.push({ l, t: 0, life, intensity });
  }
  update(dt) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        this.release(f.l);
        this.flashes.splice(i, 1);
      } else f.l.intensity = f.intensity * (1 - k);
    }
  }
}

// ---------------------------------------------------------------------------
// High-level effect presets built on the primitives above.
// ---------------------------------------------------------------------------
const tmpC = new THREE.Color();
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new Particles(scene, 5000, { additive: true, soft: 1.8 });
    this.smoke = new Particles(scene, 1500, { additive: false, soft: 2.4 });
    this.waves = new Shockwaves(scene);
    this.lights = new LightPool(scene, 5);
    this.debris = [];
    this.debrisGeo = new THREE.DodecahedronGeometry(0.12, 0);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x6d655c, roughness: 0.9 });
  }

  resize(h) {
    this.glow.setScale(h);
    this.smoke.setScale(h);
  }

  hitSpark(pos, color, power = 1) {
    const n = Math.floor(18 * power);
    for (let i = 0; i < n; i++) {
      const s = rand(4, 14) * power;
      const th = rand(0, Math.PI * 2), ph = rand(-1, 1);
      const r = Math.sqrt(1 - ph * ph);
      tmpC.copy(color).multiplyScalar(rand(2, 5));
      this.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(th) * r * s, vy: ph * s + 2, vz: Math.sin(th) * r * s,
        color: tmpC, size: rand(0.06, 0.16) * (1 + power * 0.3), sizeEnd: 0.01,
        life: rand(0.15, 0.4), drag: 4, gravity: 6,
      });
    }
    // bright core flash
    tmpC.setRGB(3, 3, 3);
    this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, color: tmpC, size: 0.45 * power, sizeEnd: 1.0 * power, life: 0.1 });
    tmpC.copy(color).multiplyScalar(1.6);
    this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, color: tmpC, size: 0.9 * power, sizeEnd: 1.8 * power, life: 0.16, alpha: 0.5 });
    this.waves.spawn(pos, tmpC.copy(color).multiplyScalar(0.9), { size: 0.5 + power * 0.6, life: 0.18, flat: false, normal: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)) });
    this.lights.flash(pos, color, 12 * power, 6, 0.12);
  }

  blockSpark(pos) {
    for (let i = 0; i < 14; i++) {
      tmpC.setRGB(3, 3.4, 4);
      this.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: rand(-6, 6), vy: rand(-2, 6), vz: rand(-6, 6),
        color: tmpC, size: 0.07, sizeEnd: 0.0, life: rand(0.1, 0.3), drag: 3, gravity: 10,
      });
    }
    this.waves.spawn(pos, new THREE.Color(1.5, 2, 3), { size: 1.4, life: 0.18, flat: false, normal: new THREE.Vector3(0, 0, 1) });
  }

  smokePuff(pos, n = 30, size = 1, color = 0xdedede) {
    const base = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const th = rand(0, Math.PI * 2);
      const s = rand(1, 4) * size;
      tmpC.copy(base).multiplyScalar(rand(0.7, 1.05));
      this.smoke.spawn({
        x: pos.x + rand(-0.3, 0.3), y: pos.y + rand(0, 1.6) * size, z: pos.z + rand(-0.3, 0.3),
        vx: Math.cos(th) * s, vy: rand(0.5, 2.5), vz: Math.sin(th) * s,
        color: tmpC, size: rand(0.8, 1.4) * size, sizeEnd: rand(2, 3) * size,
        life: rand(0.5, 1.0), drag: 3, alpha: 0.75,
      });
    }
  }

  dust(pos, n = 10, size = 1) {
    for (let i = 0; i < n; i++) {
      const th = rand(0, Math.PI * 2);
      tmpC.setRGB(0.55, 0.5, 0.45);
      this.smoke.spawn({
        x: pos.x, y: pos.y + 0.1, z: pos.z,
        vx: Math.cos(th) * rand(1, 4) * size, vy: rand(0.2, 1.5), vz: Math.sin(th) * rand(1, 4) * size,
        color: tmpC, size: 0.5 * size, sizeEnd: 1.6 * size, life: rand(0.4, 0.8), drag: 3, alpha: 0.45,
      });
    }
  }

  burst(pos, color, n = 40, speed = 8, size = 0.2, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const th = rand(0, Math.PI * 2), ph = rand(-1, 1);
      const r = Math.sqrt(1 - ph * ph);
      const s = rand(0.3, 1) * speed;
      tmpC.copy(color).multiplyScalar(rand(1, 2.4));
      this.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(th) * r * s, vy: ph * s, vz: Math.sin(th) * r * s,
        color: tmpC, size: size * rand(0.6, 1.4), sizeEnd: 0, life: rand(0.5, 1) * life, drag: 2,
      });
    }
  }

  explosion(pos, color, scale = 1) {
    this.burst(pos, color, 80 * scale, 14 * scale, 0.35 * scale, 0.9);
    for (let i = 0; i < 25 * scale; i++) {
      tmpC.copy(color).multiplyScalar(rand(0.7, 1.4));
      const th = rand(0, Math.PI * 2);
      this.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(th) * rand(1, 5) * scale, vy: rand(0, 5) * scale, vz: Math.sin(th) * rand(1, 5) * scale,
        color: tmpC, size: rand(0.8, 1.6) * scale, sizeEnd: rand(2, 3.2) * scale, life: rand(0.3, 0.6), drag: 3, alpha: 0.45,
      });
    }
    this.smokePuff(pos, Math.floor(30 * scale), 1.3 * scale, 0x3a3532);
    this.waves.spawn(new THREE.Vector3(pos.x, 0.05, pos.z), tmpC.copy(color).multiplyScalar(2.5), { size: 7 * scale, life: 0.5 });
    this.waves.spawn(pos, tmpC.copy(color).multiplyScalar(2), { size: 5 * scale, life: 0.35, flat: false, normal: new THREE.Vector3(0, 0.3, 1) });
    this.lights.flash(pos, color, 50 * scale, 20 * scale, 0.45);
  }

  rocks(pos, n = 12, power = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat);
      m.castShadow = true;
      m.position.copy(pos);
      const s = rand(0.6, 2.2);
      m.scale.setScalar(s);
      this.scene.add(m);
      this.debris.push({
        m,
        v: new THREE.Vector3(rand(-1, 1) * power, rand(0.5, 1.5) * power, rand(-1, 1) * power),
        av: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
        t: 0,
        life: rand(1.2, 2),
      });
    }
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.waves.update(dt);
    this.lights.update(dt);
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.v.y -= 25 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < 0.08) {
        d.m.position.y = 0.08;
        d.v.y *= -0.3;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
        d.av.multiplyScalar(0.6);
      }
      d.m.rotation.x += d.av.x * dt;
      d.m.rotation.y += d.av.y * dt;
      d.m.rotation.z += d.av.z * dt;
      if (d.t > d.life) {
        const k = (d.t - d.life) / 0.4;
        d.m.scale.multiplyScalar(0.9);
        if (k >= 1) {
          this.scene.remove(d.m);
          this.debris.splice(i, 1);
        }
      }
    }
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    for (const d of this.debris) this.scene.remove(d.m);
    this.debris.length = 0;
  }
}
