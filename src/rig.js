import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeClothNormal, rand } from './utils.js';

export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'lArm', 'lFore', 'lHand', 'rArm', 'rFore', 'rHand', 'lLeg', 'lShin', 'lFoot', 'rLeg', 'rShin', 'rFoot'];

let clothNormal = null;

function capsule(r, len, mat, seg = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function sphere(r, mat, ws = 16, hs = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * Builds a stylised-realistic articulated ninja from primitives.
 * Returns joints (Object3D per pose channel) plus helpers.
 */
export function buildRig(def) {
  if (!clothNormal) clothNormal = makeClothNormal(128);
  const c = def.colors;
  const b = def.build;
  const female = def.hair === 'ponytail';

  const mats = {
    jacket: new THREE.MeshStandardMaterial({ color: c.jacket, roughness: 0.82, normalMap: clothNormal, normalScale: new THREE.Vector2(0.5, 0.5) }),
    accent: new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.7, normalMap: clothNormal, normalScale: new THREE.Vector2(0.4, 0.4) }),
    pants: new THREE.MeshStandardMaterial({ color: c.pants, roughness: 0.9, normalMap: clothNormal, normalScale: new THREE.Vector2(0.5, 0.5) }),
    skin: new THREE.MeshPhysicalMaterial({ color: c.skin, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xff9c80), sheenRoughness: 0.6, emissive: new THREE.Color(c.skin).multiplyScalar(0.04) }),
    hair: new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.45, metalness: 0.05 }),
    wrap: new THREE.MeshStandardMaterial({ color: 0xbdb5a5, roughness: 0.95, normalMap: clothNormal }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb9bcc1, metalness: 0.9, roughness: 0.38, envMapIntensity: 0.6 }),
    band: new THREE.MeshStandardMaterial({ color: 0x1a1d2a, roughness: 0.8, normalMap: clothNormal }),
    sandal: new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf5f3f0, roughness: 0.3 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c.eye), emissiveIntensity: 0.6, roughness: 0.2 }),
    scarf: new THREE.MeshStandardMaterial({ color: c.scarf, roughness: 0.75, side: THREE.DoubleSide, normalMap: clothNormal, normalScale: new THREE.Vector2(0.4, 0.4) }),
    brow: new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.8 }),
  };

  const root = new THREE.Group();
  const tilt = joint(root, 0, 0, 0);
  const J = {};
  J.hips = joint(tilt, 0, 0.97, 0);

  // pelvis + belt + jacket skirt flaps
  const pelvis = sphere(0.16, mats.pants);
  pelvis.scale.set(1.2 * b, 0.85, 0.85 * b);
  J.hips.add(pelvis);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17 * b, 0.022, 8, 28), mats.accent);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.12, 0.84, 1);
  belt.position.y = 0.07;
  belt.castShadow = true;
  J.hips.add(belt);
  const knot = sphere(0.03, mats.accent, 8, 6);
  knot.position.set(0.09 * b, 0.06, 0.13 * b);
  J.hips.add(knot);
  const flapF = box(0.2 * b, 0.2, 0.025, mats.jacket);
  flapF.geometry.translate(0, -0.1, 0);
  flapF.position.set(0, 0.05, 0.135 * b);
  flapF.rotation.x = 0.1;
  const flapB = flapF.clone();
  flapB.position.z = -0.14 * b;
  flapB.rotation.x = -0.12;
  J.hips.add(flapF, flapB);
  // side tails of the jacket
  for (const sd of [-1, 1]) {
    const tail = box(0.03, 0.22, 0.16 * b, mats.jacket);
    tail.geometry.translate(0, -0.11, 0);
    tail.position.set(sd * 0.19 * b, 0.05, -0.02);
    tail.rotation.z = sd * 0.12;
    J.hips.add(tail);
  }
  // weapon pouch
  const pouch = box(0.1, 0.09, 0.07, mats.sandal);
  pouch.position.set(-0.13 * b, -0.02, -0.12 * b);
  J.hips.add(pouch);

  J.spine = joint(J.hips, 0, 0.1, 0);
  const abdomen = capsule(0.13, 0.1, mats.jacket);
  abdomen.scale.set(1.12 * b, 1, 0.85 * b);
  abdomen.position.y = 0.07;
  J.spine.add(abdomen);

  J.chest = joint(J.spine, 0, 0.18, 0);
  const chestW = female ? 1.12 : 1.28;
  const torso = capsule(0.165, 0.14, mats.jacket, 14);
  torso.scale.set(chestW * b, 1, 0.82 * b);
  torso.position.y = 0.12;
  J.chest.add(torso);
  // tactical vest: front pockets + accent trim at the waist
  for (const sd of [-1, 1]) {
    const pocket = box(0.085, 0.07, 0.03, mats.jacket);
    pocket.position.set(sd * 0.075 * b, 0.06, 0.135 * b);
    pocket.rotation.x = -0.15;
    J.chest.add(pocket);
    const flap = box(0.088, 0.018, 0.034, mats.accent);
    flap.position.set(sd * 0.075 * b, 0.1, 0.13 * b);
    flap.rotation.x = -0.15;
    J.chest.add(flap);
  }
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.15 * b, 0.016, 6, 28), mats.accent);
  trim.rotation.x = Math.PI / 2;
  trim.scale.set(chestW * 0.98, 0.86, 1);
  trim.position.y = -0.005;
  J.chest.add(trim);
  // zipper line
  const zip = box(0.012, 0.26, 0.01, mats.accent);
  zip.position.set(0, 0.13, 0.14 * b);
  zip.rotation.x = -0.12;
  J.chest.add(zip);
  // scroll pack on the back
  const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), mats.accent);
  scroll.rotation.z = 1.2;
  scroll.position.set(0, 0.12, -0.15 * b);
  scroll.castShadow = true;
  J.chest.add(scroll);
  // collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.1, 16, 1, true), mats.accent);
  collar.material = mats.accent;
  collar.position.y = 0.3;
  collar.castShadow = true;
  J.chest.add(collar);
  // shoulder guards
  for (const s of [-1, 1]) {
    const pad = sphere(0.085, mats.jacket);
    pad.scale.set(1.1, 0.8, 1.05);
    pad.position.set(s * 0.22 * b, 0.24, 0);
    J.chest.add(pad);
  }

  J.neck = joint(J.chest, 0, 0.3, 0);
  const neck = capsule(0.05, 0.06, mats.skin);
  neck.position.y = 0.04;
  J.neck.add(neck);

  J.head = joint(J.neck, 0, 0.1, 0);
  const head = new THREE.Mesh(sculptHead(female), mats.skin);
  head.castShadow = head.receiveShadow = true;
  head.position.y = 0.1;
  J.head.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 6), mats.skin);
  nose.rotation.x = Math.PI / 2 + 0.3;
  nose.position.set(0, 0.085, 0.118);
  J.head.add(nose);
  for (const s of [-1, 1]) {
    const ear = sphere(0.025, mats.skin, 8, 6);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(s * 0.108, 0.1, -0.005);
    J.head.add(ear);
    const sclera = sphere(0.02, mats.white, 12, 8);
    sclera.scale.set(1.3, 0.75, 0.5);
    sclera.position.set(s * 0.042, 0.112, 0.1);
    J.head.add(sclera);
    const iris = sphere(0.012, mats.eye, 10, 8);
    iris.scale.set(1, 1, 0.5);
    iris.position.set(s * 0.042, 0.112, 0.109);
    J.head.add(iris);
    const brow = box(0.045, 0.008, 0.01, mats.brow);
    brow.position.set(s * 0.042, 0.137, 0.106);
    brow.rotation.z = s * -0.18;
    J.head.add(brow);
  }
  // mouth
  const mouth = box(0.03, 0.0035, 0.006, new THREE.MeshStandardMaterial({ color: 0x6a3530 }));
  mouth.position.set(0, 0.038, 0.104);
  J.head.add(mouth);

  // headband with metal plate
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.035, 28, 1, true), mats.band);
  band.scale.set(0.95, 1, 1.02);
  band.position.y = 0.155;
  band.rotation.x = -0.12;
  J.head.add(band);
  const plate = box(0.11, 0.04, 0.012, mats.metal);
  plate.position.set(0, 0.16, 0.118);
  plate.rotation.x = -0.12;
  J.head.add(plate);
  const sym = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 6, 16), mats.band);
  sym.position.set(0, 0.16, 0.125);
  sym.rotation.x = -0.12;
  J.head.add(sym);
  // headband tails
  const tails = [];
  for (const s of [-1, 1]) {
    const t = box(0.03, 0.17, 0.006, mats.band);
    t.geometry.translate(0, -0.085, 0);
    t.position.set(s * 0.025, 0.16, -0.115);
    t.rotation.set(0.6, 0, s * 0.25);
    J.head.add(t);
    tails.push(t);
  }

  buildHair(J.head, def.hair, mats.hair);

  // ---- arms ----
  for (const side of ['l', 'r']) {
    const s = side === 'l' ? 1 : -1;
    const arm = (J[side + 'Arm'] = joint(J.chest, s * 0.215 * b, 0.22, 0));
    const upper = capsule(0.064 * (0.85 + b * 0.15), 0.18, mats.jacket);
    upper.position.y = -0.14;
    arm.add(upper);
    const fore = (J[side + 'Fore'] = joint(arm, 0, -0.29, 0));
    fore.add(sphere(0.056 * (0.85 + b * 0.15), mats.jacket, 10, 8));
    const forearm = capsule(0.052 * (0.85 + b * 0.15), 0.17, mats.skin);
    forearm.position.y = -0.13;
    fore.add(forearm);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.053, 0.12, 12), mats.wrap);
    wrap.position.y = -0.18;
    wrap.castShadow = true;
    fore.add(wrap);
    const guard = box(0.075, 0.11, 0.05, mats.metal);
    guard.position.set(0, -0.15, 0.035);
    fore.add(guard);
    const hand = (J[side + 'Hand'] = joint(fore, 0, -0.27, 0));
    const fist = sphere(0.056, mats.skin, 12, 10);
    fist.scale.set(0.85, 1.05, 1.1);
    fist.position.y = -0.03;
    hand.add(fist);
    const glove = sphere(0.058, mats.band, 12, 10);
    glove.scale.set(0.9, 0.6, 1.12);
    glove.position.y = -0.005;
    hand.add(glove);
  }

  // ---- legs ----
  for (const side of ['l', 'r']) {
    const s = side === 'l' ? 1 : -1;
    const leg = (J[side + 'Leg'] = joint(J.hips, s * 0.1 * b, -0.05, 0));
    const thigh = capsule(0.088 * b, 0.26, mats.pants);
    thigh.position.y = -0.2;
    leg.add(thigh);
    const shin = (J[side + 'Shin'] = joint(leg, 0, -0.43, 0));
    const knee = sphere(0.074 * b, mats.pants, 12, 10);
    shin.add(knee);
    const calf = capsule(0.066 * b, 0.27, mats.pants);
    calf.position.y = -0.19;
    shin.add(calf);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.071 * b, 0.067 * b, 0.2, 14), mats.wrap);
    wrap.position.y = -0.3;
    wrap.castShadow = true;
    shin.add(wrap);
    const foot = (J[side + 'Foot'] = joint(shin, 0, -0.43, 0));
    const sole = box(0.1, 0.04, 0.26, mats.sandal);
    sole.position.set(0, -0.045, 0.05);
    foot.add(sole);
    const top = sphere(0.05, mats.skin, 10, 8);
    top.scale.set(1.0, 0.65, 2.2);
    top.position.set(0, -0.015, 0.06);
    foot.add(top);
  }

  // ---- scarf / ponytail chains (simulated in world space) ----
  const chains = [];
  const scarfSegs = [];
  const scarfGeo = new THREE.BoxGeometry(0.16, 0.012, 1);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(scarfGeo, mats.scarf);
    m.castShadow = true;
    scarfSegs.push(m);
  }
  const scarfAnchor = joint(J.chest, 0, 0.27, -0.1);
  chains.push({ anchor: scarfAnchor, meshes: scarfSegs, segLen: 0.13, nodes: null, width: 1, gravity: 3, wind: 4 });

  if (def.hair === 'ponytail') {
    const ptGeo = new THREE.CylinderGeometry(0.035, 0.02, 1, 8);
    ptGeo.rotateX(Math.PI / 2);
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(ptGeo, mats.hair);
      m.castShadow = true;
      segs.push(m);
    }
    const anchor = joint(J.head, 0, 0.2, -0.1);
    chains.push({ anchor, meshes: segs, segLen: 0.11, nodes: null, gravity: 7, wind: 1 });
  }

  mergeStatic(root);
  return { root, tilt, J, mats, chains, tails };
}

