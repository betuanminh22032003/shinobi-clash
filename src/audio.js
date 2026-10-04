// Fully synthesized sound effects + procedural taiko/koto music (no asset files).
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.charges = {};
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp.connect(this.master).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.comp);
    this.music = ctx.createGain();
    this.music.gain.value = 0.28;
    this.music.connect(this.comp);
    // reverb for space
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeImpulse(2.2);
    const vg = ctx.createGain();
    vg.gain.value = 0.25;
    this.verb.connect(vg).connect(this.comp);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  makeImpulse(sec) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  // ---- primitives ----
  env(g, t, a, peak, dec, sus = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
  }
  noiseHit({ dur = 0.2, type = 'lowpass', f0 = 2000, f1 = 400, q = 1, vol = 0.5, attack = 0.003, verb = 0.3, dest } = {}) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    src.connect(f).connect(g);
    g.connect(dest || this.sfx);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verb);
    }
    src.start(t, Math.random());
    src.stop(t + dur + 0.1);
  }
  tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.3, attack = 0.005, verb = 0.2, delay = 0, dest } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(dest || this.sfx);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verb);
    }
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || !this.enabled) return;
    const S = SOUNDS[name];
    if (S) S(this);
  }
  stopLoop() {}

  startCharge(i) {
    if (!this.ctx || this.charges[i]) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 70 + i * 6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lg = ctx.createGain();
    lg.gain.value = 300;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    f.Q.value = 6;
    lfo.connect(lg).connect(f.frequency);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.2);
    o.connect(f).connect(g);
    n.connect(nf).connect(ng).connect(g);
    g.connect(this.sfx);
    o.start(); lfo.start(); n.start();
    this.charges[i] = { o, lfo, n, g };
  }
  stopCharge(i) {
    const c = this.charges[i];
    if (!c) return;
    const t = this.ctx.currentTime;
    c.g.gain.cancelScheduledValues(t);
    c.g.gain.setValueAtTime(c.g.gain.value, t);
    c.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    c.o.stop(t + 0.2); c.lfo.stop(t + 0.2); c.n.stop(t + 0.2);
    delete this.charges[i];
  }
  stopAllCharges() {
    for (const k of Object.keys(this.charges)) this.stopCharge(k);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.28 : 0, this.ctx.currentTime, 0.3);
  }
  setIntensity(level) {
    this.intensity = level;
  }

  // ---- procedural music: taiko groove + pentatonic koto plucks + drone ----
  startMusic() {
    const ctx = this.ctx;
    this.intensity = 0;
    const bpm = 112;
    const step = 60 / bpm / 4;
    let next = ctx.currentTime + 0.1;
    let i = 0;
    // D minor pentatonic-ish (in scale: D F G A C)
    const scale = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25];
    const phrase = [5, -1, 4, -1, 3, 5, -1, 6, 7, -1, 6, 5, 3, -1, 2, -1, 0, -1, 2, 3, -1, 5, -1, 4, 3, -1, 2, -1, 0, -1, -1, -1];
    const kick = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    const rim = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 73.42;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 260;
    const dg = ctx.createGain();
    dg.gain.value = 0.08;
    drone.connect(df).connect(dg).connect(this.music);
    drone.start();
    const tick = () => {
      while (next < ctx.currentTime + 0.25) {
        const s = i % 16;
        const hot = this.intensity > 0;
        if (kick[s] || (hot && s === 10)) this.taiko(next, 0.9);
        if (rim[s] && hot) this.rim(next);
        if (hot && s % 2 === 1) this.shaker(next);
        const n = phrase[i % phrase.length];
        if (n >= 0 && (i % 2 === 0 || hot)) this.koto(next, scale[n] * (hot && i % 64 >= 32 ? 2 : 1));
        next += step;
        i++;
      }
    };
    this.musicTimer = setInterval(tick, 50);
  }
  taiko(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.music);
    const s = ctx.createGain();
    s.gain.value = 0.3;
    g.connect(s).connect(this.verb);
    o.start(t);
    o.stop(t + 0.5);
  }
  rim(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random());
    src.stop(t + 0.1);
  }
  shaker(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }
  koto(t, freq) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.01, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.music);
    const s = ctx.createGain();
    s.gain.value = 0.5;
    g.connect(s).connect(this.verb);
    o.start(t); o2.start(t);
    o.stop(t + 1); o2.stop(t + 1);
  }
}

