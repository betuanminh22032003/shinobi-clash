import * as THREE from 'three';
import { POSES, MOVES, runPose } from './poses.js';
import { applyPose, lerpPose, clonePose, sampleClip } from './rig.js';
import { energyMaterial, Bolt } from './effects.js';
import { rand, clamp, damp } from './utils.js';
import { ARENA_RADIUS } from './arena.js';

const _v = new THREE.Vector3();
const _c = new THREE.Color();

// ---------------------------------------------------------------------------
// Projectile
// ---------------------------------------------------------------------------
export class Projectile {
  constructor(game, owner, o) {
    this.g = game;
    this.owner = owner;
    this.pos = o.pos.clone();
    this.vel = o.vel.clone();
    this.radius = o.radius ?? 0.4;
    this.hit = o.hit;
    this.life = o.life ?? 2;
    this.t = 0;
    this.obj = o.obj || null;
    this.homing = o.homing || 0;
    this.onTick = o.onTick;
    this.onHit = o.onHit;
    this.onExpire = o.onExpire;
    this.groundHit = o.groundHit ?? true;
    this.spin = o.spin || 0;
    this.dead = false;
    this.light = null;
    if (this.obj) {
      this.obj.position.copy(this.pos);
      game.transient.add(this.obj);
    }
    if (o.light) {
      this.light = game.fx.lights.acquire();
      if (this.light) {
        this.light.color.copy(o.light.color);
        this.light.intensity = o.light.intensity;
        this.light.distance = o.light.distance ?? 10;
      }
    }
  }

  get target() {
    return this.owner.opponent;
  }

  update(dt) {
    if (this.dead) return false;
    this.t += dt;
    const tgt = this.target;
    if (this.homing && tgt.state !== 'ko') {
      const tp = tgt.chestPos(_v).sub(this.pos);
      const sp = this.vel.length();
      tp.normalize().multiplyScalar(sp);
      this.vel.lerp(tp, clamp(this.homing * dt, 0, 1)).setLength(sp);
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.obj) {
      this.obj.position.copy(this.pos);
      if (this.spin) this.obj.rotation.y += this.spin * dt;
    }
    if (this.light) this.light.position.copy(this.pos);
    if (this.onTick) this.onTick(this, dt);
    if (this.dead) return false;

    // collision with opponent body (capsule from ankles to head)
    if (this.hit && tgt.state !== 'ko') {
      const by = clamp(this.pos.y, tgt.pos.y + 0.2, tgt.pos.y + 1.7);
      const dx = this.pos.x - tgt.pos.x, dy = this.pos.y - by, dz = this.pos.z - tgt.pos.z;
      if (dx * dx + dy * dy + dz * dz < (this.radius + 0.35) ** 2) {
        const res = this.owner.applyHit(tgt, this.hit, this.pos.clone());
        if (res !== 'miss') {
          if (this.onHit) this.onHit(this, tgt, res);
          else this.kill();
          if (this.dead) return false;
        }
      }
    }
    if (this.groundHit && this.pos.y < 0.05) {
      if (this.onExpire) this.onExpire(this, 'ground');
      this.kill();
      return false;
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (this.t > this.life || r > ARENA_RADIUS + 25) {
      if (this.onExpire) this.onExpire(this, 'life');
      this.kill();
      return false;
    }
    return true;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    if (this.obj) {
      this.g.transient.remove(this.obj);
      this.obj.traverse((o) => {
        if (o.isMesh && o.material.dispose && o.userData.disposable) o.material.dispose();
      });
    }
    this.g.fx.lights.release(this.light);
    this.light = null;
  }
}

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
function makeOrb(colA, colB, r, { core = 0xffffff, coreScale = 0.55, intensity = 2.5 } = {}) {
  const g = new THREE.Group();
  const shellMat = energyMaterial(colA, colB, { intensity });
  const shell = new THREE.Mesh(sphereGeo, shellMat);
  shell.userData.disposable = true;
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(core).multiplyScalar(1.8), transparent: true, opacity: 0.9 });
  const coreM = new THREE.Mesh(sphereGeo, coreMat);
  coreM.userData.disposable = true;
  coreM.scale.setScalar(coreScale);
  const halo = new THREE.Mesh(sphereGeo, energyMaterial(colA, colB, { intensity: intensity * 0.4, opacity: 0.25, swirl: -4 }));
  halo.userData.disposable = true;
  halo.scale.setScalar(1.35);
  g.add(coreM, shell, halo);
  g.scale.setScalar(r);
  g.userData.mats = [shellMat, halo.material];
  g.userData.tick = (dt) => {
    for (const m of g.userData.mats) m.uniforms.uTime.value += dt;
    shell.rotation.y += dt * 6;
    halo.rotation.x += dt * 3;
  };
  return g;
}

function makeWindShuriken(r) {
  const g = makeOrb(0x1aa8ff, 0x9ff6ff, r, { intensity: 2, core: 0xc8f8ff, coreScale: 0.45 });
  const bladeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.6, 2.2), transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(1.6, 0.4, 3.2, 0);
    shape.quadraticCurveTo(1.8, -0.5, 0, -0.5);
    const blade = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), bladeMat);
    blade.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.rotation.y = (i / 4) * Math.PI * 2;
    holder.add(blade);
    blades.add(holder);
  }
  g.add(blades);
  const prev = g.userData.tick;
  g.userData.tick = (dt) => {
    prev(dt);
    blades.rotation.y += dt * 18;
  };
  return g;
}

function attachToBone(obj, fighter, bone, offset) {
  fighter.boneWorld(bone, obj.position);
  if (offset) obj.position.add(offset);
}

function spawnFireTrail(g, pos, scale = 1) {
  for (let i = 0; i < 3; i++) {
    const t = Math.random();
    _c.setRGB(2.4 + t * 1.2, 0.45 + t * 0.9, 0.06);
    g.fx.glow.spawn({
      x: pos.x + rand(-0.2, 0.2) * scale, y: pos.y + rand(-0.2, 0.2) * scale, z: pos.z + rand(-0.2, 0.2) * scale,
      vx: rand(-1, 1), vy: rand(1, 3), vz: rand(-1, 1),
      color: _c, size: rand(0.5, 0.9) * scale, sizeEnd: 0.05, life: rand(0.25, 0.5), drag: 2,
    });
  }
  if (Math.random() < 0.4) {
    _c.setRGB(0.15, 0.12, 0.1);
    g.fx.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vy: 1.5, color: _c, size: 0.6 * scale, sizeEnd: 2 * scale, life: 0.9, alpha: 0.35, drag: 1 });
  }
}

function aimAt(f, h = 1.1) {
  const o = f.opponent;
  const from = f.chestPos(new THREE.Vector3());
  const to = o.chestPos(new THREE.Vector3());
  to.y = Math.max(to.y, h);
  return to.sub(from).normalize();
}

const WIND_A = 0x2fd8ff, WIND_B = 0xe8ffff;
const FIRE_A = 0xff2200, FIRE_B = 0xff8a1a;
const LIGHT_COL = new THREE.Color(1.6, 1.3, 3.2);
const EARTH_COL = new THREE.Color(1, 0.7, 0.3);

const WIND_COL = new THREE.Color(0.4, 1.8, 2.4);
const FIRE_COL = new THREE.Color(2.5, 1, 0.2);
const SAND_HIT = new THREE.Color(1.6, 1.15, 0.55);
const SAND_SMOKE = new THREE.Color(0.8, 0.64, 0.4);
const LEE_COL = new THREE.Color(0.6, 2.4, 0.8);

// ---------------------------------------------------------------------------
// Grab helpers: a held fighter is posed by the jutsu instead of by physics.
// ---------------------------------------------------------------------------
function grab(o) {
  if (o.state === 'ko') return false;
  o.held = true;
  o.vel.set(0, 0, 0);
  o.state = 'launched';
  o.stateT = 0;
  return true;
}
function release(o) {
  o.held = false;
}
/** applyHit that keeps the target in the caster's grip unless the hit KOs them. */
function holdHit(f, o, h, at) {
  const res = f.applyHit(o, h, at || o.chestPos(new THREE.Vector3()));
  if (res === 'hit' && o.state !== 'ko') {
    o.held = true;
    o.vel.set(0, 0, 0);
    o.state = 'launched';
  }
  return res;
}

function sandBurst(g, pos, n = 20, spread = 1, up = 3) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    _c.copy(SAND_SMOKE).multiplyScalar(rand(0.8, 1.15));
    g.fx.smoke.spawn({
      x: pos.x + Math.cos(a) * rand(0, spread), y: pos.y + rand(0, 0.5), z: pos.z + Math.sin(a) * rand(0, spread),
      vx: Math.cos(a) * rand(1, 4) * spread, vy: rand(0.5, up), vz: Math.sin(a) * rand(1, 4) * spread,
      color: _c, size: rand(0.4, 0.8), sizeEnd: rand(1.2, 2.2), life: rand(0.5, 1), drag: 2.5, alpha: 0.85, gravity: 2,
    });
  }
}