/**
 * Bakes every joint's directly attached meshes into one mesh per material.
 * Cuts draw calls from ~90 to ~30 per fighter (x3 with shadow + reflection passes).
 */
function mergeStatic(root) {
  const groups = [];
  root.traverse((o) => {
    if (!o.isMesh && o.children.some((c) => c.isMesh)) groups.push(o);
  });
  for (const g of groups) {
    const byMat = new Map();
    for (const c of [...g.children]) {
      if (!c.isMesh || Array.isArray(c.material)) continue;
      c.updateMatrix();
      let geo = c.geometry.clone().applyMatrix4(c.matrix);
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(geo);
      g.remove(c);
    }
    for (const [mat, geos] of byMat) {
      const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
}

/**
 * Sculpted hair: a sphere shell whose vertices are pushed out along a set of
 * spike directions, giving one continuous anime-style hair mass per style.
 */
function sculptHair(style) {
  let geo = new THREE.IcosahedronGeometry(0.128, 5);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = BufferGeometryUtils.mergeVertices(geo);
  const dirs = [];
  const add = (x, y, z, len, sharp) => dirs.push({ d: new THREE.Vector3(x, y, z).normalize(), len, sharp });
  if (style === 'spiky') {
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      add(Math.cos(a) * 0.9, 0.55 + (i % 3) * 0.3, Math.sin(a) * 0.7 - 0.55, rand(0.08, 0.13), rand(28, 40));
    }
    add(0, 1, -0.2, 0.1, 30);
  } else if (style === 'swept') {
    for (let i = 0; i < 11; i++) {
      const x = (i / 10 - 0.5) * 1.4;
      add(x, 0.45 + Math.abs(x) * 0.2, -1, rand(0.1, 0.15), rand(22, 32));
    }
    for (let i = 0; i < 5; i++) add((i / 4 - 0.5) * 1.2, 0.95, -0.3, 0.07, 26);
  } else if (style === 'short') {
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), y = rand(0.2, 1);
      add(Math.cos(a), y, Math.sin(a) - 0.2, rand(0.02, 0.035), 40);
    }
  }
  const p = geo.attributes.position;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.copy(v).normalize();
    let r = 0.128;
    // keep the face and the underside inside the skull
    const face = n.z > 0.2 && n.y < 0.42;
    const under = n.y < -0.15 && !(style === 'ponytail' && n.z < -0.4);
    if (face || under) r = 0.1;
    else {
      let f = 0;
      for (const s of dirs) f = Math.max(f, Math.pow(Math.max(0, n.dot(s.d)), s.sharp) * s.len);
      r += f;
      if (style === 'ponytail' && n.z < -0.3 && n.y < 0.2) r += 0.012 * (1 - n.y); // hair hanging down the back
    }
    p.setXYZ(i, n.x * r, n.y * r, n.z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

function sculptHead(female) {
  const geo = new THREE.SphereGeometry(0.118, 32, 24);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const y = v.y / 0.118;
    let sx = 0.92, sz = 0.98;
    if (y < 0) {
      // taper the lower half into cheeks and a chin
      const t = -y;
      sx *= 1 - t * t * (female ? 0.38 : 0.3);
      sz *= 1 - t * t * 0.12;
      if (v.z > 0) v.z += t * t * 0.012;
      v.y *= 1.12;
    } else v.y *= 1.04;
    // flatten the back of the head slightly and the sides at the temples
    if (v.z < 0) sz *= 0.97;
    v.x *= sx;
    v.z *= sz;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildHair(head, style, mat) {
  const hair = new THREE.Mesh(sculptHair(style), mat);
  hair.castShadow = true;
  hair.position.set(0, 0.112, -0.008);
  hair.scale.set(0.98, 1, 1.04);
  head.add(hair);
  const spike = (len, r, pos, dir) => {
    const g = new THREE.ConeGeometry(r, len, 7);
    g.translate(0, len / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    head.add(m);
    return m;
  };
  if (style === 'spiky') {
    for (let i = 0; i < 5; i++) {
      // bangs falling over the headband
      const x = (i - 2) * 0.033;
      spike(0.085, 0.024, new THREE.Vector3(x, 0.205, 0.085), new THREE.Vector3(x * 2, -0.75, 1));
    }
  } else if (style === 'swept') {
    for (let i = 0; i < 2; i++) {
      spike(0.12, 0.022, new THREE.Vector3(-0.045 + i * 0.03, 0.2, 0.095), new THREE.Vector3(0.3, -1, 0.45));
    }
  } else if (style === 'ponytail') {
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.03;
      spike(0.1, 0.026, new THREE.Vector3(x, 0.21, 0.085), new THREE.Vector3(x * 1.5, -1, 0.35));
    }
    for (const s of [-1, 1]) {
      // side locks framing the face
      spike(0.2, 0.028, new THREE.Vector3(s * 0.102, 0.18, 0.055), new THREE.Vector3(s * 0.08, -1, 0.05));
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 12), new THREE.MeshStandardMaterial({ color: 0x7b3fc4 }));
    tie.position.set(0, 0.2, -0.12);
    head.add(tie);
  }
}

// ---------------------------------------------------------------------------
// Pose utilities. A pose is { hipY, joint: [x,y,z], ... }
// ---------------------------------------------------------------------------
export function makePose(base, partial) {
  const p = { hipY: base.hipY, tilt: base.tilt ?? 0 };
  for (const j of JOINTS) p[j] = (partial && partial[j]) || base[j] || [0, 0, 0];
  if (partial && partial.hipY !== undefined) p.hipY = partial.hipY;
  if (partial && partial.tilt !== undefined) p.tilt = partial.tilt;
  return p;
}

export function lerpPose(out, a, b, t) {
  out.hipY = a.hipY + (b.hipY - a.hipY) * t;
  out.tilt = (a.tilt || 0) + ((b.tilt || 0) - (a.tilt || 0)) * t;
  for (const j of JOINTS) {
    const A = a[j], B = b[j];
    const o = out[j] || (out[j] = [0, 0, 0]);
    o[0] = A[0] + (B[0] - A[0]) * t;
    o[1] = A[1] + (B[1] - A[1]) * t;
    o[2] = A[2] + (B[2] - A[2]) * t;
  }
  return out;
}

export function clonePose(p) {
  const o = { hipY: p.hipY, tilt: p.tilt || 0 };
  for (const j of JOINTS) o[j] = [...p[j]];
  return o;
}

export function applyPose(rig, pose) {
  rig.J.hips.position.y = 0.97 + pose.hipY;
  for (const j of JOINTS) {
    const r = pose[j];
    rig.J[j].rotation.set(r[0], r[1], r[2]);
  }
}

/** Sample keyframed clip: keys = [{t, p}] where p is a full pose. */
export function sampleClip(keys, time, out) {
  if (time <= keys[0].t) return lerpPose(out, keys[0].p, keys[0].p, 0);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (time <= b.t) {
      let k = (time - a.t) / (b.t - a.t);
      const e = b.ease || 'smooth';
      if (e === 'smooth') k = k * k * (3 - 2 * k);
      else if (e === 'out') k = 1 - (1 - k) * (1 - k) * (1 - k);
      else if (e === 'in') k = k * k;
      return lerpPose(out, a.p, b.p, k);
    }
  }
  const last = keys[keys.length - 1].p;
  return lerpPose(out, last, last, 0);
}