const SOUNDS = {
  swing: (a) => a.noiseHit({ type: 'bandpass', f0: 700, f1: 2600, q: 2, dur: 0.13, vol: 0.22, attack: 0.02, verb: 0 }),
  swingHeavy: (a) => a.noiseHit({ type: 'bandpass', f0: 400, f1: 1600, q: 2, dur: 0.22, vol: 0.32, attack: 0.03, verb: 0.1 }),
  hitLight: (a) => {
    a.noiseHit({ f0: 5000, f1: 1500, dur: 0.06, vol: 0.3 });
    a.tone({ type: 'square', f0: 2200, f1: 1400, dur: 0.06, vol: 0.06 });
  },
  hit: (a) => {
    a.noiseHit({ f0: 3500, f1: 500, dur: 0.09, vol: 0.55 });
    a.tone({ f0: 160, f1: 50, dur: 0.14, vol: 0.6 });
  },
  hitHeavy: (a) => {
    a.noiseHit({ f0: 2500, f1: 200, dur: 0.2, vol: 0.7 });
    a.tone({ f0: 120, f1: 35, dur: 0.3, vol: 0.9 });
    a.tone({ type: 'square', f0: 90, f1: 40, dur: 0.12, vol: 0.12 });
  },
  jutsuHit: (a) => {
    SOUNDS.hitHeavy(a);
    a.noiseHit({ type: 'bandpass', f0: 3000, f1: 300, q: 1, dur: 0.5, vol: 0.5, verb: 0.6 });
  },
  block: (a) => {
    a.tone({ type: 'triangle', f0: 1250, dur: 0.18, vol: 0.25, verb: 0.4 });
    a.tone({ type: 'triangle', f0: 1890, dur: 0.12, vol: 0.18 });
    a.noiseHit({ type: 'highpass', f0: 4000, f1: 3000, dur: 0.04, vol: 0.3 });
  },
  jump: (a) => a.noiseHit({ type: 'bandpass', f0: 500, f1: 1400, q: 1.5, dur: 0.15, vol: 0.15, attack: 0.02, verb: 0 }),
  land: (a) => {
    a.tone({ f0: 90, f1: 50, dur: 0.1, vol: 0.3 });
    a.noiseHit({ f0: 800, f1: 200, dur: 0.08, vol: 0.15 });
  },
  thud: (a) => {
    a.tone({ f0: 80, f1: 35, dur: 0.3, vol: 0.8 });
    a.noiseHit({ f0: 1200, f1: 150, dur: 0.25, vol: 0.35 });
  },
  dash: (a) => a.noiseHit({ type: 'bandpass', f0: 1800, f1: 500, q: 1.2, dur: 0.22, vol: 0.3, attack: 0.01, verb: 0.1 }),
  poof: (a) => {
    a.noiseHit({ f0: 3000, f1: 200, dur: 0.4, vol: 0.5, verb: 0.4 });
    a.tone({ f0: 300, f1: 90, dur: 0.15, vol: 0.2 });
  },
  shuriken: (a) => {
    a.tone({ f0: 2600, f1: 1700, dur: 0.25, vol: 0.08 });
    a.noiseHit({ type: 'bandpass', f0: 3000, f1: 2000, q: 6, dur: 0.2, vol: 0.12 });
  },
  windCharge: (a) => a.noiseHit({ type: 'bandpass', f0: 300, f1: 3500, q: 4, dur: 0.5, vol: 0.4, attack: 0.3, verb: 0.3 }),
  windBlast: (a) => {
    a.noiseHit({ f0: 4000, f1: 150, dur: 0.8, vol: 0.8, verb: 0.6 });
    a.tone({ f0: 100, f1: 40, dur: 0.5, vol: 0.7 });
  },
  windHit: (a) => a.noiseHit({ type: 'bandpass', f0: 2500, f1: 900, q: 2, dur: 0.12, vol: 0.4 }),
  inhale: (a) => a.noiseHit({ f0: 300, f1: 1500, dur: 0.35, vol: 0.3, attack: 0.25, verb: 0.1 }),
  fireball: (a) => {
    a.noiseHit({ f0: 1500, f1: 200, dur: 0.7, vol: 0.6, attack: 0.02, verb: 0.4 });
    a.tone({ type: 'sawtooth', f0: 90, f1: 50, dur: 0.5, vol: 0.15 });
  },
  explosion: (a) => {
    a.noiseHit({ f0: 1800, f1: 60, dur: 1.4, vol: 0.9, verb: 0.8 });
    a.tone({ f0: 70, f1: 25, dur: 0.9, vol: 1 });
  },
  dragonRoar: (a) => {
    a.tone({ type: 'sawtooth', f0: 140, f1: 60, dur: 1.4, vol: 0.25, attack: 0.1, verb: 0.6 });
    a.tone({ type: 'sawtooth', f0: 147, f1: 64, dur: 1.4, vol: 0.2, attack: 0.1 });
    a.noiseHit({ f0: 2500, f1: 300, dur: 1.5, vol: 0.6, attack: 0.1, verb: 0.6 });
  },
  chirp: (a) => {
    for (let i = 0; i < 10; i++) {
      a.tone({ type: 'square', f0: 2500 + Math.random() * 2500, f1: 1500, dur: 0.05, vol: 0.05, delay: i * 0.07, verb: 0 });
    }
    a.noiseHit({ type: 'highpass', f0: 5000, f1: 3000, dur: 0.8, vol: 0.25, attack: 0.05 });
  },
  zap: (a) => {
    a.tone({ type: 'square', f0: 1800, f1: 120, dur: 0.18, vol: 0.18 });
    a.noiseHit({ type: 'highpass', f0: 6000, f1: 2000, dur: 0.15, vol: 0.4 });
  },
  thunder: (a) => {
    a.noiseHit({ type: 'highpass', f0: 3000, f1: 800, dur: 0.12, vol: 0.8, verb: 0.3 });
    a.noiseHit({ f0: 900, f1: 40, dur: 2.2, vol: 0.9, attack: 0.03, verb: 1 });
    a.tone({ f0: 60, f1: 28, dur: 1, vol: 0.7 });
  },
  rumble: (a) => {
    a.noiseHit({ f0: 220, f1: 60, dur: 1.4, vol: 0.9, attack: 0.1, verb: 0.4 });
    a.tone({ f0: 45, f1: 30, dur: 1.2, vol: 0.6, attack: 0.1 });
  },
  rockHit: (a) => {
    SOUNDS.hitHeavy(a);
    a.noiseHit({ f0: 1200, f1: 150, dur: 0.4, vol: 0.6, verb: 0.3 });
  },
  ultCharge: (a) => {
    a.tone({ type: 'sawtooth', f0: 110, f1: 440, dur: 1.15, vol: 0.12, attack: 0.3, verb: 0.6 });
    a.tone({ type: 'sawtooth', f0: 165, f1: 660, dur: 1.15, vol: 0.08, attack: 0.3 });
    a.noiseHit({ type: 'bandpass', f0: 200, f1: 4000, q: 3, dur: 1.15, vol: 0.4, attack: 0.8, verb: 0.5 });
  },
  ready: (a) => {
    a.tone({ type: 'triangle', f0: 880, dur: 0.25, vol: 0.15, verb: 0.5 });
    a.tone({ type: 'triangle', f0: 1318, dur: 0.4, vol: 0.15, delay: 0.1, verb: 0.5 });
  },
  ko: (a) => {
    for (const [f, v] of [[110, 0.5], [220, 0.3], [331, 0.2], [523, 0.12], [740, 0.08]]) a.tone({ f0: f, dur: 3, vol: v, attack: 0.005, verb: 0.9 });
    a.noiseHit({ f0: 1500, f1: 100, dur: 0.8, vol: 0.5, verb: 0.8 });
  },
  drum: (a) => {
    a.tone({ f0: 110, f1: 45, dur: 0.5, vol: 1, verb: 0.6 });
    a.noiseHit({ f0: 1200, f1: 200, dur: 0.15, vol: 0.4 });
  },
  fight: (a) => {
    SOUNDS.drum(a);
    a.noiseHit({ type: 'bandpass', f0: 500, f1: 4000, q: 1, dur: 0.6, vol: 0.4, attack: 0.05, verb: 0.6 });
  },
  menu: (a) => a.tone({ type: 'triangle', f0: 660, dur: 0.06, vol: 0.12, verb: 0.2 }),
  confirm: (a) => {
    a.tone({ type: 'triangle', f0: 660, dur: 0.1, vol: 0.15 });
    a.tone({ type: 'triangle', f0: 990, dur: 0.2, vol: 0.15, delay: 0.07, verb: 0.4 });
  },
  denied: (a) => a.tone({ type: 'square', f0: 180, f1: 140, dur: 0.12, vol: 0.06 }),
};