function blackFlame(g, pos, scale = 1) {
  _c.setRGB(0.015, 0.008, 0.02);
  g.fx.smoke.spawn({
    x: pos.x + rand(-0.3, 0.3) * scale, y: pos.y + rand(-0.2, 0.4) * scale, z: pos.z + rand(-0.3, 0.3) * scale,
    vx: rand(-0.4, 0.4), vy: rand(1.5, 3.2), vz: rand(-0.4, 0.4),
    color: _c, size: rand(0.35, 0.6) * scale, sizeEnd: 0.05, life: rand(0.35, 0.6), alpha: 0.95, drag: 1,
  });
  if (Math.random() < 0.5) {
    _c.setRGB(0.9, 0.05, 0.25);
    g.fx.glow.spawn({
      x: pos.x + rand(-0.3, 0.3) * scale, y: pos.y + rand(0, 0.5) * scale, z: pos.z + rand(-0.3, 0.3) * scale,
      vy: rand(1, 2.5), color: _c, size: rand(0.25, 0.45) * scale, sizeEnd: 0, life: 0.3, alpha: 0.5,
    });
  }
}

function fireFlare(g, pos, scale = 1) {
  _c.setRGB(2.2, rand(0.6, 1.2), 0.12);
  g.fx.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: rand(-1, 1), vy: rand(0.5, 2), vz: rand(-1, 1), color: _c, size: 0.55 * scale, sizeEnd: 0.05, life: rand(0.25, 0.45), drag: 2, alpha: 0.8 });
}

/** A posable copy of a fighter's rig used for shadow clones. */
class Puppet {
  constructor(rig) {
    this.rig = rig;
    this.pose = clonePose(POSES.stance);
    this.tgt = clonePose(POSES.stance);
    this.phase = 0;
  }
  get pos() {
    return this.rig.root.position;
  }
  show(pos, yaw) {
    this.rig.root.visible = true;
    this.rig.root.position.copy(pos);
    this.rig.root.rotation.y = yaw;
    lerpPose(this.pose, POSES.stance, POSES.stance, 0);
  }
  hide() {
    this.rig.root.visible = false;
  }
  face(p) {
    this.rig.root.rotation.y = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }
  run(dt) {
    this.phase += dt * 20;
    runPose(this.phase, this.tgt);
    this.blend(this.tgt, 20, dt);
  }
  blend(p, rate, dt) {
    lerpPose(this.pose, this.pose, p, 1 - Math.exp(-rate * dt));
    applyPose(this.rig, this.pose);
    this.rig.tilt.rotation.x = this.pose.tilt || 0;
  }
}

function getPuppets(f) {
  if (!f.cloneRigs) return [];
  return f.cloneRigs.map((r) => new Puppet(r));
}

const _kick = clonePose(POSES.stance);
const kickPose = () => sampleClip(MOVES.roundhouse.keys, 0.21, _kick);

// ---------------------------------------------------------------------------
// Shared jutsu builders
// ---------------------------------------------------------------------------
function spikeLine(f, g, { kind = 'rock', color = EARTH_COL, count = 9, sfx = 'rockHit' } = {}) {
  let slammed = false;
  g.audio.play('swingHeavy');
  return {
    pose: () => (f.stateT < 0.32 ? (kind === 'sand' ? POSES.holdOrb : POSES.stompUp) : kind === 'sand' ? POSES.castHand : POSES.slam),
    poseRate: 16,
    update(dt, t) {
      if (kind === 'sand' && !slammed) sandBurst(g, f.pos, 1, 0.8, 1.5);
      if (!slammed && t >= 0.38) {
        slammed = true;
        f.faceOpponent();
        g.shake(0.3);
        g.audio.play(kind === 'sand' ? 'sand' : 'rumble');
        if (kind === 'sand') sandBurst(g, f.pos, 20, 1.2, 2);
        else g.fx.dust(f.pos, 20, 1.5);
        g.fx.waves.spawn(f.pos.clone().setY(0.05), color.clone(), { size: 3, life: 0.4 });
        const dir = f.forwardVec();
        const start = f.pos.clone();
        let landed = false;
        for (let i = 0; i < count; i++) {
          g.schedule(i * 0.06, () => {
            const p = start.clone().addScaledVector(dir, 1.4 + i * 1.3);
            if (Math.hypot(p.x, p.z) > ARENA_RADIUS + 1) return;
            g.spawnSpike(p, 1 + i * 0.08, kind);
            if (kind === 'sand') sandBurst(g, p, 6, 0.6, 3);
            const o = f.opponent;
            if (!landed && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 1.3 && o.pos.y < 1.5) {
              const res = f.applyHit(o, { dmg: 14, kb: 4, launch: 11, stun: 0.7, sfx, jutsu: true, color }, o.chestPos(new THREE.Vector3()).setY(0.6));
              if (res !== 'miss') landed = true;
            }
          });
        }
      }
      return t > 0.9;
    },
  };
}

function fireDragon(f, g, { charge = 1.15, dmg = 34, segCount = 18, scale = 1, unblockable = true, life = 3.2, homing = 2.6, ult = true } = {}) {
  let released = false;
  g.audio.play(ult ? 'ultCharge' : 'inhale');
  return {
    pose: () => (released ? POSES.breathOut : POSES.breath),
    update(dt, t) {
      if (!released) {
        // swirling fire vortex around the caster
        const n = ult ? 4 : 2;
        for (let i = 0; i < n; i++) {
          const a = t * 8 + i * ((Math.PI * 2) / n);
          const r = 1.6 - t * 0.6;
          const p = new THREE.Vector3(f.pos.x + Math.cos(a) * r, f.pos.y + 0.2 + ((t * 3 + i * 0.4) % 2), f.pos.z + Math.sin(a) * r);
          spawnFireTrail(g, p, 0.8);
        }
      }
      if (!released && t >= charge) {
        released = true;
        f.faceOpponent();
        g.audio.play('dragonRoar');
        const pos = f.boneWorld('head', new THREE.Vector3()).add(f.forwardVec().multiplyScalar(0.6));
        const dir = aimAt(f, 1).add(new THREE.Vector3(0, 0.5, 0)).normalize();
        const head = makeOrb(FIRE_A, FIRE_B, 1.1 * scale, { core: 0xffc870, intensity: 2.3, coreScale: 0.5 });
        // horns/jaw silhouette
        const hornMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.3) });
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 8), hornMat);
          horn.position.set(s * 0.6, 0.6, -0.6);
          horn.rotation.set(-1.0, 0, s * 0.4);
          head.add(horn);
        }
        const segs = [];
        for (let i = 0; i < segCount; i++) {
          const s = makeOrb(FIRE_A, FIRE_B, 0.9 * scale * (1 - i / (segCount + 4)), { core: 0xff9a40, intensity: 1.9, coreScale: 0.45 });
          s.position.copy(pos);
          g.transient.add(s);
          segs.push(s);
        }
        const hist = [];
        const cleanup = () => segs.forEach((s) => g.transient.remove(s));
        g.addProjectile(new Projectile(g, f, {
          pos, vel: dir.multiplyScalar(15), radius: 1.3 * scale, life, obj: head, homing, groundHit: false,
          light: { color: new THREE.Color(0xff6a1a), intensity: ult ? 120 : 70, distance: 24 },
          hit: { dmg, kb: 16, launch: 11, stun: 1, sfx: 'explosion', unblockable, jutsu: true, color: new THREE.Color(3, 1.2, 0.2) },
          onTick(p, dt2) {
            head.userData.tick(dt2);
            // serpentine weave
            const side = new THREE.Vector3(-p.vel.z, 0, p.vel.x).normalize();
            p.pos.addScaledVector(side, Math.sin(p.t * 7) * 6 * dt2);
            p.pos.y += Math.cos(p.t * 5) * 2 * dt2;
            if (p.pos.y < 0.8) p.pos.y = 0.8;
            head.lookAt(p.pos.clone().add(p.vel));
            hist.unshift(p.pos.clone());
            if (hist.length > 80) hist.pop();
            for (let i = 0; i < segs.length; i++) {
              const h = hist[Math.min(hist.length - 1, (i + 1) * 3)];
              segs[i].position.copy(h);
              segs[i].userData.tick(dt2);
            }
            spawnFireTrail(g, p.pos, 2 * scale);
            if (Math.random() < 0.5) spawnFireTrail(g, segs[Math.floor(rand(0, segs.length))].position, 1.4 * scale);
          },
          onHit(p) {
            g.fx.explosion(p.pos, new THREE.Color(1.8, 0.6, 0.1), 2.2 * scale);
            g.fx.rocks(new THREE.Vector3(p.pos.x, 0.2, p.pos.z), 10, 8);
            g.shake(0.9 * scale);
            cleanup();
            p.kill();
          },
          onExpire(p) {
            g.fx.explosion(p.pos, new THREE.Color(1.8, 0.6, 0.1), 1.5 * scale);
            g.audio.play('explosion');
            cleanup();
          },
        }));
      }
      return released && t > charge + 0.75;
    },
  };
}

