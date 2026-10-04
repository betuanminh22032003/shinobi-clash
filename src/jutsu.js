import * as THREE from 'three';
import { POSES } from './poses.js';
import { energyMaterial, Bolt } from './effects.js';
import { rand, clamp } from './utils.js';
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
      game.scene.add(this.obj);
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
      this.g.scene.remove(this.obj);
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
    _c.setRGB(4 + t * 2, 1.2 + t * 1.5, 0.2);
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
const FIRE_A = 0xff3a00, FIRE_B = 0xffd36a;
const LIGHT_COL = new THREE.Color(1.6, 1.3, 3.2);
const EARTH_COL = new THREE.Color(1, 0.7, 0.3);

// ---------------------------------------------------------------------------
// Jutsu definitions. Each returns { update(dt, t) -> done, pose(), cancel() }
// ---------------------------------------------------------------------------
export const JUTSU = {
  shuriken(f, g) {
    const geo = new THREE.BufferGeometry();
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
    const trail = [];
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

  // ============================== WIND ======================================
  wind: {
    special(f, g) {
      const orb = makeOrb(0x1aa8ff, 0x9ff6ff, 0.05, { intensity: 2, core: 0xc8f8ff, coreScale: 0.45 });
      g.scene.add(orb);
      let hit = false, hitT = 0;
      const light = g.fx.lights.acquire();
      if (light) { light.color.set(0x5ff2ff); light.distance = 8; }
      g.audio.play('windCharge');
      const fwd = f.forwardVec();
      const cleanup = () => {
        g.scene.remove(orb);
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
              const res = f.applyHit(o, { dmg: 17, kb: 13, launch: 6, stun: 0.7, sfx: 'jutsuHit', color: new THREE.Color(0.4, 1.8, 2.4), jutsu: true }, orb.position.clone());
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

    ultimate(f, g) {
      const orb = makeWindShuriken(0.1);
      g.scene.add(orb);
      let thrown = false;
      g.audio.play('ultCharge');
      const cleanup = () => { if (!thrown) g.scene.remove(orb); };
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
              g.scene.remove(orb);
              g.addProjectile(new Projectile(g, f, {
                pos, vel: dir.multiplyScalar(17), radius: 1.1, life: 3, obj: orb, homing: 2.2,
                light: { color: new THREE.Color(0x5ff2ff), intensity: 60, distance: 16 },
                hit: { dmg: 4, kb: 0.5, stun: 0.45, sfx: 'windHit', unblockable: true, jutsu: true, color: new THREE.Color(0.4, 1.8, 2.4) },
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
                      f.applyHit(o, { dmg: 3.5, kb: 0.5, stun: 0.45, sfx: 'windHit', unblockable: true, jutsu: true, color: new THREE.Color(0.4, 1.8, 2.4) }, p.pos.clone());
                    }
                    if (grind > 1.15) {
                      f.applyHit(o, { dmg: 16, kb: 16, launch: 10, stun: 1, sfx: 'explosion', unblockable: true, jutsu: true, color: new THREE.Color(0.4, 1.8, 2.4) }, p.pos.clone());
                      g.fx.explosion(p.pos, new THREE.Color(0.3, 1.3, 1.8), 1.8);
                      g.fx.rocks(new THREE.Vector3(p.pos.x, 0.2, p.pos.z), 14, 9);
                      g.shake(0.8);
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
  },

  // ============================== FIRE ======================================
  fire: {
    special(f, g) {
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
            const ball = makeOrb(FIRE_A, FIRE_B, 0.55, { core: 0xffc060, intensity: 2.2, coreScale: 0.5 });
            g.audio.play('fireball');
            g.addProjectile(new Projectile(g, f, {
              pos, vel: dir.multiplyScalar(19), radius: 0.6, life: 1.6, obj: ball, homing: 0.6,
              light: { color: new THREE.Color(0xff7a2a), intensity: 50, distance: 14 },
              hit: { dmg: 14, kb: 9, launch: 4, stun: 0.6, sfx: 'explosion', jutsu: true, color: new THREE.Color(2.5, 1, 0.2) },
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

    ultimate(f, g) {
      let released = false;
      g.audio.play('ultCharge');
      return {
        pose: () => (released ? POSES.breathOut : POSES.breath),
        update(dt, t) {
          if (!released) {
            // swirling fire vortex around the caster
            for (let i = 0; i < 4; i++) {
              const a = t * 8 + i * (Math.PI / 2);
              const r = 1.6 - t * 0.6;
              const p = new THREE.Vector3(f.pos.x + Math.cos(a) * r, f.pos.y + 0.2 + ((t * 3 + i * 0.4) % 2), f.pos.z + Math.sin(a) * r);
              spawnFireTrail(g, p, 0.8);
            }
          }
          if (!released && t >= 1.15) {
            released = true;
            f.faceOpponent();
            g.audio.play('dragonRoar');
            const pos = f.boneWorld('head', new THREE.Vector3()).add(f.forwardVec().multiplyScalar(0.6));
            const dir = aimAt(f, 1).add(new THREE.Vector3(0, 0.5, 0)).normalize();
            const head = makeOrb(FIRE_A, FIRE_B, 1.1, { core: 0xffc870, intensity: 2.3, coreScale: 0.5 });
            // horns/jaw silhouette
            const hornMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.3) });
            for (const s of [-1, 1]) {
              const horn = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 8), hornMat);
              horn.position.set(s * 0.6, 0.6, -0.6);
              horn.rotation.set(-1.0, 0, s * 0.4);
              head.add(horn);
            }
            const segs = [];
            for (let i = 0; i < 18; i++) {
              const s = makeOrb(FIRE_A, FIRE_B, 0.9 * (1 - i / 22), { core: 0xff9a40, intensity: 1.9, coreScale: 0.45 });
              s.position.copy(pos);
              g.scene.add(s);
              segs.push(s);
            }
            const hist = [];
            const cleanup = () => segs.forEach((s) => g.scene.remove(s));
            g.addProjectile(new Projectile(g, f, {
              pos, vel: dir.multiplyScalar(15), radius: 1.3, life: 3.2, obj: head, homing: 2.6, groundHit: false,
              light: { color: new THREE.Color(0xff6a1a), intensity: 120, distance: 24 },
              hit: { dmg: 34, kb: 16, launch: 11, stun: 1, sfx: 'explosion', unblockable: true, jutsu: true, color: new THREE.Color(3, 1.2, 0.2) },
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
                spawnFireTrail(g, p.pos, 2);
                if (Math.random() < 0.5) spawnFireTrail(g, segs[Math.floor(rand(0, segs.length))].position, 1.4);
              },
              onHit(p) {
                g.fx.explosion(p.pos, new THREE.Color(1.8, 0.6, 0.1), 2.2);
                g.fx.rocks(new THREE.Vector3(p.pos.x, 0.2, p.pos.z), 10, 8);
                g.shake(0.9);
                cleanup();
                p.kill();
              },
              onExpire(p) {
                g.fx.explosion(p.pos, new THREE.Color(1.8, 0.6, 0.1), 1.5);
                g.audio.play('explosion');
                cleanup();
              },
            }));
          }
          return released && t > 1.9;
        },
      };
    },
  },

  // ============================== LIGHTNING =================================
  lightning: {
    special(f, g) {
      const bolts = [new Bolt(g.scene, LIGHT_COL.clone().multiplyScalar(1.5), 8), new Bolt(g.scene, LIGHT_COL.clone().multiplyScalar(1.5), 8), new Bolt(g.scene, LIGHT_COL.clone().multiplyScalar(1.5), 8)];
      let hit = false, hitT = 0, dashing = false;
      const fwd = new THREE.Vector3();
      const light = g.fx.lights.acquire();
      if (light) { light.color.set(0xb88cff); light.distance = 9; }
      g.audio.play('chirp');
      const cleanup = () => {
        bolts.forEach((b) => b.dispose());
        g.fx.lights.release(light);
        g.audio.stopLoop('chirp');
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

    ultimate(f, g) {
      const skyBolt = new Bolt(g.scene, LIGHT_COL.clone().multiplyScalar(2), 18);
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
                  const b = new Bolt(g.scene, LIGHT_COL.clone().multiplyScalar(final ? 4 : 3), 20);
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
  },

  // ============================== EARTH =====================================
  earth: {
    special(f, g) {
      let slammed = false;
      g.audio.play('swingHeavy');
      return {
        pose: () => (f.stateT < 0.32 ? POSES.stompUp : POSES.slam),
        poseRate: 16,
        update(dt, t) {
          if (!slammed && t >= 0.38) {
            slammed = true;
            f.faceOpponent();
            g.shake(0.3);
            g.audio.play('rumble');
            g.fx.dust(f.pos, 20, 1.5);
            g.fx.waves.spawn(f.pos.clone().setY(0.05), EARTH_COL.clone(), { size: 3, life: 0.4 });
            const dir = f.forwardVec();
            const start = f.pos.clone();
            let landed = false;
            for (let i = 0; i < 9; i++) {
              g.schedule(i * 0.06, () => {
                const p = start.clone().addScaledVector(dir, 1.4 + i * 1.3);
                if (Math.hypot(p.x, p.z) > ARENA_RADIUS + 1) return;
                g.spawnSpike(p, 1 + i * 0.08);
                const o = f.opponent;
                if (!landed && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 1.3 && o.pos.y < 1.5) {
                  const res = f.applyHit(o, { dmg: 14, kb: 4, launch: 11, stun: 0.7, sfx: 'rockHit', jutsu: true, color: EARTH_COL }, o.chestPos(new THREE.Vector3()).setY(0.6));
                  if (res !== 'miss') landed = true;
                }
              });
            }
          }
          return t > 0.9;
        },
      };
    },

    ultimate(f, g) {
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
            const R = 4.5;
            g.telegraph(at, R, new THREE.Color(2, 0.6, 0.2), 1.25);
            g.audio.play('rumble');
            const rockGeo = new THREE.IcosahedronGeometry(3, 3);
            const posA = rockGeo.attributes.position;
            for (let i = 0; i < posA.count; i++) {
              _v.fromBufferAttribute(posA, i);
              const n = 1 + (Math.sin(_v.x * 2.1) * Math.cos(_v.y * 1.7) * Math.sin(_v.z * 2.3)) * 0.18 + rand(-0.04, 0.04);
              posA.setXYZ(i, _v.x * n, _v.y * n, _v.z * n);
            }
            rockGeo.computeVertexNormals();
            const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 0.95, emissive: 0xff4a10, emissiveIntensity: 0.25 }));
            rock.castShadow = true;
            const startY = 42;
            rock.position.set(at.x + 10, startY, at.z - 6);
            g.scene.add(rock);
            let life = 0;
            g.addEffect((dt2) => {
              life += dt2;
              const k = Math.min(1, life / 1.25);
              rock.position.set(at.x + 10 * (1 - k), startY * (1 - k * k) + 2.5 * k, at.z - 6 * (1 - k));
              rock.rotation.x += dt2 * 2;
              rock.rotation.z += dt2 * 1.3;
              spawnFireTrail(g, rock.position.clone().add(new THREE.Vector3(rand(-2, 2), 2, rand(-2, 2))), 2.5);
              if (k >= 1) {
                g.scene.remove(rock);
                g.fx.explosion(at.clone().setY(1), new THREE.Color(1.6, 0.7, 0.2), 2.4);
                g.fx.rocks(at.clone().setY(0.5), 30, 13);
                for (let i = 0; i < 8; i++) {
                  const a = (i / 8) * Math.PI * 2;
                  g.spawnSpike(at.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3)), 1.6);
                }
                g.audio.play('explosion');
                g.audio.play('rumble');
                g.shake(1.1);
                g.flashScreen(0.35);
                if (Math.hypot(o.pos.x - at.x, o.pos.z - at.z) < R && o.pos.y < 4) {
                  f.applyHit(o, { dmg: 36, kb: 14, launch: 13, stun: 1, sfx: 'rockHit', unblockable: true, jutsu: true, color: EARTH_COL }, o.chestPos(new THREE.Vector3()));
                }
                return false;
              }
              return true;
            });
          }
          return summoned && t > 1.7;
        },
      };
    },
  },
};
