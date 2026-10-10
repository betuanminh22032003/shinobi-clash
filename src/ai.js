import { emptyIntent } from './input.js';
import { rand } from './utils.js';

const LEVELS = {
  easy: { react: 0.45, aggro: 0.35, block: 0.15, sub: 0.12, jutsu: 0.25, combo: 0.5 },
  normal: { react: 0.26, aggro: 0.6, block: 0.4, sub: 0.35, jutsu: 0.5, combo: 0.8 },
  hard: { react: 0.12, aggro: 0.85, block: 0.65, sub: 0.6, jutsu: 0.8, combo: 1.0 },
};

export class AIController {
  constructor(fighter, level = 'normal', { passive = false } = {}) {
    this.f = fighter;
    this.cfg = LEVELS[level] || LEVELS.normal;
    this.passive = passive;
    this.think = 0;
    this.plan = 'approach';
    this.planT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.blockT = 0;
    this.chargeT = 0;
    this.lastHitState = null;
    this.comboPresses = 0;
  }

  getInput(_camera, dt) {
    const out = emptyIntent();
    const f = this.f, o = f.opponent, g = f.game;
    if (this.passive) {
      // training dummy: just stand and face
      return out;
    }
    const c = this.cfg;
    this.think -= dt;
    this.planT -= dt;
    this.blockT -= dt;

    const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;

    // substitution when getting comboed
    const tookHit = this.prevHp !== undefined && f.hp < this.prevHp;
    this.prevHp = f.hp;
    if (f.state === 'hit' || f.state === 'launched') {
      if (tookHit) {
        this.hitsTaken = (this.hitsTaken || 0) + 1;
        this.wantSub = f.subs > 0 && Math.random() < c.sub * (this.hitsTaken > 1 ? 1.5 : 0.6);
        this.subDelay = rand(0.05, 0.25);
      }
      if (this.wantSub && f.stateT > this.subDelay) {
        this.hitsTaken = 0;
        this.wantSub = false;
        out.dash = true;
      }
      return out;
    }
    this.hitsTaken = 0;

    // hold block
    if (this.blockT > 0) {
      out.block = true;
      return out;
    }
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      out.charge = true;
      if (dist < 6 || f.chakra >= 100) this.chargeT = 0;
      return out;
    }

    // dodge incoming projectiles
    for (const p of g.projectiles) {
      if (p.owner === f || p.dead) continue;
      const px = f.pos.x - p.pos.x, pz = f.pos.z - p.pos.z;
      const pd = Math.hypot(px, pz);
      const toward = (p.vel.x * px + p.vel.z * pz) / (pd * (p.vel.length() || 1));
      if (pd < 7 && toward > 0.8 && Math.random() < c.block * dt * 12) {
        if (Math.random() < 0.5) {
          out.dash = true;
          out.mx = -p.vel.z;
          out.mz = p.vel.x;
        } else if (p.radius < 0.8) {
          this.blockT = 0.4;
          out.block = true;
        } else out.jump = true;
        return out;
      }
    }

    // react to opponent attacks
    if ((o.state === 'attack' || o.state === 'jutsu') && dist < 3 && this.think <= 0) {
      this.think = c.react;
      if (Math.random() < c.block) {
        this.blockT = rand(0.25, 0.55);
        out.block = true;
        return out;
      }
    }

    if (f.state === 'attack') {
      // continue combo
      if (Math.random() < c.combo * dt * 14 && dist < 2.6) out.attack = true;
      // occasionally cut the string into a jutsu for a real combo
      if (o.state === 'hit' && f.chakra >= 30 && Math.random() < c.jutsu * dt * 2.5) out[Math.random() < 0.5 ? 'special' : 'special2'] = true;
      return out;
    }

    if (this.think > 0) {
      // keep executing the current plan
      return this.executePlan(out, dist, nx, nz, dt);
    }
    this.think = c.react * rand(0.6, 1.4);

    // decide
    if (f.canAwaken() && Math.random() < c.jutsu * 0.7) {
      out.awaken = true;
      return out;
    }
    if (f.chakra >= 100 && dist < 12 && o.state !== 'down' && Math.random() < c.jutsu) {
      out.ultimate = true;
      return out;
    }
    if (f.chakra >= 30 && dist > 3 && dist < 11 && Math.random() < c.jutsu * 0.35) {
      out[Math.random() < 0.5 ? 'special' : 'special2'] = true;
      return out;
    }
    if (f.chakra < 35 && dist > 9 && Math.random() < 0.3) {
      this.chargeT = rand(0.8, 1.6);
      out.charge = true;
      return out;
    }
    const r = Math.random();
    if (dist > 7) this.plan = r < 0.25 ? 'shuriken' : r < 0.55 ? 'dashIn' : 'approach';
    else if (dist > 2.4) this.plan = r < c.aggro ? 'approach' : r < c.aggro + 0.15 ? 'jumpIn' : 'strafe';
    else this.plan = r < c.aggro ? 'attack' : r < c.aggro + 0.2 ? 'strafe' : 'retreat';
    if (Math.random() < 0.3) this.strafe *= -1;
    this.planT = rand(0.4, 1.2);
    return this.executePlan(out, dist, nx, nz, dt);
  }

  executePlan(out, dist, nx, nz) {
    const f = this.f;
    switch (this.plan) {
      case 'approach':
        out.mx = nx; out.mz = nz;
        if (dist < 2.0) this.plan = 'attack';
        break;
      case 'dashIn':
        out.dash = true;
        out.mx = nx; out.mz = nz;
        this.plan = 'approach';
        break;
      case 'jumpIn':
        out.mx = nx; out.mz = nz;
        if (f.grounded) out.jump = true;
        else if (dist < 4) out.attack = true;
        break;
      case 'shuriken':
        out.shuriken = true;
        this.plan = 'approach';
        break;
      case 'strafe':
        out.mx = -nz * this.strafe + nx * 0.2;
        out.mz = nx * this.strafe + nz * 0.2;
        break;
      case 'retreat':
        out.mx = -nx; out.mz = -nz;
        if (dist > 4) this.plan = 'approach';
        break;
      case 'attack':
        if (dist > 2.6) {
          out.mx = nx; out.mz = nz;
        } else out.attack = true;
        break;
    }
    return out;
  }
}
