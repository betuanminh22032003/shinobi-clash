import * as THREE from 'three';
import { POSES } from './poses.js';
import { energyMaterial } from './effects.js';
import { rand } from './utils.js';

// Awakening (low-HP transformation) visuals and the short transformation jutsu.

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const BONES = ['chest', 'spine', 'head', 'lHand', 'rHand', 'lFoot', 'rFoot', 'lFore', 'rFore', 'hips'];
const orbGeo = new THREE.SphereGeometry(1, 16, 12);

function flames(f, g, col, n = 2, size = 0.35) {
  for (let i = 0; i < n; i++) {
    f.boneWorld(BONES[Math.floor(Math.random() * BONES.length)], _v);
    _c.copy(col).multiplyScalar(rand(1.2, 2.4));
    g.fx.glow.spawn({
      x: _v.x + rand(-0.15, 0.15), y: _v.y + rand(-0.1, 0.1), z: _v.z + rand(-0.15, 0.15),
      vx: rand(-0.3, 0.3), vy: rand(1.5, 3.5), vz: rand(-0.3, 0.3),
      color: _c, size: rand(0.6, 1) * size, sizeEnd: 0.02, life: rand(0.3, 0.55), drag: 1, alpha: 0.7,
    });
  }
}

/** Nine-tails chakra cloak: flickering orange flames and lashing tails of chakra. */
function kyuubi(f, g, col) {
  const mat = energyMaterial(0xff2a04, 0xff9a30, { intensity: 1.2, swirl: 5, opacity: 0.6 });
  const tails = [];
  for (let i = 0; i < 4; i++) {
    const segs = [];
    for (let j = 0; j < 18; j++) {
      const m = new THREE.Mesh(orbGeo, mat);
      g.scene.add(m);
      segs.push(m);
    }
    tails.push(segs);
  }
  const up = new THREE.Vector3(0, 1, 0);
  return {
    update(dt, k) {
      mat.uniforms.uTime.value += dt;
      const fw = f.forwardVec();
      const side = new THREE.Vector3(-fw.z, 0, fw.x);
      const base = f.pos.clone().add(new THREE.Vector3(0, 0.95, 0)).addScaledVector(fw, -0.18);
      const t = g.time;
      tails.forEach((segs, i) => {
        const spread = (i / 3 - 0.5) * 1.7;
        const dir = fw.clone().negate().applyAxisAngle(up, spread);
        segs.forEach((m, j) => {
          const s = (j / (segs.length - 1)) * k;
          m.position.copy(base)
            .addScaledVector(dir, s * 1.6)
            .addScaledVector(up, s * s * 1.5 + Math.sin(t * 4 + i * 1.7 + s * 4) * 0.2 * s)
            .addScaledVector(side, Math.sin(t * 3 + i * 2.3 + s * 5) * 0.3 * s);
          m.scale.setScalar(0.2 * (1 - s * 0.6) * Math.max(0.05, k));
        });
      });
      flames(f, g, col, 3, 0.45);
    },
    dispose() {
      tails.flat().forEach((m) => g.scene.remove(m));
      mat.dispose();
    },
  };
}

/** Ghostly Susanoo ribcage and skull wrapped around the user. */
function susanoo(f, g, col) {
  const c = new THREE.Color(col);
  const mat = energyMaterial(c.clone().multiplyScalar(0.5), c.clone().lerp(new THREE.Color(1, 1, 1), 0.12), { intensity: 1.45, swirl: 2, opacity: 0.75 });
  const root = new THREE.Group();
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    root.add(m);
    return m;
  };
  for (let i = 0; i < 5; i++) {
    const r = 0.62 - Math.abs(i - 1.5) * 0.06;
    const holder = new THREE.Group();
    holder.position.y = 0.95 + i * 0.17;
    holder.rotation.y = -Math.PI / 4;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 32, Math.PI * 1.5), mat);
    rib.rotation.x = -Math.PI / 2;
    holder.add(rib);
    root.add(holder);
  }
  add(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8), 0, 1.3, -0.5);
  const skull = add(new THREE.SphereGeometry(0.42, 18, 14), 0, 2.25, -0.05);
  skull.scale.set(1, 1.15, 1.05);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.22, 12, 10), s * 0.7, 1.85, -0.1);
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.9, 8), s * 0.85, 1.4, -0.05, 0, 0, s * 0.25);
    // horns / crest
    add(new THREE.ConeGeometry(0.07, 0.45, 8), s * 0.2, 2.65, 0, 0.2, 0, s * -0.5);
  }
  root.scale.setScalar(0.01);
  f.rig.root.add(root);
  return {
    update(dt, k) {
      mat.uniforms.uTime.value += dt;
      root.scale.setScalar(Math.max(0.01, k) * 1.4 * (1 + Math.sin(g.time * 3) * 0.015));
      if (Math.random() < 0.6) flames(f, g, c, 1, 0.5);
    },
    dispose() {
      f.rig.root.remove(root);
      root.traverse((o) => o.isMesh && o.geometry.dispose());
      mat.dispose();
    },
  };
}