function meteor(f, g, { size = 3, R = 4.5, dmg = 36, startY = 42, fall = 1.25 } = {}) {
  let summoned = false;
  g.audio.play('ultCharge');
  return {
    pose: () => (summoned ? POSES.skyCall : POSES.seal),
    update(dt, t) {
      if (t < 1.15 && Math.random() < 0.5) {
        g.fx.dust(f.pos.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3))), 2, 0.8);
        if (Math.random() < 0.2) g.shake(0.06);
      }
      if (!summoned && t >= 1.15) {
        summoned = true;
        const o = f.opponent;
        const at = new THREE.Vector3(o.pos.x, 0, o.pos.z);
        g.telegraph(at, R, new THREE.Color(2, 0.6, 0.2), fall);
        g.audio.play('rumble');
        const rockGeo = new THREE.IcosahedronGeometry(size, 3);
        const posA = rockGeo.attributes.position;
        for (let i = 0; i < posA.count; i++) {
          _v.fromBufferAttribute(posA, i);
          const n = 1 + (Math.sin(_v.x * 2.1 / size * 3) * Math.cos(_v.y * 1.7 / size * 3) * Math.sin(_v.z * 2.3 / size * 3)) * 0.18 + rand(-0.04, 0.04);
          posA.setXYZ(i, _v.x * n, _v.y * n, _v.z * n);
        }
        rockGeo.computeVertexNormals();
        const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 0.95, emissive: 0xff4a10, emissiveIntensity: 0.25 }));
        rock.castShadow = true;
        rock.position.set(at.x + 10, startY, at.z - 6);
        g.transient.add(rock);
        let life = 0;
        g.addEffect((dt2) => {
          life += dt2;
          const k = Math.min(1, life / fall);
          rock.position.set(at.x + 10 * (1 - k), startY * (1 - k * k) + size * 0.8 * k, at.z - 6 * (1 - k));
          rock.rotation.x += dt2 * 2;
          rock.rotation.z += dt2 * 1.3;
          spawnFireTrail(g, rock.position.clone().add(new THREE.Vector3(rand(-2, 2), 2, rand(-2, 2)).multiplyScalar(size / 3)), 2.5 * size / 3);
          if (k >= 1) {
            g.transient.remove(rock);
            g.fx.explosion(at.clone().setY(1), new THREE.Color(1.6, 0.7, 0.2), 2.4 * size / 3);
            g.fx.rocks(at.clone().setY(0.5), 30, 13);
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              g.spawnSpike(at.clone().add(new THREE.Vector3(Math.cos(a) * R * 0.7, 0, Math.sin(a) * R * 0.7)), 1.6);
            }
            g.audio.play('explosion');
            g.audio.play('rumble');
            g.shake(1.1);
            g.flashScreen(0.35);
            g.impact(0.08);
            if (Math.hypot(o.pos.x - at.x, o.pos.z - at.z) < R && o.pos.y < 4) {
              f.applyHit(o, { dmg, kb: 14, launch: 13, stun: 1, sfx: 'rockHit', unblockable: true, jutsu: true, color: EARTH_COL }, o.chestPos(new THREE.Vector3()));
            }
            return false;
          }
          return true;
        });
      }
      return summoned && t > 1.7;
    },
  };
}

