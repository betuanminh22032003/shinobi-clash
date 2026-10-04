import * as THREE from 'three';
import { buildRig, applyPose, sampleClip, lerpPose, clonePose, updateChains, resetChains, setRigVisible, disposeRig } from './rig.js';
import { POSES, MOVES, runPose, STANCE, COMBO_START } from './poses.js';
import { Trail } from './effects.js';
import { clamp, damp, dampAngle, angleDiff, rand } from './utils.js';
import { ARENA_RADIUS } from './arena.js';
import { JUTSU } from './jutsu.js';

const GRAVITY = 32;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Fighter {
  constructor(def, game, index) {
    this.def = def;
    this.game = game;
    this.index = index;
    this.rig = buildRig(def);
    game.scene.add(this.rig.root);
    this.color = new THREE.Color(def.colors.chakra);

    this.maxHp = Math.round(150 * def.stats.hp);
    this.speed = 7.2 * def.stats.speed;
    this.power = def.stats.power;

    this.pos = this.rig.root.position;
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pose = clonePose(STANCE);
    this.target = clonePose(STANCE);
    this.scratch = clonePose(STANCE);
    this.runPhase = 0;
    this.trails = {
      lHand: new Trail(game.scene, this.color.clone().multiplyScalar(1.6), 0.28),
      rHand: new Trail(game.scene, this.color.clone().multiplyScalar(1.6), 0.28),
      rFoot: new Trail(game.scene, this.color.clone().multiplyScalar(1.6), 0.34),
    };
    this.reset(new THREE.Vector3(), 0);
  }

  reset(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.hp = this.maxHp;
    this.dispHp = this.maxHp;
    this.chakra = 30;
    this.subs = 4;
    this.subTimer = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.move = null;
    this.moveName = null;
    this.hitDone = new Set();
    this.queued = null;
    this.invuln = 0;
    this.grounded = true;
    this.airAttackUsed = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.cooldowns = { throw: 0, dash: 0, special: 0 };
    this.jutsu = null;
    this.flash = 0;
    this.hitFlinchAlt = false;
    this.lastAttacker = null;
    this.frozen = false;
    this.speedMul = 1;
    this.tiltOffset = 0;
    this.applyNow(POSES.stance);
    setRigVisible(this.rig, true);
    this.rig.root.updateMatrixWorld(true);
    resetChains(this.rig);
  }

  dispose() {
    disposeRig(this.rig, this.game.scene);
    for (const t of Object.values(this.trails)) t.ribbon.dispose();
  }

  applyNow(p) {
    lerpPose(this.pose, p, p, 0);
    applyPose(this.rig, this.pose);
  }

  get opponent() {
    return this.game.fighters[1 - this.index];
  }
  get forward() {
    return _w.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  forwardVec(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  boneWorld(name, out = new THREE.Vector3()) {
    return this.rig.J[name].getWorldPosition(out);
  }
  chestPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
  }
  isAirborne() {
    return this.pos.y > 0.01;
  }
  canAct() {
    return this.state === 'idle' || this.state === 'run' || this.state === 'block' || this.state === 'charge';
  }
  faceOpponent(rate = 0, dt = 0) {
    const o = this.opponent;
    const a = Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
    this.yaw = rate ? dampAngle(this.yaw, a, rate, dt) : a;
  }
  distTo(o) {
    return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  // -------------------------------------------------------------------------
  update(dt, input) {
    this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    if (this.subs < 4) {
      this.subTimer += dt;
      if (this.subTimer > 5) {
        this.subTimer = 0;
        this.subs++;
      }
    }
    this.dispHp = damp(this.dispHp, this.hp, 3, dt);

    if (input.attack) this.queued = { k: 'attack', t: 0.25 };
    if (this.queued) {
      this.queued.t -= dt;
      if (this.queued.t <= 0) this.queued = null;
    }

    const st = this.state;
    if (st === 'idle' || st === 'run') this.updateFree(dt, input);
    else if (st === 'air') this.updateAir(dt, input);
    else if (st === 'attack') this.updateAttack(dt, input);
    else if (st === 'block') this.updateBlock(dt, input);
    else if (st === 'charge') this.updateCharge(dt, input);
    else if (st === 'dash') this.updateDash(dt, input);
    else if (st === 'hit') this.updateHit(dt, input);
    else if (st === 'launched') this.updateLaunched(dt, input);
    else if (st === 'down') this.updateDown(dt);
    else if (st === 'getup') this.updateGetup(dt);
    else if (st === 'jutsu') this.updateJutsu(dt, input);
    else if (st === 'ko') this.updateKO(dt);
    else if (st === 'win' || st === 'intro') this.updatePosed(dt);

    this.integrate(dt);
    this.animate(dt);
  }

  // ---- locomotion ----
  updateFree(dt, input) {
    const mv = _v.set(input.mx, 0, input.mz);
    const mag = Math.min(1, mv.length());
    const sp = this.speed * this.speedMul;
    const tx = mag > 0.1 ? (mv.x / (mv.length() || 1)) * sp * mag : 0;
    const tz = mag > 0.1 ? (mv.z / (mv.length() || 1)) * sp * mag : 0;
    this.vel.x = damp(this.vel.x, tx, 14, dt);
    this.vel.z = damp(this.vel.z, tz, 14, dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (mag > 0.1) {
      this.state = 'run';
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 14, dt);
      if (Math.random() < hs * dt * 1.2) this.game.fx.dust(this.pos, 1, 0.5);
    } else {
      this.state = 'idle';
      this.faceOpponent(8, dt);
    }
    if (this.handleActions(input)) return;
  }

  handleActions(input) {
    const g = this.game;
    if (input.jump) {
      this.vel.y = 12;
      this.grounded = false;
      this.airAttackUsed = false;
      this.setState('air');
      g.fx.dust(this.pos, 8, 0.8);
      g.audio.play('jump');
      return true;
    }
    if (input.dash && this.cooldowns.dash <= 0) {
      this.startDash(input);
      return true;
    }
    if (input.ultimate && this.chakra >= 100) {
      this.startJutsu('ultimate');
      return true;
    }
    if (input.special && this.chakra >= 30 && this.cooldowns.special <= 0) {
      this.startJutsu('special');
      return true;
    }
    if (input.ultimate || input.special) g.onNotEnoughChakra(this);
    if (this.queued && this.queued.k === 'attack') {
      this.queued = null;
      this.startMove(COMBO_START);
      return true;
    }
    if (input.shuriken && this.cooldowns.throw <= 0) {
      this.cooldowns.throw = 0.7;
      this.startMove('throw');
      return true;
    }
    if (input.block) {
      this.setState('block');
      return true;
    }
    if (input.charge) {
      this.setState('charge');
      g.audio.startCharge(this.index);
      return true;
    }
    return false;
  }

  updateAir(dt, input) {
    const mv = _v.set(input.mx, 0, input.mz);
    if (mv.lengthSq() > 0.01) {
      mv.normalize().multiplyScalar(this.speed * 0.9);
      this.vel.x = damp(this.vel.x, mv.x, 4, dt);
      this.vel.z = damp(this.vel.z, mv.z, 4, dt);
    }
    this.faceOpponent(6, dt);
    if (this.queued && this.queued.k === 'attack' && !this.airAttackUsed && this.stateT > 0.08) {
      this.queued = null;
      this.airAttackUsed = true;
      this.startMove('diveKick');
      this.faceOpponent();
      const f = this.forwardVec();
      const d = this.distTo(this.opponent);
      const sp = clamp(d * 2.2, 8, 16);
      this.vel.set(f.x * sp, -7, f.z * sp);
      return;
    }
    if (input.dash && this.cooldowns.dash <= 0) {
      this.startDash(input);
    }
  }

  land() {
    this.game.fx.dust(this.pos, 10, 0.9);
    this.game.audio.play('land');
  }

  // ---- attacks ----
  startMove(name) {
    const m = MOVES[name];
    this.move = m;
    this.moveName = name;
    this.hitDone.clear();
    this.setState('attack');
    const o = this.opponent;
    const d = this.distTo(o);
    // soft lock-on: snap to opponent and lunge in if a little out of range
    if (d < 7 && name !== 'getup') this.faceOpponent();
    if (m.lunge && d > 1.2 && d < 6) {
      const f = this.forwardVec();
      const sp = clamp((d - 1.1) * 7, 0, m.lunge * 2.2);
      this.vel.x = f.x * sp;
      this.vel.z = f.z * sp;
    } else if (!m.air) {
      this.vel.x *= 0.3;
      this.vel.z *= 0.3;
    }
    if (m.trail) this.trails[m.trail].active = true;
    this.game.audio.play(name === 'palm' || name === 'roundhouse' ? 'swingHeavy' : 'swing');
    if (name === 'throw') this.thrown = false;
  }

  endMove() {
    if (this.move && this.move.trail) this.trails[this.move.trail].active = false;
    this.move = null;
    this.moveName = null;
    this.setState(this.isAirborne() ? 'air' : 'idle');
  }

  updateAttack(dt, input) {
    const m = this.move;
    const t = this.stateT;
    // friction for lunges
    if (!m.air) {
      this.vel.x = damp(this.vel.x, 0, 9, dt);
      this.vel.z = damp(this.vel.z, 0, 9, dt);
    }
    if (this.moveName === 'throw' && !this.thrown && t >= 0.17) {
      this.thrown = true;
      JUTSU.shuriken(this, this.game);
    }
    for (let i = 0; i < m.hits.length; i++) {
      const h = m.hits[i];
      if (t >= h.t && !this.hitDone.has(i)) {
        this.hitDone.add(i);
        this.tryHit(h);
      }
    }
    if (m.air) {
      // dive kick: active until landing
      if (!this.hitDone.has('dive')) {
        const o = this.opponent;
        const foot = this.boneWorld('rFoot', _v);
        const oc = o.chestPos(new THREE.Vector3());
        oc.y -= 0.3;
        if (foot.distanceTo(oc) < 1.25) {
          this.hitDone.add('dive');
          this.applyHit(o, { dmg: 8, kb: 7, launch: 5, stun: 0.5, sfx: 'hitHeavy' }, foot);
          this.vel.set(-this.forward.x * 4, 8, -this.forward.z * 4);
        }
      }
      if (this.grounded && t > 0.1) {
        this.land();
        this.endMove();
      }
      return;
    }
    // combo chain
    if (m.next && t >= m.cancel && this.queued && this.queued.k === 'attack') {
      this.queued = null;
      if (m.trail) this.trails[m.trail].active = false;
      this.startMove(m.next);
      return;
    }
    if (t >= m.dur) this.endMove();
  }

  tryHit(h) {
    const o = this.opponent;
    _v.subVectors(o.pos, this.pos);
    _v.y = 0;
    const d = _v.length();
    const yDiff = Math.abs(o.pos.y - this.pos.y);
    if (d > h.range || yDiff > 1.6) {
      return false;
    }
    const f = this.forwardVec();
    const ang = Math.acos(clamp(_v.normalize().dot(f), -1, 1));
    if (ang > h.arc) return false;
    const at = this.boneWorld(h.bone || 'rHand', new THREE.Vector3());
    // place the spark between the limb and the opponent's body
    const oc = o.chestPos(new THREE.Vector3());
    at.lerp(oc, 0.4);
    return this.applyHit(o, h, at);
  }

  applyHit(o, h, at) {
    const dir = new THREE.Vector3().subVectors(o.pos, this.pos).setY(0).normalize();
    if (dir.lengthSq() < 0.01) dir.copy(this.forwardVec());
    const res = o.receiveHit({
      attacker: this,
      dmg: h.dmg * this.power,
      kb: h.kb,
      launch: h.launch || 0,
      stun: h.stun,
      dir,
      at,
      sfx: h.sfx,
      unblockable: h.unblockable,
      jutsu: h.jutsu,
      color: h.color,
    });
    if (res === 'hit') {
      this.chakra = Math.min(100, this.chakra + (h.jutsu ? 2 : 5));
      this.combo++;
      this.comboTimer = 1.1;
      if (h.burst) {
        this.game.fx.burst(at, this.color, 40, 10, 0.25, 0.5);
        this.game.fx.waves.spawn(at, this.color.clone().multiplyScalar(2), { size: 3, life: 0.3, flat: false, normal: dir });
      }
    }
    return res;
  }

  receiveHit(h) {
    const g = this.game;
    if (this.state === 'ko' || this.invuln > 0 || this.state === 'down' || this.state === 'getup') return 'miss';
    const facing = this.forwardVec().dot(h.dir) < -0.2;
    if (this.state === 'block' && facing && !h.unblockable) {
      this.hp = Math.max(1, this.hp - h.dmg * 0.12);
      this.vel.addScaledVector(h.dir, Math.min(6, h.kb * 0.6 + 1.5));
      g.fx.blockSpark(h.at);
      g.audio.play('block');
      g.hitstop(0.05);
      g.shake(0.08);
      this.chakra = Math.min(100, this.chakra + 2);
      return 'blocked';
    }
    // interrupt whatever we were doing
    if (this.move && this.move.trail) this.trails[this.move.trail].active = false;
    if (this.jutsu && this.jutsu.cancel) this.jutsu.cancel();
    this.jutsu = null;
    this.move = null;
    g.audio.stopCharge(this.index);

    this.hp = Math.max(0, this.hp - h.dmg);
    this.chakra = Math.min(100, this.chakra + 3);
    this.flash = 1;
    this.lastAttacker = h.attacker;
    const heavy = h.kb > 6 || h.launch > 0;
    const color = h.color || new THREE.Color(1, 0.85, 0.6);
    g.fx.hitSpark(h.at, color, heavy ? 1.6 : 1);
    g.audio.play(h.sfx || (heavy ? 'hitHeavy' : 'hit'));
    g.hitstop(heavy ? 0.11 : 0.06);
    g.shake(heavy ? 0.35 : 0.13);
    g.onHit(h.attacker, this, h);

    if (this.hp <= 0) {
      this.state = 'ko';
      this.stateT = 0;
      this.vel.copy(h.dir).multiplyScalar(Math.max(8, h.kb));
      this.vel.y = Math.max(7, h.launch + 3);
      this.grounded = false;
      g.onKO(this, h.attacker);
      return 'hit';
    }
    this.faceAway(h.dir);
    if (heavy) {
      this.setState('launched');
      this.vel.copy(h.dir).multiplyScalar(h.kb);
      this.vel.y = h.launch || 4;
      this.grounded = false;
    } else {
      this.setState('hit');
      this.hitStun = h.stun;
      this.hitFlinchAlt = !this.hitFlinchAlt;
      this.vel.x = h.dir.x * h.kb;
      this.vel.z = h.dir.z * h.kb;
      if (this.isAirborne()) this.vel.y = Math.max(this.vel.y, 3);
    }
    return 'hit';
  }

  faceAway(dir) {
    this.yaw = Math.atan2(-dir.x, -dir.z);
  }

  trySubstitute(input) {
    if (!input.dash || this.subs < 1 || !this.lastAttacker) return false;
    const a = this.lastAttacker;
    const g = this.game;
    this.subs--;
    this.subTimer = 0;
    g.spawnLog(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), this.yaw);
    g.fx.smokePuff(this.pos, 35, 1);
    const behind = a.forwardVec().multiplyScalar(-1.6).add(a.pos);
    behind.y = 0;
    const r = Math.hypot(behind.x, behind.z);
    if (r > ARENA_RADIUS) behind.multiplyScalar(ARENA_RADIUS / r);
    this.pos.copy(behind);
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.invuln = 0.45;
    this.faceOpponent();
    this.setState('idle');
    g.fx.smokePuff(this.pos, 20, 0.8);
    g.audio.play('poof');
    g.onSubstitute(this);
    // brief vulnerability for the attacker: interrupt their combo
    if (a.state === 'attack' && a.move && !a.move.air) a.endMove();
    return true;
  }

  updateHit(dt, input) {
    this.vel.x = damp(this.vel.x, 0, 7, dt);
    this.vel.z = damp(this.vel.z, 0, 7, dt);
    if (this.trySubstitute(input)) return;
    if (this.stateT >= this.hitStun) this.setState(this.isAirborne() ? 'air' : 'idle');
  }

  updateLaunched(dt, input) {
    if (this.stateT > 0.12 && this.trySubstitute(input)) return;
    if (this.grounded && this.stateT > 0.1) {
      this.setState('down');
      this.game.fx.dust(this.pos, 18, 1.2);
      this.game.audio.play('thud');
      this.game.shake(0.15);
      this.vel.set(this.vel.x * 0.3, 0, this.vel.z * 0.3);
    }
  }

  updateDown(dt) {
    this.vel.x = damp(this.vel.x, 0, 6, dt);
    this.vel.z = damp(this.vel.z, 0, 6, dt);
    if (this.stateT > 0.65) {
      this.move = MOVES.getup;
      this.setState('getup');
      this.invuln = 0.8;
    }
  }

  updateGetup(dt) {
    this.vel.x = damp(this.vel.x, 0, 8, dt);
    this.vel.z = damp(this.vel.z, 0, 8, dt);
    if (this.stateT >= MOVES.getup.dur) {
      this.move = null;
      this.setState('idle');
      this.invuln = 0.25;
    }
  }

  updateKO(dt) {
    if (this.grounded) {
      this.vel.x = damp(this.vel.x, 0, 4, dt);
      this.vel.z = damp(this.vel.z, 0, 4, dt);
      if (!this.koLanded) {
        this.koLanded = true;
        this.game.fx.dust(this.pos, 25, 1.4);
        this.game.audio.play('thud');
      }
    }
  }

  updatePosed(dt) {
    this.vel.x = damp(this.vel.x, 0, 8, dt);
    this.vel.z = damp(this.vel.z, 0, 8, dt);
  }

  updateBlock(dt, input) {
    this.vel.x = damp(this.vel.x, 0, 12, dt);
    this.vel.z = damp(this.vel.z, 0, 12, dt);
    this.faceOpponent(10, dt);
    if (!input.block) {
      this.setState('idle');
      return;
    }
    if (input.dash && this.cooldowns.dash <= 0) this.startDash(input);
    else if (input.jump) this.handleActions(input);
  }

  updateCharge(dt, input) {
    this.vel.x = damp(this.vel.x, 0, 12, dt);
    this.vel.z = damp(this.vel.z, 0, 12, dt);
    this.chakra = Math.min(100, this.chakra + 32 * dt);
    const g = this.game;
    // rising aura
    const c = this.color;
    for (let i = 0; i < 3; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0.3, 0.8);
      g.fx.glow.spawn({
        x: this.pos.x + Math.cos(a) * r, y: this.pos.y + rand(0, 0.4), z: this.pos.z + Math.sin(a) * r,
        vx: -Math.cos(a) * 0.4, vy: rand(2.5, 5), vz: -Math.sin(a) * 0.4,
        color: _w.set(c.r * 2.5, c.g * 2.5, c.b * 2.5), size: rand(0.15, 0.35), sizeEnd: 0.02, life: rand(0.5, 0.9), drag: 1,
      });
    }
    if (Math.random() < dt * 6) g.fx.waves.spawn(new THREE.Vector3(this.pos.x, 0.05, this.pos.z), c.clone().multiplyScalar(1.5), { size: 2.2, life: 0.5 });
    if (!input.charge || this.chakra >= 100) {
      g.audio.stopCharge(this.index);
      this.setState('idle');
      if (this.chakra >= 100) g.audio.play('ready');
      return;
    }
    if (input.block || input.dash || input.jump || input.attack) {
      g.audio.stopCharge(this.index);
      this.setState('idle');
      this.handleActions(input);
    }
  }

  // ---- dash ----
  startDash(input) {
    const g = this.game;
    const mv = new THREE.Vector3(input.mx, 0, input.mz);
    if (mv.lengthSq() < 0.05) {
      mv.subVectors(this.opponent.pos, this.pos).setY(0);
    }
    mv.normalize();
    this.dashDir = mv;
    this.yaw = Math.atan2(mv.x, mv.z);
    this.cooldowns.dash = 0.45;
    this.invuln = Math.max(this.invuln, 0.15);
    this.setState('dash');
    g.fx.smokePuff(this.pos, 10, 0.6);
    g.audio.play('dash');
  }

  updateDash(dt) {
    const sp = 22 * (1 - this.stateT / 0.26) + 4;
    this.vel.x = this.dashDir.x * sp;
    this.vel.z = this.dashDir.z * sp;
    if (this.isAirborne()) this.vel.y = Math.max(this.vel.y, 0);
    const g = this.game;
    const c = this.color;
    g.fx.glow.spawn({
      x: this.pos.x + rand(-0.2, 0.2), y: this.pos.y + rand(0.4, 1.5), z: this.pos.z + rand(-0.2, 0.2),
      color: _w.set(c.r * 1.5, c.g * 1.5, c.b * 1.5), size: 0.5, sizeEnd: 0, life: 0.25, alpha: 0.5,
    });
    if (this.stateT >= 0.26) {
      this.vel.x *= 0.4;
      this.vel.z *= 0.4;
      this.setState(this.isAirborne() ? 'air' : 'idle');
    }
  }

  // ---- jutsu ----
  startJutsu(kind) {
    const g = this.game;
    const cost = kind === 'ultimate' ? 100 : 30;
    this.chakra -= cost;
    if (kind === 'special') this.cooldowns.special = 1.2;
    this.faceOpponent();
    this.vel.set(0, this.vel.y, 0);
    const fn = JUTSU[this.def.element][kind];
    this.jutsu = fn(this, g);
    this.jutsuKind = kind;
    this.setState('jutsu');
    if (kind === 'ultimate') g.startUltimateCinematic(this);
  }

  updateJutsu(dt, input) {
    const j = this.jutsu;
    if (!j) {
      this.setState('idle');
      return;
    }
    const done = j.update(dt, this.stateT);
    if (done) {
      this.jutsu = null;
      this.setState(this.isAirborne() ? 'air' : 'idle');
    }
  }

  // ---- physics ----
  integrate(dt) {
    if (this.frozen) return;
    if (!this.grounded || this.vel.y > 0) {
      const gmul = this.state === 'jutsu' && this.jutsu && this.jutsu.noGravity ? 0 : 1;
      this.vel.y -= GRAVITY * dt * gmul;
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (!this.grounded && this.state === 'air') this.land();
      this.pos.y = 0;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
      if (this.state === 'air') this.setState('idle');
    } else {
      this.grounded = false;
    }
    // arena bounds
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS) {
      this.pos.x *= ARENA_RADIUS / r;
      this.pos.z *= ARENA_RADIUS / r;
    }
  }

  // ---- animation ----
  animate(dt) {
    const t = this.target;
    const st = this.state;
    let rate = 18;
    const time = this.game.time;
    if (st === 'idle') {
      lerpPose(t, POSES.stance, POSES.stance, 0);
      const br = Math.sin(time * 3.2 + this.index);
      t.hipY = POSES.stance.hipY + br * 0.012;
      t.chest = [POSES.stance.chest[0] + br * 0.03, POSES.stance.chest[1], 0];
      t.lFore = [POSES.stance.lFore[0] + br * 0.05, 0, 0];
      rate = 10;
    } else if (st === 'run') {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.runPhase += dt * (6 + hs * 1.1);
      runPose(this.runPhase, this.scratch);
      lerpPose(t, POSES.stance, this.scratch, clamp(hs / 4, 0, 1));
      rate = 14;
    } else if (st === 'air') {
      lerpPose(t, POSES.jumpUp, POSES.fall, clamp(-this.vel.y / 10 + 0.4, 0, 1));
      rate = 10;
    } else if (st === 'attack' || st === 'getup') {
      sampleClip(this.move.keys, this.stateT, t);
      rate = 30;
    } else if (st === 'block') {
      lerpPose(t, POSES.block, POSES.block, 0);
      rate = 30;
    } else if (st === 'charge') {
      lerpPose(t, POSES.seal, POSES.seal, 0);
      t.hipY += Math.sin(time * 30) * 0.004;
      rate = 14;
    } else if (st === 'dash') {
      lerpPose(t, POSES.dash, POSES.dash, 0);
      rate = 25;
    } else if (st === 'hit') {
      const p = this.hitFlinchAlt ? POSES.hitHigh : POSES.hitLow;
      const k = clamp(this.stateT / Math.max(0.01, this.hitStun), 0, 1);
      lerpPose(t, p, POSES.stance, k * k);
      rate = 35;
    } else if (st === 'launched' || (st === 'ko' && !this.grounded)) {
      lerpPose(t, POSES.launched, POSES.launched, 0);
      t.tilt = clamp(-0.4 - this.stateT * 2.2, -1.4, 0);
      rate = 12;
    } else if (st === 'down' || st === 'ko') {
      lerpPose(t, POSES.down, POSES.down, 0);
      rate = 12;
    } else if (st === 'jutsu') {
      const p = this.jutsu && this.jutsu.pose ? this.jutsu.pose() : POSES.seal;
      lerpPose(t, p, p, 0);
      rate = this.jutsu && this.jutsu.poseRate ? this.jutsu.poseRate : 20;
    } else if (st === 'win') {
      lerpPose(t, POSES.win, POSES.win, 0);
      rate = 6;
    } else if (st === 'intro') {
      lerpPose(t, POSES.seal, POSES.seal, 0);
      rate = 10;
    }
    lerpPose(this.pose, this.pose, t, 1 - Math.exp(-rate * dt));
    applyPose(this.rig, this.pose);
    // whole-body pitch; lift a bit when lying so we don't sink into the floor
    const tilt = this.pose.tilt || 0;
    this.rig.tilt.rotation.x = tilt;
    this.rig.tilt.position.y = Math.max(0, -Math.sin(tilt)) * 0.14;
    this.rig.root.rotation.y = this.yaw;

    // hit flash on materials
    const em = this.flash * 0.25;
    this.rig.mats.jacket.emissive.setRGB(em, em, em);
    this.rig.mats.skin.emissive.setRGB(em * 0.8 + 0.035, em * 0.8 + 0.025, em * 0.8 + 0.02);
    const eye = this.rig.mats.eye;
    eye.emissiveIntensity = damp(eye.emissiveIntensity, st === 'jutsu' || st === 'charge' ? 5 : 0.6, 6, dt);
    // invulnerability blink after getting up / substitution
    this.rig.root.visible = !(this.invuln > 0 && st === 'idle' && Math.floor(time * 30) % 2 === 0 && this.invuln < 0.3);
  }

  postUpdate(dt) {
    const cam = this.game.camera;
    this.rig.root.updateMatrixWorld(true);
    for (const [bone, tr] of Object.entries(this.trails)) tr.update(dt, this.boneWorld(bone, _v), cam);
    const wind = new THREE.Vector3(-Math.sin(this.yaw), 0.15, -Math.cos(this.yaw)).multiplyScalar(1).add(new THREE.Vector3(0.6, 0, 0.2));
    updateChains(this.rig, this.game.scene, dt, this.game.time, wind);
  }
}
