import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeStoneFloorTextures, makeRockTextures, makeWaterNormals, fbm3, rand, hash2 } from './utils.js';

export const ARENA_RADIUS = 17;

/** Flattens a static hierarchy into one mesh per material (fewer draw calls). */
function bakeGroup(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  out.position.copy(group.position);
  out.quaternion.copy(group.quaternion);
  out.scale.copy(group.scale);
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

/**
 * "Thung Lũng Hoàng Hôn" — a stone dueling platform floating on a lake,
 * surrounded by cliffs, a waterfall and blossoming trees at golden hour.
 */
export class Arena {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.sunDir = new THREE.Vector3();
    this.buildSky();
    this.buildLights();
    this.rockTex = makeRockTextures(256);
    this.buildPlatform();
    this.buildWater();
    this.buildCliffs();
    this.buildWaterfall();
    this.buildTrees();
    this.buildLanterns();
    this.buildTorii();
    this.buildPetals();
  }

  buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    const elevation = 7, azimuth = 200;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);
    this.sky = sky;

    // Image based lighting from the sky
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const skyClone = new Sky();
    skyClone.scale.setScalar(4000);
    Object.assign(skyClone.material.uniforms.turbidity, { value: 7 });
    skyClone.material.uniforms.rayleigh.value = 2.2;
    skyClone.material.uniforms.mieCoefficient.value = 0.006;
    skyClone.material.uniforms.mieDirectionalG.value = 0.86;
    skyClone.material.uniforms.sunPosition.value.copy(this.sunDir);
    envScene.add(skyClone);
    this.envMap = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.scene.fog = new THREE.FogExp2(0xd9a07a, 0.0065);
  }

  buildLights() {
    const sun = new THREE.DirectionalLight(0xffc48a, 4.2);
    sun.position.copy(this.sunDir).multiplyScalar(60);
    sun.position.y = Math.max(sun.position.y, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 24;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 150 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(0x9fb6ff, 0x5a3e2c, 0.7);
    this.scene.add(hemi);

    // cool rim light from the opposite side for silhouettes
    const rim = new THREE.DirectionalLight(0x7aa0ff, 1.2);
    rim.position.copy(this.sunDir).multiplyScalar(-40);
    rim.position.y = 25;
    this.scene.add(rim);
  }

  buildPlatform() {
    const tex = makeStoneFloorTextures(512);
    for (const t of Object.values(tex)) t.repeat.set(7, 7);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: tex.roughnessMap,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.8,
    });
    const R = ARENA_RADIUS + 2;
    const top = new THREE.Mesh(new THREE.CircleGeometry(R, 96), mat);
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    this.scene.add(top);
    this.floor = top;

    // stone rim blocks
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x8b8074,
      roughness: 0.9,
      normalMap: this.rockTex.normalMap,
      roughnessMap: this.rockTex.roughnessMap,
    });
    const n = 48;
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    const blocks = new THREE.InstancedMesh(blockGeo, rimMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.set(Math.cos(a) * (R + 0.3), -0.25 + hash2(i, 3) * 0.1, Math.sin(a) * (R + 0.3));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      sc.set(1.2, 1.1, ((Math.PI * 2 * (R + 0.3)) / n) * 0.96);
      m.compose(p, q, sc);
      blocks.setMatrixAt(i, m);
    }
    blocks.castShadow = blocks.receiveShadow = true;
    this.scene.add(blocks);

    // base column under platform going into water
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.8, R + 3, 6, 64, 1, true), rimMat);
    base.position.y = -3.6;
    base.receiveShadow = true;
    this.scene.add(base);

    // carved emblem in the center (subtle)
    const emblem = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.5, 64),
      new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false })
    );
    emblem.rotation.x = -Math.PI / 2;
    emblem.position.y = 0.01;
    emblem.receiveShadow = true;
    this.scene.add(emblem);
    const emblem2 = emblem.clone();
    emblem2.geometry = new THREE.RingGeometry(9.6, 9.8, 96);
    this.scene.add(emblem2);
  }

  buildWater() {
    const normals = makeWaterNormals(256);
    const water = new Water(new THREE.PlaneGeometry(1200, 1200), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: this.sunDir.clone(),
      sunColor: 0xffc890,
      waterColor: 0x0b2a35,
      distortionScale: 2.2,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.9;
    water.material.uniforms.size.value = 3;
    // the mirror render must not recompute the shadow map a second time
    const mirror = water.onBeforeRender;
    water.onBeforeRender = (r, s, c) => {
      const au = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      mirror.call(water, r, s, c);
      r.shadowMap.autoUpdate = au;
    };
    this.scene.add(water);
    this.water = water;
  }

  makeRock(radius, detail, seed, squash = 1) {
    let geo = new THREE.IcosahedronGeometry(radius, detail);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = BufferGeometryUtils.mergeVertices(geo);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const d = fbm3(n.x * 1.6 + seed, n.y * 1.6, n.z * 1.6, 5);
      const strata = Math.sin(v.y * 1.4 + d * 3) * 0.05;
      v.multiplyScalar(1 + d * 0.45 + strata);
      v.y *= squash;
      pos.setXYZ(i, v.x, v.y, v.z);
      // moss on top-facing, warm stone elsewhere
      const up = Math.max(0, n.y);
      const shade = 0.85 + d * 0.3;
      const moss = Math.min(1, Math.max(0, up * 1.6 - 0.5 + d));
      colors[i * 3] = (0.42 * (1 - moss) + 0.2 * moss) * shade;
      colors[i * 3 + 1] = (0.37 * (1 - moss) + 0.3 * moss) * shade;
      colors[i * 3 + 2] = (0.32 * (1 - moss) + 0.14 * moss) * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = (pos.getX(i) + pos.getZ(i)) * 0.12;
      uvs[i * 2 + 1] = pos.getY(i) * 0.12;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }

  buildCliffs() {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      normalMap: this.rockTex.normalMap,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughnessMap: this.rockTex.roughnessMap,
    });
    const geos = [];
    const count = 34;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
      // keep the waterfall gap clear
      if (Math.abs(((a + Math.PI * 2) % (Math.PI * 2)) - Math.PI * 0.5) < 0.12) continue;
      const r = rand(80, 100);
      const h = rand(1.1, 2.3);
      const g = this.makeRock(rand(12, 18), 4, i * 3.7, h);
      g.translate(Math.cos(a) * r, rand(-4, 4), Math.sin(a) * r);
      geos.push(g);
    }
    const cliffs = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), mat);
    cliffs.receiveShadow = true;
    this.scene.add(cliffs);

    // near boulders in the water for depth
    const near = [];
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(24, 40);
      const g = this.makeRock(rand(1, 3.2), 3, i * 11.3, rand(0.6, 1.4));
      g.rotateY(rand(0, 6));
      g.translate(Math.cos(a) * r, -0.6, Math.sin(a) * r);
      near.push(g);
    }
    const boulders = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(near), mat);
    boulders.castShadow = boulders.receiveShadow = true;
    this.scene.add(boulders);

    // distant mountains (silhouettes in fog)
    const mMat = new THREE.MeshStandardMaterial({ color: 0x5b5560, roughness: 1, flatShading: false });
    const mg = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const g = this.makeRock(rand(40, 70), 3, i * 5.1, rand(1.2, 2));
      g.translate(Math.cos(a) * 260, rand(10, 30), Math.sin(a) * 260);
      mg.push(g);
    }
    const mtn = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(mg), mMat);
    this.scene.add(mtn);
  }

  buildWaterfall() {
    const a = Math.PI * 0.5;
    const r = 82;
    const geo = new THREE.PlaneGeometry(12, 46, 1, 1);
    this.fallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        void main(){
          vec2 uv = vUv;
          float streak = n(vec2(uv.x*40.0, uv.y*3.0 + uTime*3.0)) * 0.6 + n(vec2(uv.x*90.0, uv.y*6.0 + uTime*5.0)) * 0.4;
          float edge = smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.85, uv.x);
          float foam = smoothstep(0.15, 0.0, uv.y);
          vec3 col = mix(vec3(0.55,0.68,0.75), vec3(1.0), streak);
          float a = edge * (0.55 + streak * 0.45) + foam * 0.5;
          gl_FragColor = vec4(col * 1.2, a * 0.9);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fall = new THREE.Mesh(geo, this.fallMat);
    fall.position.set(Math.cos(a) * r, 20, Math.sin(a) * r);
    fall.lookAt(0, 20, 0);
    this.scene.add(fall);
    this.fallBase = new THREE.Vector3(Math.cos(a) * (r - 2), -0.5, Math.sin(a) * (r - 2));
  }

  buildTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.95, normalMap: this.rockTex.normalMap });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xf2a7c3, roughness: 0.8, emissive: 0x3a0f1e, emissiveIntensity: 0.3 });
    const spots = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      spots.push([Math.cos(a) * rand(28, 36), Math.sin(a) * rand(28, 36)]);
    }
    const trunkGeos = [], leafGeos = [];
    const branch = (start, dir, len, rad, depth) => {
      const end = start.clone().addScaledVector(dir, len);
      const g = new THREE.CylinderGeometry(rad * 0.65, rad, len, 7);
      g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.applyQuaternion(q);
      g.translate(start.x, start.y, start.z);
      trunkGeos.push(g);
      if (depth === 0) {
        for (let k = 0; k < 3; k++) {
          const lg = new THREE.IcosahedronGeometry(rand(1.2, 2), 1);
          lg.translate(end.x + rand(-1, 1), end.y + rand(-0.3, 0.8), end.z + rand(-1, 1));
          leafGeos.push(lg);
        }
        return;
      }
      const kids = depth > 1 ? 2 : 3;
      for (let k = 0; k < kids; k++) {
        const nd = dir.clone().add(new THREE.Vector3(rand(-0.9, 0.9), rand(0.1, 0.6), rand(-0.9, 0.9))).normalize();
        branch(end, nd, len * rand(0.6, 0.8), rad * 0.65, depth - 1);
      }
    };
    for (const [x, z] of spots) {
      branch(new THREE.Vector3(x, -1, z), new THREE.Vector3(rand(-0.2, 0.2), 1, rand(-0.2, 0.2)).normalize(), rand(3.5, 5), 0.45, 3);
      // small island under tree
      const ig = this.makeRock(rand(2.5, 3.5), 3, x * z, 0.35);
      ig.translate(x, -1, z);
      trunkGeos.push(ig);
    }
    // islands use vertex colors; trunks don't — split materials
    const islandGeos = trunkGeos.filter((g) => g.attributes.color);
    const woodGeos = trunkGeos.filter((g) => !g.attributes.color).map((g) => (g.index ? g.toNonIndexed() : g));
    const woodMerged = BufferGeometryUtils.mergeGeometries(woodGeos.map((g) => { g.deleteAttribute('uv'); return g; }));
    const wood = new THREE.Mesh(woodMerged, trunkMat);
    wood.castShadow = true;
    this.scene.add(wood);
    const islands = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(islandGeos),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: this.rockTex.normalMap })
    );
    islands.receiveShadow = true;
    this.scene.add(islands);
    const leaves = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(leafGeos), leafMat);
    leaves.castShadow = true;
    this.scene.add(leaves);
    this.treeSpots = spots;
  }

  buildLanterns() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.9, normalMap: this.rockTex.normalMap });
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 6 });
    const R = ARENA_RADIUS + 1.2;
    this.lanternLights = [];
    const lanternGroup = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 8), stone);
      base.position.y = 0.12;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8), stone);
      post.position.y = 0.7;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), stone);
      box.position.y = 1.35;
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.52), glow);
      light.position.y = 1.35;
      const light2 = light.clone();
      light2.rotation.y = Math.PI / 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.35, 4), stone);
      roof.position.y = 1.75;
      roof.rotation.y = Math.PI / 4;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), stone);
      top.position.y = 1.97;
      for (const m of [base, post, box, roof, top]) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      g.add(base, post, box, light, light2, roof, top);
      g.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      lanternGroup.add(g);
    }
    this.scene.add(bakeGroup(lanternGroup));
    // Two real lights (fixed count) for warm local fill
    for (const a of [Math.PI * 0.25, Math.PI * 1.25]) {
      const l = new THREE.PointLight(0xff9a4a, 12, 14, 2);
      l.position.set(Math.cos(a) * R, 1.6, Math.sin(a) * R);
      this.scene.add(l);
      this.lanternLights.push(l);
    }
  }

  buildTorii() {
    const red = new THREE.MeshStandardMaterial({ color: 0xa3201b, roughness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: 0x151212, roughness: 0.6 });
    const g = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 9, 16);
    for (const x of [-3.6, 3.6]) {
      const p = new THREE.Mesh(pillarGeo, red);
      p.position.set(x, 3.6, 0);
      g.add(p);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.8, 16), black);
      foot.position.set(x, -0.6, 0);
      g.add(foot);
    }
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 1.1), black);
    kasagi.position.y = 8.4;
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.5, 0.9), red);
    shimaki.position.y = 7.9;
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.45, 0.55), red);
    nuki.position.y = 6.4;
    const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4), red);
    gakuzuka.position.y = 7.1;
    g.add(kasagi, shimaki, nuki, gakuzuka);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const a = this.sunDirAngle();
    g.position.set(Math.cos(a) * 31, -0.9, Math.sin(a) * 31);
    g.lookAt(0, -0.9, 0);
    this.scene.add(bakeGroup(g));
  }

  sunDirAngle() {
    return Math.atan2(this.sunDir.z, this.sunDir.x);
  }

  buildPetals() {
    const n = 450;
    const geo = new THREE.PlaneGeometry(0.09, 0.06);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffb7cf, side: THREE.DoubleSide, roughness: 0.7, emissive: 0x401020 });
    this.petals = new THREE.InstancedMesh(geo, mat, n);
    this.petalData = [];
    for (let i = 0; i < n; i++) {
      this.petalData.push({
        p: new THREE.Vector3(rand(-30, 30), rand(0, 16), rand(-30, 30)),
        r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        s: rand(0.6, 1.4),
        ph: rand(0, 10),
      });
    }
    this.scene.add(this.petals);
  }

  update(dt, fx) {
    this.time += dt;
    this.water.material.uniforms.time.value += dt * 0.6;
    this.fallMat.uniforms.uTime.value = this.time;

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < this.petalData.length; i++) {
      const d = this.petalData[i];
      d.p.y -= dt * (0.6 + Math.sin(this.time + d.ph) * 0.2);
      d.p.x += dt * (1.2 + Math.sin(this.time * 0.7 + d.ph) * 0.8);
      d.p.z += dt * Math.cos(this.time * 0.5 + d.ph) * 0.6;
      d.r.x += dt * 2; d.r.y += dt * 1.3;
      if (d.p.y < -0.8 || d.p.x > 30) {
        d.p.set(rand(-34, 20), rand(10, 18), rand(-30, 30));
      }
      q.setFromEuler(d.r);
      s.setScalar(d.s);
      m.compose(d.p, q, s);
      this.petals.setMatrixAt(i, m);
    }
    this.petals.instanceMatrix.needsUpdate = true;

    // lantern flicker
    for (let i = 0; i < this.lanternLights.length; i++) {
      this.lanternLights[i].intensity = 11 + Math.sin(this.time * 13 + i * 3) * 0.8 + Math.sin(this.time * 7.3 + i) * 0.6;
    }

    // golden dust motes drifting in the low sun
    if (fx && Math.random() < dt * 14) {
      const c = new THREE.Color(1.3, 0.95, 0.6);
      fx.glow.spawn({
        x: rand(-16, 16), y: rand(0.3, 5), z: rand(-16, 16),
        vx: rand(0.1, 0.5), vy: rand(-0.05, 0.15), vz: rand(-0.2, 0.2),
        color: c, size: rand(0.03, 0.07), sizeEnd: 0.02, life: rand(3, 6), alpha: 0.7,
      });
    }
    // waterfall mist
    if (fx && Math.random() < dt * 30) {
      const c = new THREE.Color(0.8, 0.85, 0.9);
      fx.smoke.spawn({
        x: this.fallBase.x + rand(-5, 5), y: this.fallBase.y + rand(0, 1), z: this.fallBase.z + rand(-1, 1),
        vx: rand(-1, 1), vy: rand(1, 3), vz: rand(-2, 0),
        color: c, size: 4, sizeEnd: 9, life: 2.5, drag: 0.5, alpha: 0.25,
      });
    }
  }
}