/** One-Tail: a vortex of sand orbiting the user. */
function shukaku(f, g, col) {
  const c = new THREE.Color(col);
  return {
    update(dt) {
      const t = g.time;
      for (let i = 0; i < 4; i++) {
        const a = t * 4 + i * (Math.PI / 2) + rand(-0.2, 0.2);
        const r = rand(0.8, 1.2);
        _c.setRGB(0.8, 0.64, 0.4).multiplyScalar(rand(0.85, 1.15));
        g.fx.smoke.spawn({
          x: f.pos.x + Math.cos(a) * r, y: f.pos.y + rand(0.1, 2), z: f.pos.z + Math.sin(a) * r,
          vx: -Math.sin(a) * 3, vy: rand(0.2, 1), vz: Math.cos(a) * 3,
          color: _c, size: rand(0.15, 0.3), sizeEnd: 0.5, life: rand(0.4, 0.7), alpha: 0.8, drag: 0.5,
        });
      }
      flames(f, g, c, 1, 0.35);
    },
    dispose() {},
  };
}

/** Eight Gates: green chakra blaze with steam pouring off the body. */
function gates(f, g, col) {
  const c = new THREE.Color(col);
  return {
    update() {
      flames(f, g, c, 3, 0.5);
      if (Math.random() < 0.5) {
        f.boneWorld(BONES[Math.floor(Math.random() * 4)], _v);
        _c.setRGB(0.9, 0.95, 0.9);
        g.fx.smoke.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: rand(1.5, 3), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), color: _c, size: 0.3, sizeEnd: 1.1, life: 0.7, alpha: 0.35, drag: 1 });
      }
    },
    dispose() {},
  };
}

const KINDS = { kyuubi, susanoo, shukaku, gates };

export function createAura(f, g) {
  const a = f.def.awaken;
  const impl = (KINDS[a.kind] || gates)(f, g, new THREE.Color(a.color));
  let k = 0;
  return {
    update(dt) {
      k = Math.min(1, k + dt * 2.5);
      impl.update(dt, k);
    },
    dispose: () => impl.dispose(),
  };
}

/** The transformation itself: a brief invulnerable power-up that blasts the opponent away. */
export function awakenJutsu(f, g) {
  let burst = false;
  g.audio.play('ultCharge');
  const col = new THREE.Color(f.def.awaken.color);
  return {
    pose: () => (burst ? POSES.skyCall : POSES.seal),
    update(dt, t) {
      f.invuln = Math.max(f.invuln, 0.15);
      if (!burst) {
        // chakra gathering inwards
        for (let i = 0; i < 4; i++) {
          const a = rand(0, Math.PI * 2), r = rand(1.5, 2.5);
          _c.copy(col).multiplyScalar(2);
          g.fx.glow.spawn({
            x: f.pos.x + Math.cos(a) * r, y: f.pos.y + rand(0.2, 2), z: f.pos.z + Math.sin(a) * r,
            vx: -Math.cos(a) * 5, vy: 0, vz: -Math.sin(a) * 5, color: _c, size: 0.25, sizeEnd: 0, life: 0.35,
          });
        }
      }
      if (!burst && t >= 0.4) {
        burst = true;
        f.beginAwaken();
        const c = f.chestPos(new THREE.Vector3());
        g.fx.burst(c, col, 120, 16, 0.3, 0.7);
        g.fx.waves.spawn(f.pos.clone().setY(0.06), col.clone().multiplyScalar(2.5), { size: 9, life: 0.5 });
        g.fx.waves.spawn(c, col.clone().multiplyScalar(2), { size: 5, life: 0.35, flat: false, normal: new THREE.Vector3(0, 0.2, 1) });
        g.fx.lights.flash(c, col, 150, 25, 0.5);
        g.fx.dust(f.pos, 30, 2);
        g.audio.play('explosion');
        g.audio.play('dragonRoar');
        g.shake(0.8);
        g.flashScreen(0.35);
        g.impact(0.09);
        g.speedLines(1.2);
        const o = f.opponent;
        if (f.distTo(o) < 4.5) f.applyHit(o, { dmg: 3, kb: 12, launch: 5, stun: 0.6, unblockable: true, jutsu: true, sfx: 'hitHeavy', color: col }, o.chestPos(new THREE.Vector3()));
      }
      return t > 0.95;
    },
  };
}