// ---------------------------------------------------------------------------
// Verlet chains for scarves / ponytails
// ---------------------------------------------------------------------------
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export function updateChains(rig, scene, dt, time, windDir) {
  for (const ch of rig.chains) {
    const n = ch.meshes.length + 1;
    ch.anchor.getWorldPosition(_v);
    if (!ch.nodes) {
      ch.nodes = [];
      for (let i = 0; i < n; i++) {
        const p = _v.clone().add(new THREE.Vector3(0, -i * ch.segLen, -i * 0.02));
        ch.nodes.push({ p, o: p.clone() });
      }
      for (const m of ch.meshes) scene.add(m);
    }
    const g = ch.gravity;
    ch.nodes[0].p.copy(_v);
    ch.nodes[0].o.copy(_v);
    const sdt = Math.min(dt, 1 / 30);
    for (let i = 1; i < n; i++) {
      const nd = ch.nodes[i];
      _w.subVectors(nd.p, nd.o).multiplyScalar(0.95);
      nd.o.copy(nd.p);
      nd.p.add(_w);
      nd.p.y -= g * sdt * sdt;
      const gust = (Math.sin(time * 3 + i) * 0.5 + 0.8) * ch.wind;
      nd.p.addScaledVector(windDir, gust * sdt * sdt);
      if (nd.p.y < 0.02) nd.p.y = 0.02;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < n; i++) {
        const a = ch.nodes[i - 1].p, bb = ch.nodes[i].p;
        _w.subVectors(bb, a);
        const d = _w.length() || 1e-5;
        const diff = (d - ch.segLen) / d;
        if (i === 1) bb.addScaledVector(_w, -diff);
        else {
          a.addScaledVector(_w, diff * 0.5);
          bb.addScaledVector(_w, -diff * 0.5);
        }
      }
    }
    for (let i = 0; i < ch.meshes.length; i++) {
      const a = ch.nodes[i].p, bb = ch.nodes[i + 1].p;
      const m = ch.meshes[i];
      m.position.addVectors(a, bb).multiplyScalar(0.5);
      m.lookAt(bb);
      m.scale.z = a.distanceTo(bb) + 0.01;
      const taper = 1 - (i / ch.meshes.length) * 0.35;
      m.scale.x = taper;
    }
  }
}

export function resetChains(rig) {
  for (const ch of rig.chains) {
    if (!ch.nodes) continue;
    ch.anchor.getWorldPosition(_v);
    for (let i = 0; i < ch.nodes.length; i++) {
      ch.nodes[i].p.copy(_v).y -= i * ch.segLen;
      ch.nodes[i].o.copy(ch.nodes[i].p);
    }
  }
}

export function setRigVisible(rig, v) {
  rig.root.visible = v;
  for (const ch of rig.chains) for (const m of ch.meshes) m.visible = v;
}

export function disposeRig(rig, scene) {
  scene.remove(rig.root);
  for (const ch of rig.chains) for (const m of ch.meshes) scene.remove(m);
}