// ---------------------------------------------------------------------------
// Jutsu library. Each returns { update(dt, t) -> done, pose(), cancel?() }.
// Characters pick three of these by name (see characters.js).
// ---------------------------------------------------------------------------
export const JUTSU = {
  shuriken(f, g) {
    const star = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 0.06 : 0.2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(star, { depth: 0.015, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0xbfc5cc, metalness: 1, roughness: 0.25 })
    );
    mesh.rotation.x = Math.PI / 2;
    const obj = new THREE.Group();
    obj.add(mesh);
    const pos = f.boneWorld('rHand', new THREE.Vector3());
    const dir = aimAt(f);
    g.addProjectile(new Projectile(g, f, {
      pos, vel: dir.multiplyScalar(32), radius: 0.25, life: 1.2, obj, spin: 40, homing: 1.2,
      hit: { dmg: 3, kb: 1.5, stun: 0.25, sfx: 'hitLight', color: new THREE.Color(1, 1, 1) },
      onTick(p) {
        _c.setRGB(1.2, 1.3, 1.5);
        g.fx.glow.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, color: _c, size: 0.12, sizeEnd: 0, life: 0.12, alpha: 0.5 });
      },
      onExpire(p) { g.fx.blockSpark(p.pos); },
    }));
    g.audio.play('shuriken');
  },

  // ============================== NARUTO ====================================
  rasengan(f, g) {
    const orb = makeOrb(0x1aa8ff, 0x9ff6ff, 0.05, { intensity: 2, core: 0xc8f8ff, coreScale: 0.45 });
    g.transient.add(orb);
    let hit = false, hitT = 0;
    const light = g.fx.lights.acquire();
    if (light) { light.color.set(0x5ff2ff); light.distance = 8; }
    g.audio.play('windCharge');
    const fwd = f.forwardVec();
    const cleanup = () => {
      g.transient.remove(orb);
      g.fx.lights.release(light);
    };
    return {
      pose: () => (orb.userData.phase === 'dash' ? POSES.castHand : POSES.holdOrb),
      cancel: cleanup,
      update(dt, t) {
        orb.userData.tick(dt);
        const handOff = orb.userData.phase === 'dash' ? fwd.clone().multiplyScalar(0.25) : new THREE.Vector3(0, 0.05, 0.05);
        attachToBone(orb, f, 'rHand', handOff);
        if (light) { light.position.copy(orb.position); light.intensity = 30; }
        const s = Math.min(0.38, 0.05 + t * 1.2);
        orb.scale.setScalar(s * (1 + Math.sin(t * 60) * 0.04));
        // inward-spiralling wisps while forming
        if (t < 0.4) {
          for (let i = 0; i < 2; i++) {
            const a = rand(0, Math.PI * 2), r = 0.8;
            _c.setRGB(0.6, 2.2, 2.8);
            g.fx.glow.spawn({
              x: orb.position.x + Math.cos(a) * r, y: orb.position.y + rand(-0.4, 0.4), z: orb.position.z + Math.sin(a) * r,
              vx: -Math.cos(a) * 3, vy: 0, vz: -Math.sin(a) * 3, color: _c, size: 0.12, sizeEnd: 0, life: 0.25,
            });
          }
        }
        if (t >= 0.38 && t < 0.85 && !hit) {
          if (orb.userData.phase !== 'dash') {
            orb.userData.phase = 'dash';
            f.faceOpponent();
            fwd.copy(f.forwardVec());
            g.audio.play('dash');
          }
          f.vel.x = fwd.x * 19;
          f.vel.z = fwd.z * 19;
          _c.setRGB(0.6, 2, 2.6);
          g.fx.glow.spawn({ x: orb.position.x, y: orb.position.y, z: orb.position.z, vx: -fwd.x * 4, vz: -fwd.z * 4, color: _c, size: 0.5, sizeEnd: 0, life: 0.2 });
          const o = f.opponent;
          if (orb.position.distanceTo(o.chestPos(_v)) < 1.0 + s) {
            const res = f.applyHit(o, { dmg: 17, kb: 13, launch: 6, stun: 0.7, sfx: 'jutsuHit', color: WIND_COL, jutsu: true }, orb.position.clone());
            if (res !== 'miss') {
              hit = true;
              hitT = t;
              f.vel.set(0, 0, 0);
              g.fx.explosion(orb.position, new THREE.Color(0.3, 1.2, 1.6), 0.8);
              g.audio.play('windBlast');
              g.hitstop(0.16);
              orb.visible = false;
            }
          }
        } else if (t >= 0.85) {
          f.vel.x *= 0.8;
          f.vel.z *= 0.8;
        }
        const done = (hit && t - hitT > 0.3) || t > 1.0;
        if (done) {
          if (!hit) g.fx.burst(orb.position, new THREE.Color(0.4, 1.4, 1.8), 30, 6, 0.2, 0.5);
          cleanup();
        }
        return done;
      },
    };
  },

  /** Uzumaki Rendan: two shadow clones kick the target skyward, the original heel-drops it. */
  kageBunshin(f, g) {
    const pups = getPuppets(f);
    const o = f.opponent;
    let spawned = false, connected = false, tc = 0, stage = 0, finished = false;
    const fwd = new THREE.Vector3();
    const self = {
      noGravity: false,
      pose: () => (stage >= 3 ? POSES.slam : stage === 2 ? MOVES.diveKick.keys[1].p : POSES.seal),
      cancel() {
        pups.forEach((p) => p.hide());
        if (connected && !finished) release(o);
      },
      update(dt, t) {
        if (!spawned && t >= 0.18) {
          spawned = true;
          f.faceOpponent();
          fwd.copy(f.forwardVec());
          const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
          pups.forEach((p, i) => {
            const at = f.pos.clone().addScaledVector(side, i ? -1.1 : 1.1).setY(0);
            p.show(at, f.yaw);
            g.fx.smokePuff(at, 22, 0.8);
          });
          g.audio.play('poof');
        }
        if (!spawned) return false;
        const op = o.pos;
        if (!connected) {
          // clones sprint in
          for (const p of pups) {
            p.face(op);
            const d = _v.subVectors(op, p.pos).setY(0);
            const dist = d.length();
            if (dist > 0.9) p.pos.addScaledVector(d.normalize(), Math.min(dist - 0.85, 17 * dt));
            p.run(dt);
            if (Math.random() < 0.3) g.fx.dust(p.pos, 1, 0.5);
            if (!connected && dist < 1.25 && t > 0.25) {
              const res = holdHit(f, o, { dmg: 5, kb: 0, stun: 1.5, sfx: 'hitHeavy', jutsu: true, color: WIND_COL });
              if (res === 'hit') {
                connected = true;
                tc = t;
                g.audio.play('swingHeavy');
              } else if (res === 'blocked') {
                t = 99;
              }
            }
          }
          if (!connected && t > 0.95) {
            pups.forEach((p) => { g.fx.smokePuff(p.pos, 18, 0.7); p.hide(); });
            g.audio.play('poof');
            return true;
          }
          return false;
        }
        const u = t - tc;
        const [A, B] = pups;
        if (stage === 0) {
          // clone A kicks the target up
          A.face(op);
          A.blend(kickPose(), 30, dt);
          B.face(op);
          B.blend(POSES.jumpUp, 20, dt);
          o.pos.y = damp(o.pos.y, 3.2, 8, dt);
          if (u > 0.3) {
            stage = 1;
            holdHit(f, o, { dmg: 4, kb: 0, stun: 1.5, sfx: 'hitHeavy', jutsu: true, color: WIND_COL });
            B.pos.copy(op).addScaledVector(fwd, -0.8).setY(op.y - 0.6);
            g.fx.smokePuff(B.pos, 10, 0.5);
          }
        } else if (stage === 1) {
          B.face(op);
          B.blend(kickPose(), 30, dt);
          B.pos.y = damp(B.pos.y, op.y - 0.4, 10, dt);
          A.blend(POSES.stance, 10, dt);
          o.pos.y = damp(o.pos.y, 6.5, 7, dt);
          if (u > 0.62) {
            stage = 2;
            // the original body-flickers above the target
            g.fx.smokePuff(f.pos, 18, 0.7);
            f.pos.copy(op).addScaledVector(fwd, -0.7).setY(op.y + 1.6);
            f.vel.set(0, 0, 0);
            self.noGravity = true;
            f.faceOpponent();
            g.audio.play('poof');
            g.speedLines(0.5);
          }
        } else if (stage === 2) {
          if (u > 0.78) {
            stage = 3;
            finished = true;
            release(o);
            const res = f.applyHit(o, { dmg: 13, kb: 3, launch: 1, stun: 1, sfx: 'jutsuHit', jutsu: true, color: WIND_COL, burst: true }, o.chestPos(new THREE.Vector3()));
            if (res === 'hit') o.vel.y = -24;
            g.impact(0.06);
            g.shake(0.5);
            self.noGravity = false;
            f.vel.set(-fwd.x * 3, -6, -fwd.z * 3);
            pups.forEach((p) => { g.fx.smokePuff(p.pos, 18, 0.7); p.hide(); });
            g.audio.play('poof');
          }
        }
        return stage === 3 && (f.grounded || u > 1.6);
      },
    };
    return self;
  },

  rasenshuriken(f, g) {
    const orb = makeWindShuriken(0.1);
    g.transient.add(orb);
    let thrown = false;
    g.audio.play('ultCharge');
    const cleanup = () => { if (!thrown) g.transient.remove(orb); };
    return {
      pose: () => (thrown ? POSES.castHand : POSES.skyCall),
      cancel: cleanup,
      update(dt, t) {
        if (!thrown) {
          orb.userData.tick(dt);
          attachToBone(orb, f, 'rHand', new THREE.Vector3(0, 0.9, 0));
          orb.scale.setScalar(Math.min(1.0, 0.1 + t * 0.9));
          for (let i = 0; i < 3; i++) {
            const a = rand(0, Math.PI * 2), r = rand(2, 3);
            _c.setRGB(0.5, 2, 2.6);
            g.fx.glow.spawn({
              x: orb.position.x + Math.cos(a) * r, y: orb.position.y + rand(-1, 1), z: orb.position.z + Math.sin(a) * r,
              vx: -Math.cos(a) * 6, vy: 0, vz: -Math.sin(a) * 6, color: _c, size: 0.2, sizeEnd: 0, life: 0.35,
            });
          }
          if (t >= 1.15) {
            thrown = true;
            f.faceOpponent();
            const dir = aimAt(f);
            g.audio.play('windBlast');
            let grind = 0, ticks = 0, latched = false;
            const pos = orb.position.clone();
            g.transient.remove(orb);
            g.addProjectile(new Projectile(g, f, {
              pos, vel: dir.multiplyScalar(17), radius: 1.1, life: 3, obj: orb, homing: 2.2,
              light: { color: new THREE.Color(0x5ff2ff), intensity: 60, distance: 16 },
              hit: { dmg: 4, kb: 0.5, stun: 0.45, sfx: 'windHit', unblockable: true, jutsu: true, color: WIND_COL },
              onTick(p, dt2) {
                orb.userData.tick(dt2);
                _c.setRGB(0.4, 1.5, 2);
                g.fx.glow.spawn({ x: p.pos.x + rand(-1, 1), y: p.pos.y + rand(-1, 1), z: p.pos.z + rand(-1, 1), color: _c, size: 0.6, sizeEnd: 0, life: 0.3, alpha: 0.6 });
                if (latched) {
                  grind += dt2;
                  const o = f.opponent;
                  o.chestPos(p.pos);
                  p.vel.set(0, 0, 0);
                  orb.scale.setScalar(1 + grind * 0.6);
                  g.shake(0.1);
                  // target escaped with a substitution: detonate harmlessly
                  if (o.invuln > 0.2 && o.state === 'idle') {
                    g.fx.explosion(p.pos, new THREE.Color(0.3, 1.3, 1.8), 1.2);
                    g.audio.play('explosion');
                    p.kill();
                    return;
                  }
                  if (grind > ticks * 0.18 && ticks < 6) {
                    ticks++;
                    f.applyHit(o, { dmg: 3.5, kb: 0.5, stun: 0.45, stop: 0.03, sfx: 'windHit', unblockable: true, jutsu: true, color: WIND_COL }, p.pos.clone());
                  }
                  if (grind > 1.15) {
                    f.applyHit(o, { dmg: 16, kb: 16, launch: 10, stun: 1, sfx: 'explosion', unblockable: true, jutsu: true, color: WIND_COL }, p.pos.clone());
                    g.fx.explosion(p.pos, new THREE.Color(0.3, 1.3, 1.8), 1.8);
                    g.fx.rocks(new THREE.Vector3(p.pos.x, 0.2, p.pos.z), 14, 9);
                    g.shake(0.8);
                    g.impact(0.08);
                    p.kill();
                  }
                }
              },
              onHit(p) {
                if (!latched) {
                  latched = true;
                  p.groundHit = false;
                  p.life = 5;
                  p.homing = 0;
                }
                p.hit = null;
              },
              onExpire(p) {
                g.fx.explosion(p.pos, new THREE.Color(0.3, 1.3, 1.8), 1.2);
                g.audio.play('explosion');
              },
            }));
          }
        }
        return thrown && t > 1.6;
      },
    };
  },

  // ============================== SASUKE ====================================
  chidori(f, g) {
    const bolts = [0, 1, 2].map(() => new Bolt(g.transient, LIGHT_COL.clone().multiplyScalar(1.5), 8));
    let hit = false, hitT = 0, dashing = false;
    const fwd = new THREE.Vector3();
    const light = g.fx.lights.acquire();
    if (light) { light.color.set(0xb88cff); light.distance = 9; }
    g.audio.play('chirp');
    const cleanup = () => {
      bolts.forEach((b) => b.dispose());
      g.fx.lights.release(light);
    };
    return {
      pose: () => (dashing ? POSES.bladeDash : POSES.holdOrb),
      cancel: cleanup,
      update(dt, t) {
        const hand = f.boneWorld('rHand', new THREE.Vector3());
        if (light) { light.position.copy(hand); light.intensity = 25 + Math.random() * 25; }
        for (const b of bolts) {
          const end = hand.clone().add(new THREE.Vector3(rand(-0.7, 0.7), rand(-0.5, 0.7), rand(-0.7, 0.7)));
          b.update(hand, end, 0.35, 0.035, g.camera, 1);
        }
        _c.setRGB(2, 1.6, 4);
        g.fx.glow.spawn({ x: hand.x, y: hand.y, z: hand.z, color: _c, size: 0.6, sizeEnd: 0.1, life: 0.06 });
        if (t >= 0.3 && t < 0.62 && !hit) {
          if (!dashing) {
            dashing = true;
            f.faceOpponent();
            fwd.copy(f.forwardVec());
            f.invuln = 0.3;
            g.audio.play('zap');
          }
          f.vel.x = fwd.x * 30;
          f.vel.z = fwd.z * 30;
          g.fx.glow.spawn({ x: f.pos.x, y: f.pos.y + 1, z: f.pos.z, color: _c.setRGB(1.2, 1, 2.6), size: 1.2, sizeEnd: 0, life: 0.25, alpha: 0.5 });
          const o = f.opponent;
          if (hand.distanceTo(o.chestPos(_v)) < 1.3 || f.distTo(o) < 0.9) {
            const res = f.applyHit(o, { dmg: 15, kb: 10, launch: 3, stun: 0.6, sfx: 'zap', jutsu: true, color: LIGHT_COL }, hand.clone());
            if (res !== 'miss') {
              hit = true;
              hitT = t;
              g.fx.burst(hand, LIGHT_COL, 60, 12, 0.18, 0.4);
              g.fx.lights.flash(hand, new THREE.Color(0xc0a0ff), 80, 16, 0.2);
            }
          }
        } else if (t >= 0.62 || hit) {
          f.vel.x *= 0.82;
          f.vel.z *= 0.82;
        }
        const done = t > 0.85 || (hit && t - hitT > 0.35);
        if (done) cleanup();
        return done;
      },
    };
  },

  /** Phoenix Flower: a fan of small homing fireballs. */
  housenka(f, g) {
    let fired = false;
    g.audio.play('inhale');
    return {
      pose: () => (fired ? POSES.breathOut : POSES.breath),
      update(dt, t) {
        if (!fired) {
          const m = f.boneWorld('head', new THREE.Vector3());
          _c.setRGB(3, 1, 0.2);
          g.fx.glow.spawn({ x: m.x + rand(-0.4, 0.4), y: m.y + rand(-0.3, 0.4), z: m.z + rand(-0.4, 0.4), color: _c, size: 0.1, sizeEnd: 0, life: 0.2 });
        }
        if (!fired && t > 0.3) {
          fired = true;
          f.faceOpponent();
          g.audio.play('fireball');
          const base = aimAt(f, 0.9);
          const mouth = f.boneWorld('head', new THREE.Vector3()).add(f.forwardVec().multiplyScalar(0.4));
          for (let i = 0; i < 5; i++) {
            const a = (i - 2) * 0.2;
            const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
            dir.y += rand(-0.05, 0.15);
            const ball = makeOrb(FIRE_A, FIRE_B, 0.24, { core: 0xffa040, intensity: 2.2, coreScale: 0.5 });
            g.schedule(i * 0.04, () => {
              g.addProjectile(new Projectile(g, f, {
                pos: mouth.clone(), vel: dir.normalize().multiplyScalar(16), radius: 0.3, life: 1.7, obj: ball, homing: 3 + Math.abs(i - 2) * 0.6,
                hit: { dmg: 4, kb: 2.5, stun: 0.38, sfx: 'hit', jutsu: true, color: FIRE_COL },
                onTick(p, dt2) {
                  ball.userData.tick(dt2);
                  spawnFireTrail(g, p.pos, 0.45);
                },
                onHit(p) {
                  g.fx.explosion(p.pos, new THREE.Color(1.6, 0.55, 0.1), 0.35);
                  p.kill();
                },
                onExpire(p) { g.fx.burst(p.pos, new THREE.Color(1.6, 0.55, 0.1), 15, 4, 0.2, 0.4); },
              }));
            });
          }
        }
        return t > 0.7;
      },
    };
  },

  kirin(f, g) {
    const skyBolt = new Bolt(g.transient, LIGHT_COL.clone().multiplyScalar(2), 18);
    let released = false;
    g.audio.play('ultCharge');
    const cleanup = () => skyBolt.dispose();
    return {
      pose: () => POSES.skyCall,
      cancel: cleanup,
      update(dt, t) {
        const hand = f.boneWorld('rHand', new THREE.Vector3());
        if (t < 1.6) skyBolt.update(hand, hand.clone().add(new THREE.Vector3(rand(-1, 1), 30, rand(-1, 1))), 0.06, 0.08, g.camera, 1);
        else skyBolt.hide();
        if (Math.random() < 0.3) g.fx.lights.flash(hand, new THREE.Color(0xb88cff), 30, 10, 0.08);
        if (!released && t >= 1.15) {
          released = true;
          const o = f.opponent;
          const strikes = 6;
          for (let i = 0; i < strikes; i++) {
            const final = i === strikes - 1;
            g.schedule(i * 0.32, () => {
              // aim at where the target is now, with a short telegraph
              const at = new THREE.Vector3(o.pos.x, 0, o.pos.z);
              g.telegraph(at, final ? 3.2 : 1.8, LIGHT_COL, 0.3);
              g.schedule(0.3, () => {
                const b = new Bolt(g.transient, LIGHT_COL.clone().multiplyScalar(final ? 4 : 3), 20);
                const top = at.clone().add(new THREE.Vector3(rand(-3, 3), 40, rand(-3, 3)));
                let life = 0;
                g.addEffect((dt2) => {
                  life += dt2;
                  b.update(top, at, 0.07, final ? 0.5 : 0.25, g.camera, 1 - life / 0.35);
                  if (life > 0.35) { b.dispose(); return false; }
                  return true;
                });
                g.audio.play('thunder');
                g.fx.burst(at.clone().setY(0.3), LIGHT_COL, final ? 100 : 40, final ? 16 : 9, 0.2, 0.6);
                g.fx.waves.spawn(at.clone().setY(0.06), LIGHT_COL.clone().multiplyScalar(2), { size: final ? 8 : 4, life: 0.4 });
                g.fx.lights.flash(at.clone().setY(2), new THREE.Color(0xc8a8ff), final ? 300 : 120, 30, 0.3);
                g.shake(final ? 0.7 : 0.25);
                g.flashScreen(final ? 0.5 : 0.2);
                if (final) g.impact(0.08);
                const dx = o.pos.x - at.x, dz = o.pos.z - at.z;
                const rad = final ? 3.2 : 1.8;
                if (dx * dx + dz * dz < rad * rad) {
                  f.applyHit(o, final
                    ? { dmg: 16, kb: 10, launch: 12, stun: 1, sfx: 'thunder', unblockable: true, jutsu: true, color: LIGHT_COL }
                    : { dmg: 5, kb: 0.5, stun: 0.5, sfx: 'zap', unblockable: true, jutsu: true, color: LIGHT_COL }, o.chestPos(new THREE.Vector3()));
                }
              });
            });
          }
        }
        const done = released && t > 2.0;
        if (done) cleanup();
        return done;
      },
    };
  },

  // ============================== ITACHI ====================================
  goukakyuu(f, g) {
    let fired = false;
    g.audio.play('inhale');
    return {
      pose: () => (fired ? POSES.breathOut : POSES.breath),
      update(dt, t) {
        if (!fired) {
          const m = f.boneWorld('head', new THREE.Vector3());
          _c.setRGB(3, 1, 0.2);
          g.fx.glow.spawn({ x: m.x + rand(-0.5, 0.5), y: m.y + rand(-0.3, 0.5), z: m.z + rand(-0.5, 0.5), color: _c, size: 0.12, sizeEnd: 0, life: 0.2 });
        }
        if (!fired && t > 0.36) {
          fired = true;
          f.faceOpponent();
          const dir = aimAt(f, 0.9);
          const pos = f.boneWorld('head', new THREE.Vector3()).add(f.forwardVec().multiplyScalar(0.45));
          const ball = makeOrb(FIRE_A, FIRE_B, 0.55, { core: 0xffa040, intensity: 2.0, coreScale: 0.5 });
          g.audio.play('fireball');
          g.addProjectile(new Projectile(g, f, {
            pos, vel: dir.multiplyScalar(19), radius: 0.6, life: 1.6, obj: ball, homing: 0.6,
            light: { color: new THREE.Color(0xff7a2a), intensity: 50, distance: 14 },
            hit: { dmg: 14, kb: 9, launch: 4, stun: 0.6, sfx: 'explosion', jutsu: true, color: FIRE_COL },
            onTick(p, dt2) {
              ball.userData.tick(dt2);
              ball.scale.setScalar(0.55 + Math.sin(p.t * 30) * 0.04 + p.t * 0.3);
              spawnFireTrail(g, p.pos, 1.2);
            },
            onHit(p) {
              g.fx.explosion(p.pos, new THREE.Color(1.6, 0.55, 0.1), 1);
              p.kill();
            },
            onExpire(p) {
              g.fx.explosion(p.pos, new THREE.Color(1.6, 0.55, 0.1), 0.8);
              g.audio.play('explosion');
            },
          }));
        }
        return t > 0.75;
      },
    };
  },

  /** Amaterasu: black flames ignite directly on the target, then keep burning. */
  amaterasu(f, g) {
    let cast = false;
    g.audio.play('chirp');
    return {
      pose: () => POSES.castHand,
      update(dt, t) {
        const eye = f.boneWorld('head', new THREE.Vector3());
        eye.y += 0.12;
        _c.setRGB(3, 0.1, 0.1);
        g.fx.glow.spawn({ x: eye.x, y: eye.y, z: eye.z, color: _c, size: 0.25 + t * 0.6, sizeEnd: 0, life: 0.08 });
        if (!cast && t >= 0.32) {
          cast = true;
          f.faceOpponent();
          const o = f.opponent;
          g.audio.play('fireball');
          g.flashScreen(0.15);
          const at = o.chestPos(new THREE.Vector3());
          if (f.distTo(o) < 15) {
            for (let i = 0; i < 40; i++) blackFlame(g, at, 1.4);
            const res = f.applyHit(o, { dmg: 9, kb: 4, launch: 3, stun: 0.6, sfx: 'jutsuHit', unblockable: true, jutsu: true, color: new THREE.Color(1.6, 0.1, 0.3) }, at);
            if (res === 'hit') {
              g.impact(0.05, 'red');
              // lingering burn: chips health without stunning
              let life = 0, tick = 0;
              const pw = f.power;
              g.addEffect((dt2) => {
                life += dt2;
                if (o.state === 'ko' || life > 3) return false;
                const p = o.chestPos(_v);
                p.y -= 0.3;
                for (let i = 0; i < 2; i++) blackFlame(g, p, 0.9);
                if (life > tick * 0.5 + 0.5) {
                  tick++;
                  o.hp = Math.max(1, o.hp - 1.6 * pw);
                  o.flash = 0.6;
                }
                return true;
              });
            }
          } else {
            for (let i = 0; i < 20; i++) blackFlame(g, f.pos.clone().addScaledVector(f.forwardVec(), 6).setY(0.5), 1);
          }
        }
        return t > 0.7;
      },
    };
  },

  /** Tsukuyomi: the world turns crimson and the target is slashed over and over in a genjutsu. */
  tsukuyomi(f, g) {
    const o = f.opponent;
    let engaged = false, t0 = 0, slashes = 0, over = false;
    g.audio.play('ultCharge');
    const end = () => {
      if (over) return;
      over = true;
      g.setTsukuyomi(false);
      if (engaged) release(o);
      if (g.camShot && g.camShot.tag === 'tsukuyomi') g.camShot = null;
    };
    return {
      pose: () => (engaged ? POSES.seal : POSES.castHand),
      cancel: end,
      update(dt, t) {
        const eye = f.boneWorld('head', new THREE.Vector3());
        eye.y += 0.12;
        _c.setRGB(3, 0.15, 0.15);
        if (t < 1.2) g.fx.glow.spawn({ x: eye.x, y: eye.y, z: eye.z, color: _c, size: 0.35, sizeEnd: 0, life: 0.06 });
        if (!engaged && t >= 1.2) {
          if (o.state === 'ko' || o.invuln > 0 || o.state === 'down' || o.state === 'getup' || f.distTo(o) > 18) {
            g.fx.burst(eye, new THREE.Color(2, 0.1, 0.1), 30, 5, 0.15, 0.4);
            return t > 1.5;
          }
          engaged = true;
          t0 = t;
          holdHit(f, o, { dmg: 3, kb: 0, stun: 3, sfx: 'jutsuHit', unblockable: true, jutsu: true, color: new THREE.Color(2.5, 0.1, 0.1) });
          if (o.state !== 'ko') {
            o.held = true;
            o.state = 'hit';
            o.hitStun = 3;
          }
          g.setTsukuyomi(true);
          g.audio.play('thunder');
          g.impact(0.1, 'red');
          const fw = new THREE.Vector3().subVectors(f.pos, o.pos).setY(0).normalize();
          const a0 = Math.atan2(fw.x, fw.z) + 1.3;
          g.camShot = { tag: 'tsukuyomi', look: o.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), lambda: 6, orbit: { center: o.pos.clone(), r: 4.2, a0, speed: 0.5, h: 2.2 } };
        }
        if (engaged && !over) {
          const u = t - t0;
          if (o.state === 'ko') {
            end();
            return true;
          }
          if (u > 0.2 + slashes * 0.13 && slashes < 12) {
            slashes++;
            const at = o.chestPos(new THREE.Vector3()).add(new THREE.Vector3(rand(-0.5, 0.5), rand(-0.6, 0.5), rand(-0.5, 0.5)));
            g.fx.hitSpark(at, new THREE.Color(2.5, 0.2, 0.2), 1.1);
            g.fx.waves.spawn(at, new THREE.Color(3, 0.3, 0.3), { size: 1.6, life: 0.15, flat: false, normal: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize() });
            holdHit(f, o, { dmg: 2.0, kb: 0, stun: 3, stop: 0.02, sfx: slashes % 2 ? 'hit' : 'hitLight', unblockable: true, jutsu: true, color: new THREE.Color(2.5, 0.1, 0.1) }, at);
            if (o.state !== 'ko') o.state = 'hit';
            o.hitFlinchAlt = !o.hitFlinchAlt;
            g.shake(0.12);
          }
          if (u > 2.0) {
            release(o);
            end();
            f.applyHit(o, { dmg: 12, kb: 9, launch: 6, stun: 1, sfx: 'explosion', unblockable: true, jutsu: true, color: new THREE.Color(2.5, 0.1, 0.1), burst: true }, o.chestPos(new THREE.Vector3()));
            g.impact(0.1, 'red');
            g.flashScreen(0.4);
            return true;
          }
          return false;
        }
        return false;
      },
    };
  },

  // ============================== GAARA =====================================
  sandSpears(f, g) {
    return spikeLine(f, g, { kind: 'sand', color: SAND_HIT, sfx: 'rockHit' });
  },

  /** Sand Coffin + Sand Burial: a telegraphed grab at the target's feet. */
  sandCoffin(f, g) {
    const o = f.opponent;
    let at = null, caught = false, crushed = false, tc = 0, shell = null;
    g.audio.play('sand');
    const cleanup = () => {
      if (shell) g.transient.remove(shell);
      if (caught && !crushed) release(o);
    };
    return {
      pose: () => (crushed ? POSES.slam : POSES.castHand),
      poseRate: 14,
      cancel: cleanup,
      update(dt, t) {
        if (!at && t >= 0.12) {
          f.faceOpponent();
          at = new THREE.Vector3(o.pos.x, 0, o.pos.z);
          g.telegraph(at, 1.8, SAND_HIT, 0.45);
        }
        if (!at) return false;
        if (!caught && t < 0.6) sandBurst(g, at, 2, 1.4, 1.5);
        if (!caught && t >= 0.6 && t < 0.65) {
          sandBurst(g, at, 40, 1.2, 6);
          g.audio.play('rumble');
          g.shake(0.25);
          if (Math.hypot(o.pos.x - at.x, o.pos.z - at.z) < 1.9 && o.pos.y < 2.5) {
            const res = holdHit(f, o, { dmg: 5, kb: 0, stun: 2, sfx: 'rockHit', unblockable: true, jutsu: true, color: SAND_HIT });
            if (res === 'hit') {
              caught = true;
              tc = t;
              o.state = 'hit';
              o.hitStun = 2;
              const geo = new THREE.IcosahedronGeometry(0.9, 3);
              const pa = geo.attributes.position;
              for (let i = 0; i < pa.count; i++) {
                _v.fromBufferAttribute(pa, i);
                const n = 1 + Math.sin(_v.x * 9) * Math.cos(_v.y * 7) * 0.08 + rand(-0.03, 0.03);
                pa.setXYZ(i, _v.x * n, _v.y * n * 1.25, _v.z * n);
              }
              geo.computeVertexNormals();
              shell = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xc9a46a }));
              shell.castShadow = true;
              shell.scale.setScalar(0.01);
              g.transient.add(shell);
            }
          }
        }
        if (caught && !crushed) {
          const u = t - tc;
          o.pos.y = damp(o.pos.y, 1.2, 4, dt);
          shell.position.copy(o.pos).add(new THREE.Vector3(0, 1.0, 0));
          shell.scale.setScalar(Math.min(1, u * 4));
          shell.rotation.y += dt * 2;
          if (Math.random() < 0.6) sandBurst(g, shell.position, 1, 0.8, 1);
          if (u > 0.75) {
            crushed = true;
            release(o);
            g.transient.remove(shell);
            shell = null;
            const c = o.chestPos(new THREE.Vector3());
            sandBurst(g, c, 60, 2, 6);
            g.fx.explosion(c, new THREE.Color(1.2, 0.85, 0.4), 0.8);
            g.audio.play('explosion');
            g.impact(0.06);
            g.shake(0.6);
            f.applyHit(o, { dmg: 17, kb: 4, launch: 8, stun: 1, sfx: 'rockHit', unblockable: true, jutsu: true, color: SAND_HIT }, c);
          }
        }
        if (crushed) return t - tc > 1.0;
        return !caught && t > 0.95;
      },
    };
  },

  /** Quicksand Waterfall Flow: a wall of sand sweeps the arena and buries whoever it catches. */
  sandTsunami(f, g) {
    const o = f.opponent;
    let wave = null, caught = false, buried = false, dist = 0, tc = 0, dir = null, origin = null;
    g.audio.play('ultCharge');
    const cleanup = () => {
      if (wave) g.transient.remove(wave);
      wave = null;
      if (caught && !buried) release(o);
    };
    return {
      pose: () => (wave ? POSES.castHand : POSES.seal),
      cancel: cleanup,
      update(dt, t) {
        if (!wave && t < 1.15) {
          sandBurst(g, f.pos.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2))), 2, 1, 3);
        }
        if (!wave && !buried && t >= 1.15) {
          f.faceOpponent();
          dir = f.forwardVec();
          origin = f.pos.clone().setY(0);
          // cross-section of a curling wave (x forward, y up), extruded sideways
          const sh = new THREE.Shape();
          sh.moveTo(-4, 0);
          sh.quadraticCurveTo(-1.2, 0.4, -0.4, 2.8);
          sh.quadraticCurveTo(0.2, 5.4, 2.4, 5.2);
          sh.quadraticCurveTo(3.2, 4.9, 2.6, 4.2);
          sh.quadraticCurveTo(1.4, 4.3, 1.3, 3.0);
          sh.quadraticCurveTo(1.4, 1.2, 2.4, 0);
          sh.lineTo(-4, 0);
          const geo = new THREE.ExtrudeGeometry(sh, { depth: 17, bevelEnabled: false, curveSegments: 10, steps: 24 });
          geo.translate(0, 0, -8.5);
          geo.rotateY(-Math.PI / 2);
          const pa = geo.attributes.position;
          for (let i = 0; i < pa.count; i++) {
            _v.fromBufferAttribute(pa, i);
            const n = Math.sin(_v.x * 1.7) * Math.cos(_v.y * 2.3 + _v.x) * 0.18;
            pa.setXYZ(i, _v.x, Math.max(0, _v.y + n * Math.min(1, _v.y)), _v.z + n);
          }
          geo.computeVertexNormals();
          const mat = new THREE.MeshToonMaterial({ color: 0xc9a46a, side: THREE.DoubleSide });
          wave = new THREE.Mesh(geo, mat);
          wave.castShadow = true;
          wave.rotation.y = Math.atan2(dir.x, dir.z);
          g.transient.add(wave);
          g.audio.play('rumble');
          g.audio.play('sand');
          g.shake(0.4);
        }
        if (wave) {
          dist += dt * (caught ? 6 : 15);
          wave.position.copy(origin).addScaledVector(dir, dist - 2.4);
          const front = origin.clone().addScaledVector(dir, dist);
          wave.scale.y = Math.min(1, (t - 1.15) * 3);
          const side = new THREE.Vector3(-dir.z, 0, dir.x);
          for (let i = 0; i < 10; i++) {
            const s = rand(-8, 8);
            sandBurst(g, front.clone().addScaledVector(side, s).setY(rand(0, 5) * wave.scale.y), 1, 0.4, 3);
          }
          if (Math.random() < 0.4) g.shake(0.12);
          const rel = _v.subVectors(o.pos, origin);
          const along = rel.dot(dir), lat = Math.abs(rel.dot(side));
          if (!caught && Math.abs(along - dist) < 1.4 && lat < 8 && o.state !== 'ko') {
            const res = holdHit(f, o, { dmg: 6, kb: 0, stun: 2, sfx: 'rockHit', unblockable: true, jutsu: true, color: SAND_HIT });
            if (res === 'hit') {
              caught = true;
              tc = t;
            }
          }
          if (caught && !buried) {
            const u = t - tc;
            const hold = front.clone().addScaledVector(dir, -0.5);
            o.pos.x = damp(o.pos.x, hold.x, 8, dt);
            o.pos.z = damp(o.pos.z, hold.z, 8, dt);
            o.pos.y = damp(o.pos.y, 3.5, 3, dt);
            if (u > 0.3 && u < 0.32) holdHit(f, o, { dmg: 5, kb: 0, stun: 2, sfx: 'rockHit', unblockable: true, jutsu: true, color: SAND_HIT });
            if (u > 1.0) {
              buried = true;
              release(o);
              const c = o.chestPos(new THREE.Vector3());
              sandBurst(g, c, 90, 3, 8);
              g.fx.explosion(c, new THREE.Color(1.3, 0.9, 0.4), 1.6);
              g.fx.rocks(c.clone().setY(0.4), 16, 10);
              g.audio.play('explosion');
              g.impact(0.1);
              g.shake(1);
              g.flashScreen(0.3);
              f.applyHit(o, { dmg: 26, kb: 10, launch: 10, stun: 1, sfx: 'rockHit', unblockable: true, jutsu: true, color: SAND_HIT, burst: true }, c);
              g.transient.remove(wave);
              wave = null;
            }
          }
          if (wave && dist > 34) {
            g.transient.remove(wave);
            wave = null;
            return true;
          }
        }
        if (buried) return true;
        return false;
      },
    };
  },

  // ============================== MADARA ====================================
  /** Majestic Destroyer Flame: an enormous cone of fire. */
  gokaMekkyaku(f, g) {
    let landed = false, roared = false;
    const light = g.fx.lights.acquire();
    if (light) { light.color.set(0xff7a2a); light.distance = 20; }
    g.audio.play('inhale');
    const cleanup = () => g.fx.lights.release(light);
    return {
      pose: () => (f.stateT < 0.38 ? POSES.breath : POSES.breathOut),
      cancel: cleanup,
      update(dt, t) {
        const fw = f.forwardVec();
        const mouth = f.boneWorld('head', new THREE.Vector3()).addScaledVector(fw, 0.4);
        if (t >= 0.38 && t < 1.1) {
          if (!roared) {
            roared = true;
            g.audio.play('dragonRoar');
            g.audio.play('fireball');
            g.shake(0.3);
          }
          const reach = Math.min(11, (t - 0.38) * 22);
          const side = new THREE.Vector3(-fw.z, 0, fw.x);
          for (let i = 0; i < 18; i++) {
            const d = rand(0.3, 1);
            const spread = rand(-0.5, 0.5) * d;
            const sp = rand(14, 22);
            const dirv = fw.clone().addScaledVector(side, spread).normalize();
            _c.setRGB(3, rand(0.6, 1.5), 0.15);
            g.fx.glow.spawn({
              x: mouth.x, y: mouth.y + rand(-0.1, 0.1), z: mouth.z,
              vx: dirv.x * sp, vy: rand(-2, 2.5), vz: dirv.z * sp,
              color: _c, size: rand(0.5, 0.9), sizeEnd: rand(2, 3.5), life: rand(0.35, 0.6), drag: 1.6, alpha: 0.7,
            });
          }
          if (Math.random() < 0.4) {
            const p = mouth.clone().addScaledVector(fw, rand(2, reach));
            _c.setRGB(0.12, 0.08, 0.06);
            g.fx.smoke.spawn({ x: p.x, y: p.y + 1, z: p.z, vy: 2, color: _c, size: 1.5, sizeEnd: 4, life: 1.2, alpha: 0.35, drag: 1 });
          }
          if (light) { light.position.copy(mouth).addScaledVector(fw, reach * 0.5); light.intensity = 120; }
          const o = f.opponent;
          if (!landed && t > 0.45) {
            const rel = _v.subVectors(o.pos, f.pos).setY(0);
            const d = rel.length();
            if (d < reach + 0.5 && rel.normalize().dot(fw) > 0.8 && o.pos.y < 4) {
              const res = f.applyHit(o, { dmg: 18, kb: 11, launch: 5, stun: 0.8, sfx: 'explosion', jutsu: true, color: FIRE_COL }, o.chestPos(new THREE.Vector3()));
              if (res !== 'miss') {
                landed = true;
                g.fx.explosion(o.chestPos(new THREE.Vector3()), new THREE.Color(1.6, 0.55, 0.1), 0.8);
              }
            }
          }
        } else if (light) light.intensity *= 0.8;
        const done = t > 1.3;
        if (done) cleanup();
        return done;
      },
    };
  },

  fireDragon(f, g) {
    return fireDragon(f, g, { charge: 0.45, dmg: 19, segCount: 11, scale: 0.7, unblockable: false, life: 2.4, homing: 2.0, ult: false });
  },

  tengaiShinsei(f, g) {
    return meteor(f, g, { size: 4.6, R: 6, dmg: 40, startY: 60, fall: 1.4 });
  },

  // ============================== ROCK LEE ==================================
  /** Leaf Hurricane: a spinning dash of kicks. */
  leafHurricane(f, g) {
    const fwd = new THREE.Vector3();
    let started = false, hits = 0, lastHit = -1;
    g.audio.play('swingHeavy');
    return {
      pose: () => (started ? kickPose() : POSES.dash),
      poseRate: 30,
      update(dt, t) {
        if (!started && t >= 0.1) {
          started = true;
          f.faceOpponent();
          fwd.copy(f.forwardVec());
          g.audio.play('dash');
        }
        if (!started) return false;
        if (t < 0.6) {
          const o = f.opponent;
          const d = f.distTo(o);
          const sp = d > 1.2 ? 15 : 2;
          f.vel.x = fwd.x * sp;
          f.vel.z = fwd.z * sp;
          f.yaw += dt * 26;
          if (Math.random() < 0.6) {
            _c.setRGB(0.5, 1.6, 0.5);
            const foot = f.boneWorld('rFoot', new THREE.Vector3());
            g.fx.glow.spawn({ x: foot.x, y: foot.y, z: foot.z, color: _c, size: 0.4, sizeEnd: 0, life: 0.25, alpha: 0.6 });
          }
          if (Math.random() < 0.4) g.fx.dust(f.pos, 1, 0.8);
          if (d < 1.7 && hits < 3 && t - lastHit > 0.11) {
            const final = hits === 2;
            const res = f.applyHit(o, final
              ? { dmg: 9, kb: 10, launch: 7, stun: 0.7, sfx: 'hitHeavy', jutsu: true, color: LEE_COL, burst: true }
              : { dmg: 4, kb: 1.5, stun: 0.5, sfx: 'hit', jutsu: true, color: LEE_COL }, f.boneWorld('rFoot', new THREE.Vector3()));
            if (res === 'miss') return false;
            hits++;
            lastHit = t;
            if (res === 'blocked') hits = 3;
          }
          return false;
        }
        f.vel.x *= 0.8;
        f.vel.z *= 0.8;
        if (t > 0.6 && t < 0.62) f.faceOpponent();
        return t > 0.78;
      },
    };
  },

  /** Primary Lotus: kick the target skyward, wrap them and pile-drive them into the ground. */
  primaryLotus(f, g) {
    const o = f.opponent;
    const fwd = new THREE.Vector3();
    let stage = 0, tc = 0, done = false;
    const self = {
      noGravity: false,
      pose: () => (stage === 0 ? POSES.dash : stage === 1 ? kickPose() : stage === 2 ? POSES.launched : POSES.slam),
      poseRate: 24,
      cancel() {
        if (stage > 0 && stage < 4) release(o);
      },
      update(dt, t) {
        if (stage === 0) {
          if (t < 0.08) {
            f.faceOpponent();
            fwd.copy(f.forwardVec());
            return false;
          }
          f.vel.x = fwd.x * 20;
          f.vel.z = fwd.z * 20;
          if (Math.random() < 0.5) g.fx.dust(f.pos, 1, 0.6);
          if (f.distTo(o) < 1.3) {
            const res = holdHit(f, o, { dmg: 6, kb: 0, stun: 2, sfx: 'hitHeavy', jutsu: true, color: LEE_COL }, f.boneWorld('rFoot', new THREE.Vector3()));
            if (res === 'hit') {
              stage = 1;
              tc = t;
              f.vel.set(0, 0, 0);
              self.noGravity = true;
              g.audio.play('swingHeavy');
              g.speedLines(0.6);
              return false;
            }
            return true;
          }
          if (t > 0.5) {
            f.vel.multiplyScalar(0.3);
            return true;
          }
          return false;
        }
        const u = t - tc;
        if (stage === 1) {
          // both rise into the sky
          o.pos.y = damp(o.pos.y, 7, 5, dt);
          f.pos.x = damp(f.pos.x, o.pos.x - fwd.x * 0.7, 10, dt);
          f.pos.z = damp(f.pos.z, o.pos.z - fwd.z * 0.7, 10, dt);
          f.pos.y = damp(f.pos.y, o.pos.y - 0.6, 6, dt);
          f.vel.set(0, 0, 0);
          _c.setRGB(0.5, 2, 0.6);
          g.fx.glow.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vy: -6, color: _c, size: 0.6, sizeEnd: 0, life: 0.3, alpha: 0.5 });
          if (u > 0.55) {
            stage = 2;
            f.pos.copy(o.pos).addScaledVector(fwd, -0.4).setY(o.pos.y + 0.3);
            g.audio.play('dash');
          }
        } else if (stage === 2) {
          // spinning nosedive
          f.yaw += dt * 30;
          o.yaw += dt * 30;
          const k = Math.min(1, (u - 0.55) / 0.35);
          const y = 7 * (1 - k * k);
          o.pos.y = y + 0.4;
          f.pos.set(o.pos.x - fwd.x * 0.4, y + 0.9, o.pos.z - fwd.z * 0.4);
          _c.setRGB(1, 2.5, 1);
          g.fx.glow.spawn({ x: o.pos.x, y: o.pos.y + 1, z: o.pos.z, vy: 8, color: _c, size: 0.9, sizeEnd: 0, life: 0.25, alpha: 0.5 });
          if (k >= 1) {
            stage = 3;
            done = true;
            release(o);
            o.pos.y = 0;
            const at = o.pos.clone();
            g.fx.dust(at, 40, 2);
            g.fx.rocks(at.clone().setY(0.3), 18, 9);
            g.fx.waves.spawn(at.clone().setY(0.06), new THREE.Color(1.5, 1.2, 0.8), { size: 6, life: 0.5 });
            g.audio.play('rumble');
            g.audio.play('explosion');
            g.shake(0.9);
            g.impact(0.08);
            f.applyHit(o, { dmg: 21, kb: 3, launch: 2, stun: 1, sfx: 'rockHit', jutsu: true, unblockable: true, color: LEE_COL }, at.clone().setY(0.6));
            self.noGravity = false;
            f.vel.set(-fwd.x * 6, 8, -fwd.z * 6);
            f.faceOpponent();
          }
        }
        return done && u > 1.0 && f.grounded;
      },
    };
    return self;
  },

  /** Morning Peacock: open the sixth gate and bury the target in a fan of burning punches. */
  morningPeacock(f, g) {
    const o = f.opponent;
    const fwd = new THREE.Vector3();
    let stage = 0, tc = 0, punches = 0;
    const jabA = clonePose(POSES.stance), jabB = clonePose(POSES.stance);
    sampleClip(MOVES.jab.keys, 0.08, jabA);
    sampleClip(MOVES.cross.keys, 0.1, jabB);
    g.audio.play('ultCharge');
    const self = {
      noGravity: false,
      pose: () => (stage === 0 ? POSES.seal : stage === 1 ? POSES.dash : stage === 2 ? kickPose() : stage === 3 ? (punches % 2 ? jabA : jabB) : POSES.stance),
      poseRate: 40,
      cancel() {
        if (stage >= 2 && stage < 4) release(o);
        if (g.camShot && g.camShot.tag === 'peacock') g.camShot = null;
        f.resetRim();
      },
      update(dt, t) {
        if (stage === 0) {
          // gates opening: steam + reddening skin
          const k = Math.min(1, t / 1.1);
          f.rig.rim.value.set(1.5, 0.3 + (1 - k) * 1.5, 0.2, 0.6 + k * 1.2);
          _c.setRGB(0.9, 0.95, 0.9);
          g.fx.smoke.spawn({ x: f.pos.x + rand(-0.4, 0.4), y: f.pos.y + rand(0.2, 1.6), z: f.pos.z + rand(-0.4, 0.4), vy: rand(2, 4), color: _c, size: 0.4, sizeEnd: 1.4, life: 0.8, alpha: 0.5, drag: 1 });
          _c.setRGB(k * 2.5 + 0.4, (1 - k) * 2.4 + 0.3, 0.4);
          g.fx.glow.spawn({ x: f.pos.x + rand(-0.6, 0.6), y: f.pos.y + rand(0, 0.3), z: f.pos.z + rand(-0.6, 0.6), vy: rand(3, 6), color: _c, size: 0.35, sizeEnd: 0, life: 0.5 });
          if (Math.random() < 0.15) g.fx.dust(f.pos, 4, 1.2);
          if (t >= 1.15) {
            stage = 1;
            f.faceOpponent();
            fwd.copy(f.forwardVec());
            g.audio.play('dash');
            g.speedLines(0.8);
          }
          return false;
        }
        if (stage === 1) {
          f.vel.x = fwd.x * 28;
          f.vel.z = fwd.z * 28;
          g.fx.dust(f.pos, 1, 0.8);
          if (f.distTo(o) < 1.4) {
            const res = holdHit(f, o, { dmg: 5, kb: 0, stun: 3, sfx: 'hitHeavy', unblockable: true, jutsu: true, color: FIRE_COL });
            if (res === 'hit') {
              stage = 2;
              tc = t;
              f.vel.set(0, 0, 0);
              self.noGravity = true;
              g.impact(0.05);
            } else stage = 5;
          } else if (t > 1.7) stage = 5;
          return false;
        }
        const u = t - tc;
        if (stage === 2) {
          o.pos.y = damp(o.pos.y, 2.8, 6, dt);
          f.pos.y = damp(f.pos.y, 2.0, 6, dt);
          f.pos.x = damp(f.pos.x, o.pos.x - fwd.x * 1.1, 8, dt);
          f.pos.z = damp(f.pos.z, o.pos.z - fwd.z * 1.1, 8, dt);
          f.vel.set(0, 0, 0);
          if (u > 0.4) {
            stage = 3;
            const mid = o.pos.clone().lerp(f.pos, 0.5);
            const a0 = Math.atan2(fwd.x, fwd.z) + 1.4;
            g.camShot = { tag: 'peacock', look: mid.clone().setY(mid.y + 1.4), lambda: 5, orbit: { center: mid.clone().setY(0), r: 6, a0, speed: 0.35, h: 3.2 } };
          }
          return false;
        }
        if (stage === 3) {
          f.vel.set(0, 0, 0);
          f.faceOpponent();
          const c = o.chestPos(new THREE.Vector3());
          // peacock tail: flames bloom in a widening fan behind the target
          const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
          for (let i = 0; i < 4; i++) {
            const a = rand(-1.4, 1.4), r = rand(0.8, 1.2 + (u - 0.4) * 2.5);
            const p = c.clone().addScaledVector(side, Math.sin(a) * r).add(new THREE.Vector3(0, Math.cos(a) * r, 0)).addScaledVector(fwd, 0.6 + rand(0, 0.5));
            fireFlare(g, p, 1.1);
          }
          if (u > 0.4 + punches * 0.055 && punches < 22) {
            punches++;
            const at = c.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)));
            g.fx.hitSpark(at, FIRE_COL, 0.8);
            holdHit(f, o, { dmg: 1.0, kb: 0, stun: 3, stop: 0.015, sfx: punches % 3 ? 'hit' : 'fireball', unblockable: true, jutsu: true, color: FIRE_COL }, at);
            if (o.state === 'ko') stage = 5;
            g.shake(0.1);
          }
          if (u > 1.75) {
            stage = 4;
            release(o);
            if (g.camShot && g.camShot.tag === 'peacock') g.camShot = null;
            const at = o.chestPos(new THREE.Vector3());
            g.fx.explosion(at, new THREE.Color(1.8, 0.6, 0.1), 1.8);
            g.audio.play('explosion');
            g.impact(0.1);
            g.shake(1);
            g.flashScreen(0.4);
            f.applyHit(o, { dmg: 15, kb: 15, launch: 5, stun: 1, sfx: 'explosion', unblockable: true, jutsu: true, color: FIRE_COL, burst: true }, at);
            self.noGravity = false;
          }
          return false;
        }
        // landing / whiff recovery
        self.noGravity = false;
        if (g.camShot && g.camShot.tag === 'peacock') g.camShot = null;
        f.vel.x *= 0.85;
        f.vel.z *= 0.85;
        if (f.grounded && (stage === 5 || u > 2)) {
          f.resetRim();
          return true;
        }
        return false;
      },
    };
    return self;
  },
};
