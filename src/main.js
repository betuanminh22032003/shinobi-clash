import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Arena, ARENA_RADIUS } from './arena.js';
import { FX } from './effects.js';
import { Fighter } from './fighter.js';
import { CHARACTERS } from './characters.js';
import { Audio } from './audio.js';
import { HumanController, LAYOUTS, Keys, emptyIntent } from './input.js';
import { AIController } from './ai.js';
import { UI } from './ui.js';
import { damp, rand, clamp } from './utils.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.4 },
    uDim: { value: 0 },
    uFlash: { value: 0 },
    uSat: { value: 1.05 },
    uAberr: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette, uDim, uFlash, uSat, uAberr;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv; vec2 d = uv - 0.5;
      vec3 col;
      if (uAberr > 0.0) {
        col.r = texture2D(tDiffuse, uv + d * uAberr).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - d * uAberr).b;
      } else col = texture2D(tDiffuse, uv).rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= mix(vec3(0.94, 1.0, 1.07), vec3(1.06, 1.0, 0.93), smoothstep(0.0, 1.2, l));
      float r = length(d * vec2(1.0, 0.75));
      col *= 1.0 - uDim * (0.45 + smoothstep(0.15, 0.7, r) * 0.5);
      col *= mix(1.0 - uVignette, 1.0, smoothstep(0.75, 0.2, r));
      col += uFlash;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const tick = () => new Promise((r) => setTimeout(r, 16));

class Game {
  constructor() {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    document.getElementById('app').appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.set(0, 4, 14);
    this.camLook = new THREE.Vector3(0, 1, 0);
    this.camPos = this.camera.position.clone();
    this.camSide = new THREE.Vector3(0, 0, 1);
    this.camShot = null;
    this.shakeAmt = 0;

    this.audio = new Audio();
    this.ui = new UI(this);
    this.time = 0;
    this.realTime = 0;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.flashA = 0;
    this.aberr = 0;
    this.fighters = [];
    this.controllers = [];
    this.projectiles = [];
    this.effects = [];
    this.simTimers = [];
    this.uiTimers = [];
    this.logs = [];
    this.mode = 'loading';
    this.preview = [];
    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.resize());
  }

  async init() {
    const ui = this.ui;
    ui.setLoading(0.05);
    await tick();
    this.arena = new Arena(this.scene, this.renderer);
    ui.setLoading(0.6);
    await tick();
    this.fx = new FX(this.scene);
    this.setupComposer();
    this.resize();
    ui.setLoading(0.75);
    await tick();
    // warm up shaders for every character & effect to avoid hitches mid-fight
    const warm = CHARACTERS.map((c, i) => new Fighter(c, this, i % 2));
    this.fighters = [warm[0], warm[1]];
    warm.forEach((w, i) => w.reset(new THREE.Vector3(i * 2 - 3, 0, 0), 0));
    this.fx.hitSpark(new THREE.Vector3(0, 1, 0), new THREE.Color(1, 1, 1));
    this.fx.smokePuff(new THREE.Vector3(0, 0, 0));
    this.renderer.compile(this.scene, this.camera);
    this.composer.render();
    warm.forEach((w) => w.dispose());
    this.fighters = [];
    this.fx.clear();
    ui.setLoading(1);
    await tick();
    this.loop();
    this.showTitle();
    window.addEventListener('pointerdown', () => this.audio.init(), { once: true });
    window.addEventListener('keydown', () => this.audio.init(), { once: true });
  }

  setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    if (this.fx) this.fx.resize(h * this.renderer.getPixelRatio());
  }

  // ======================= helpers used by fighters & jutsu ==================
  hitstop(t) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }
  shake(a) {
    this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a));
    this.aberr = Math.max(this.aberr, a * 0.012);
  }
  flashScreen(a) {
    this.flashA = Math.max(this.flashA, a);
  }
  schedule(delay, fn) {
    this.simTimers.push({ t: delay, fn });
  }
  after(delay, fn) {
    const h = { t: delay, fn };
    this.uiTimers.push(h);
    return h;
  }
  addEffect(fn) {
    this.effects.push(fn);
  }
  addProjectile(p) {
    this.projectiles.push(p);
  }

  telegraph(pos, radius, color, dur) {
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), mat);
    const fillMat = mat.clone();
    fillMat.opacity = 0.15;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), fillMat);
    const g = new THREE.Group();
    g.add(ring, fill);
    g.rotation.x = -Math.PI / 2;
    g.position.set(pos.x, 0.04, pos.z);
    g.scale.setScalar(radius);
    this.scene.add(g);
    let t = 0;
    this.addEffect((dt) => {
      t += dt;
      const k = t / dur;
      fill.scale.setScalar(Math.min(1, k));
      mat.opacity = 0.5 + Math.sin(t * 40) * 0.3;
      if (k >= 1) {
        this.scene.remove(g);
        return false;
      }
      return true;
    });
  }

  spawnSpike(pos, scale = 1) {
    const geo = new THREE.ConeGeometry(0.55 * scale, 2.4 * scale, 7, 3);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const j = 0.12 * scale * (1 - (y / (2.4 * scale) + 0.5));
      p.setX(i, p.getX(i) + rand(-j, j));
      p.setZ(i, p.getZ(i) + rand(-j, j));
    }
    geo.computeVertexNormals();
    geo.translate(0, 1.2 * scale, 0);
    const m = new THREE.Mesh(geo, this.spikeMat || (this.spikeMat = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 0.95, flatShading: true })));
    m.castShadow = true;
    m.position.set(pos.x, -2.4 * scale, pos.z);
    m.rotation.set(rand(-0.25, 0.25), rand(0, 6), rand(-0.25, 0.25));
    this.scene.add(m);
    this.fx.dust(new THREE.Vector3(pos.x, 0, pos.z), 6, 1);
    this.fx.rocks(new THREE.Vector3(pos.x, 0.3, pos.z), 3, 5);
    let t = 0;
    this.addEffect((dt) => {
      t += dt;
      if (t < 0.09) m.position.y = -2.4 * scale * (1 - t / 0.09);
      else if (t < 0.9) m.position.y = 0;
      else m.position.y = -2.4 * scale * ((t - 0.9) / 0.4);
      if (t > 1.3) {
        this.scene.remove(m);
        geo.dispose();
        return false;
      }
      return true;
    });
  }

  spawnLog(pos, yaw) {
    if (!this.logMat) {
      this.logMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 });
      this.logEndMat = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 });
      this.logGeo = new THREE.CylinderGeometry(0.2, 0.22, 1.1, 12);
    }
    const m = new THREE.Mesh(this.logGeo, [this.logMat, this.logEndMat, this.logEndMat]);
    m.castShadow = true;
    m.position.copy(pos);
    m.rotation.set(0.2, yaw, 0.3);
    this.scene.add(m);
    const v = new THREE.Vector3(rand(-1, 1), 3, rand(-1, 1));
    let t = 0;
    this.addEffect((dt) => {
      t += dt;
      v.y -= 25 * dt;
      m.position.addScaledVector(v, dt);
      if (m.position.y < 0.2) {
        m.position.y = 0.2;
        v.set(v.x * 0.5, Math.abs(v.y) * 0.3, v.z * 0.5);
        m.rotation.z = damp(m.rotation.z, Math.PI / 2, 10, dt);
      } else m.rotation.x += dt * 4;
      if (t > 2.2) {
        this.fx.smokePuff(m.position, 10, 0.5);
        this.scene.remove(m);
        return false;
      }
      return true;
    });
  }

  // ========================== game events ==================================
  onHit(attacker, target) {
    if (this.mode === 'demo') return;
    this.ui.combo(attacker.index, attacker.combo);
  }
  onSubstitute(f) {
    if (this.mode !== 'demo') this.ui.toast(f.index, 'THẾ THÂN!', '#8ee38a');
  }
  onNotEnoughChakra(f) {
    if (this.mode === 'demo' || !this.controllers[f.index]?.human) return;
    if (this.realTime - (this.lastDenied || 0) < 0.5) return;
    this.lastDenied = this.realTime;
    this.ui.toast(f.index, 'KHÔNG ĐỦ CHAKRA', '#ff8a6a');
    this.audio.play('denied');
  }

  startUltimateCinematic(f) {
    const o = f.opponent;
    this.cine = { f, t: 0, dur: 1.15 };
    o.frozen = true;
    if (this.mode !== 'demo') {
      this.ui.letterbox(true);
      this.ui.jutsuBanner(f, true);
    }
    const fw = f.forwardVec();
    const fa = Math.atan2(fw.x, fw.z);
    // frame the caster from the side facing away from the opponent's body
    const toO = new THREE.Vector3().subVectors(o.pos, f.pos);
    const sideSign = new THREE.Vector3(Math.sin(fa + 1.1), 0, Math.cos(fa + 1.1)).dot(toO) > new THREE.Vector3(Math.sin(fa - 1.1), 0, Math.cos(fa - 1.1)).dot(toO) ? -1 : 1;
    this.camShot = {
      look: f.pos.clone().add(new THREE.Vector3(0, 1.3, 0)),
      lambda: 7,
      orbit: { center: f.pos.clone(), r: 3.4, a0: fa + sideSign * 1.1, speed: -sideSign * 0.45, h: 1.25 },
    };
  }

  endCinematic() {
    if (!this.cine) return;
    this.cine.f.opponent.frozen = false;
    this.cine = null;
    this.camShot = null;
    this.ui.letterbox(false);
    this.after(0.6, () => this.ui.jutsuBanner(null, false));
  }

  onKO(loser, winner) {
    this.audio.play('ko');
    this.endCinematic();
    this.timeScale = 0.22;
    this.flashScreen(0.6);
    this.after(1.2, () => (this.timeScale = 1));
    if (this.mode === 'demo') {
      this.after(4, () => this.mode === 'demo' && this.startDemo());
      return;
    }
    if (this.mode === 'training') {
      this.after(2, () => {
        if (this.mode !== 'training') return;
        loser.reset(loser.pos.clone().setY(0), loser.yaw);
        this.fx.smokePuff(loser.pos, 30, 1);
        this.audio.play('poof');
      });
      return;
    }
    if (this.mode !== 'fight') return;
    this.mode = 'roundEnd';
    this.ui.banner('K.O.', 'ko', 2);
    this.camShot = {
      pos: null,
      look: null,
      follow: loser,
      lambda: 3,
    };
    this.after(2.6, () => this.finishRound(winner.index, 'ko'));
  }

  // ============================ flow =======================================
  clearMatch() {
    this.endCinematic();
    for (const f of this.fighters) f.dispose();
    for (const p of this.projectiles) p.kill();
    this.fighters = [];
    this.controllers = [];
    this.projectiles = [];
    this.effects.length = 0;
    this.simTimers.length = 0;
    this.uiTimers.length = 0;
    this.fx.clear();
    this.audio.stopAllCharges();
    this.timeScale = 1;
    this.hitstopT = 0;
    this.camShot = null;
    this.ui.clearBanner();
    this.ui.letterbox(false);
    this.ui.jutsuBanner(null, false);
    this.clearPreview();
  }

  clearPreview() {
    for (const p of this.preview) p.dispose();
    this.preview = [];
  }

  showTitle() {
    this.ui.hud(false);
    this.ui.show('title');
    this.audio.setIntensity(0);
    this.startDemo();
  }

  startDemo() {
    this.clearMatch();
    this.mode = 'demo';
    const a = Math.floor(rand(0, CHARACTERS.length));
    let b = Math.floor(rand(0, CHARACTERS.length - 1));
    if (b >= a) b++;
    this.fighters = [new Fighter(CHARACTERS[a], this, 0), new Fighter(CHARACTERS[b], this, 1)];
    this.fighters[0].reset(new THREE.Vector3(-4, 0, 2), Math.PI / 2);
    this.fighters[1].reset(new THREE.Vector3(4, 0, 2), -Math.PI / 2);
    this.controllers = this.fighters.map((f) => new AIController(f, 'hard'));
    // demo fighters start with some chakra so jutsu show up quickly
    this.fighters.forEach((f) => (f.chakra = 70));
    this.roundTime = 999;
  }

  onMenu(act) {
    if (act === 'controls') this.ui.openControls('title');
    else this.goSelect(act);
  }

  goSelect(mode) {
    this.clearMatch();
    this.mode = 'select';
    this.selMode = mode;
    this.ui.hud(false);
    this.ui.startSelect(mode);
  }

  onSelectHighlight(def, step) {
    const slot = Math.min(step, 1);
    const old = this.preview[slot];
    if (old && old.def === def) return;
    if (old) old.dispose();
    const f = new Fighter(def, this, slot);
    const x = slot === 0 ? 0 : 2.1;
    f.reset(new THREE.Vector3(x, 0, 0), slot === 0 ? 0.35 : -0.35);
    f.setState('win');
    this.fx.smokePuff(f.pos, 25, 0.9);
    this.preview[slot] = f;
    if (slot === 0 && this.preview[1]) {
      this.preview[1].dispose();
      this.preview.length = 1;
    }
  }

  startMatch(cfg) {
    this.clearMatch();
    this.cfg = cfg;
    this.mode = 'intro';
    this.ui.show(null);
    this.ui.hud(true);
    const f1 = new Fighter(cfg.p1, this, 0);
    const f2 = new Fighter(cfg.p2, this, 1);
    this.fighters = [f1, f2];
    const c1 = new HumanController(cfg.mode === 'pvp' ? LAYOUTS.p1 : LAYOUTS.solo, 0);
    c1.human = true;
    let c2;
    if (cfg.mode === 'pvp') {
      c2 = new HumanController(LAYOUTS.p2, 1);
      c2.human = true;
    } else c2 = new AIController(f2, cfg.diff, { passive: cfg.mode === 'training' });
    this.controllers = [c1, c2];
    this.wins = [0, 0];
    this.round = 1;
    this.ui.setupHUD(this.fighters, cfg.mode);
    this.audio.setIntensity(1);
    this.startRound();
  }

  startRound() {
    const [f1, f2] = this.fighters;
    for (const p of this.projectiles) p.kill();
    this.projectiles = [];
    this.effects.length = 0;
    this.simTimers.length = 0;
    this.fx.clear();
    f1.reset(new THREE.Vector3(-5, 0, 0), Math.PI / 2);
    f2.reset(new THREE.Vector3(5, 0, 0), -Math.PI / 2);
    f1.setState('intro');
    f2.setState('intro');
    this.camSide.set(0, 0, 1);
    this.roundTime = 99;
    const training = this.cfg.mode === 'training';
    if (training) {
      this.mode = 'fight';
      f1.setState('idle');
      f2.setState('idle');
      this.ui.banner('LUYỆN TẬP', 'fight', 1.2);
      return;
    }
    this.mode = 'intro';
    const shot = (f, t) => {
      const fw = f.forwardVec();
      const side = new THREE.Vector3(-fw.z, 0, fw.x);
      this.after(t, () => {
        this.camShot = {
          pos: f.pos.clone().addScaledVector(fw, 2.6).addScaledVector(side, -0.8).add(new THREE.Vector3(0, 1.5, 0)),
          look: f.pos.clone().add(new THREE.Vector3(0, 1.35, 0)),
          lambda: 5,
          snap: true,
        };
        this.fx.smokePuff(f.pos, 18, 0.7);
        this.audio.play('poof');
      });
    };
    if (this.round === 1) {
      shot(f1, 0.1);
      shot(f2, 1.3);
    }
    const t0 = this.round === 1 ? 2.5 : 0.3;
    this.after(t0, () => {
      this.camShot = null;
      this.ui.banner(`HIỆP ${this.round}<small>${this.round === 3 ? 'TRẬN QUYẾT ĐỊNH' : 'SẴN SÀNG'}</small>`, '', 1.1);
      this.audio.play('drum');
    });
    this.after(t0 + 1.5, () => {
      this.ui.banner('CHIẾN!', 'fight', 0.7);
      this.audio.play('fight');
      f1.setState('idle');
      f2.setState('idle');
      this.mode = 'fight';
    });
  }

  finishRound(winnerIdx, reason) {
    if (winnerIdx >= 0) this.wins[winnerIdx]++;
    const w = this.fighters[winnerIdx];
    if (w && w.state !== 'ko') {
      w.setState('win');
      this.camShot = { follow: w, front: true, lambda: 3 };
    }
    this.ui.banner(w ? `${w.def.name}<small>${reason === 'time' ? 'HẾT GIỜ — THẮNG HIỆP' : 'THẮNG HIỆP'}</small>` : 'HÒA', '', 1.8);
    const matchOver = this.wins[0] >= 2 || this.wins[1] >= 2 || (this.round >= 3 && this.wins[0] !== this.wins[1]);
    this.after(2.6, () => {
      if (matchOver) {
        const mw = this.fighters[this.wins[0] > this.wins[1] ? 0 : 1];
        this.mode = 'result';
        mw.setState('win');
        this.camShot = { follow: mw, front: true, lambda: 2, orbitSpeed: 0.25 };
        this.ui.hud(false);
        const label = this.cfg.mode === 'cpu' ? (mw.index === 0 ? 'Bạn đã đánh bại máy!' : 'Máy đã chiến thắng — thử lại nhé!') : `Người chơi ${mw.index + 1} thắng ${this.wins[mw.index]} - ${this.wins[1 - mw.index]}`;
        this.ui.result(mw, label);
        this.audio.setIntensity(0);
      } else {
        this.round++;
        this.camShot = null;
        this.startRound();
      }
    });
  }

  onPause(act, btn) {
    if (act === 'resume') this.togglePause(false);
    else if (act === 'restart') {
      this.togglePause(false);
      this.startMatch(this.cfg);
    } else if (act === 'controls') this.ui.openControls('pause');
    else if (act === 'music') {
      this.audio.setMusic(!this.audio.musicOn);
      this.ui.setMusicLabel(this.audio.musicOn);
    } else if (act === 'quit') {
      this.togglePause(false);
      this.showTitle();
    }
  }

  onResult(act) {
    if (act === 'restart') this.startMatch(this.cfg);
    else if (act === 'select') this.goSelect(this.cfg.mode);
    else this.showTitle();
  }

  togglePause(on) {
    this.paused = on;
    this.ui.show(on ? 'pause' : null);
    if (on) this.audio.stopAllCharges();
  }

  // ============================ loop =======================================
  loop() {
    requestAnimationFrame(() => this.loop());
    this.frame(Math.min(this.clock.getDelta(), 1 / 20));
  }

  frame(rdt, render = true) {
    this.realTime += rdt;
    this.handleGlobalKeys();
    this.ui.navigate();

    if (!this.paused) {
      for (let i = this.uiTimers.length - 1; i >= 0; i--) {
        const h = this.uiTimers[i];
        h.t -= rdt;
        if (h.t <= 0) {
          this.uiTimers.splice(i, 1);
          h.fn();
        }
      }
    }

    let dt = this.paused ? 0 : rdt * this.timeScale;
    let simDt = dt;
    if (this.hitstopT > 0 && !this.paused) {
      this.hitstopT -= rdt;
      simDt = 0;
    }
    this.time += simDt;

    if (this.fighters.length === 2) this.updateFight(simDt);
    for (const p of this.preview) {
      p.update(dt, emptyIntent());
      p.postUpdate(dt);
    }
    this.arena.update(dt, this.fx);
    this.fx.update(simDt > 0 ? simDt : dt * 0.15);
    this.updateCamera(rdt, dt);

    if (this.fighters.length === 2 && this.mode !== 'demo' && this.mode !== 'result') {
      this.ui.updateHUD(this.fighters, this.roundTime, this.round, this.wins, this.cfg?.mode === 'training');
    }

    // post fx
    this.flashA = Math.max(0, this.flashA - rdt * 2.5);
    this.aberr = Math.max(0, this.aberr - rdt * 0.05);
    this.grade.uniforms.uFlash.value = this.flashA * 0.8;
    this.grade.uniforms.uAberr.value = this.aberr;
    this.grade.uniforms.uDim.value = damp(this.grade.uniforms.uDim.value, this.cine ? 0.55 : 0, 6, rdt);
    this.grade.uniforms.uSat.value = damp(this.grade.uniforms.uSat.value, this.timeScale < 0.5 ? 0.5 : 1.05, 5, rdt);
    if (render) this.composer.render();
    Keys.endFrame();
  }

  handleGlobalKeys() {
    if (Keys.wasPressed('Escape')) {
      if (this.ui.current === 'controls') this.ui.closeControls();
      else if (this.mode === 'fight' || this.mode === 'intro' || this.mode === 'roundEnd') this.togglePause(!this.paused);
    }
    if (Keys.wasPressed('KeyH') && (this.mode === 'fight' || this.paused)) {
      if (this.ui.current === 'controls') this.ui.closeControls();
      else {
        if (!this.paused) this.togglePause(true);
        this.ui.openControls('pause');
      }
    }
    if (Keys.wasPressed('KeyM')) {
      this.audio.setMusic(!this.audio.musicOn);
      this.ui.setMusicLabel(this.audio.musicOn);
    }
  }

  updateFight(simDt) {
    const [a, b] = this.fighters;
    const active = (this.mode === 'fight' || this.mode === 'demo') && !this.paused;
    if (this.cine) {
      this.cine.t += simDt;
      if (this.cine.t >= this.cine.dur) this.endCinematic();
    }
    if (simDt > 0) {
      for (let i = 0; i < 2; i++) {
        const f = this.fighters[i];
        if (f.frozen) continue;
        const ctrl = this.controllers[i];
        const input = active && ctrl && f.state !== 'ko' && f.state !== 'win' ? ctrl.getInput(this.camera, simDt) : emptyIntent();
        f.update(simDt, input);
      }
      // body collision
      if (a.state !== 'ko' && b.state !== 'ko' && a.state !== 'down' && b.state !== 'down') {
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = 0.85;
        if (d < minD && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          const push = (minD - d) / 2;
          const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
        }
      }
      if (!this.cine) {
        this.projectiles = this.projectiles.filter((p) => p.update(simDt));
      }
      for (let i = this.simTimers.length - 1; i >= 0; i--) {
        const h = this.simTimers[i];
        h.t -= simDt;
        if (h.t <= 0) {
          this.simTimers.splice(i, 1);
          h.fn();
        }
      }
      for (let i = this.effects.length - 1; i >= 0; i--) {
        if (!this.effects[i](simDt)) this.effects.splice(i, 1);
      }
      if (this.mode === 'fight' && !this.cine && this.cfg?.mode !== 'training') {
        this.roundTime -= simDt;
        if (this.roundTime <= 0) this.timeUp();
      }
      if (this.mode === 'training') {
        // unreachable (training uses 'fight'), kept for clarity
      }
      if (this.cfg?.mode === 'training' && this.mode === 'fight') {
        a.chakra = Math.min(100, a.chakra + simDt * 15);
        if (b.state !== 'ko' && b.hp < b.maxHp && b.state === 'idle' && b.comboTimer < -2) b.hp = Math.min(b.maxHp, b.hp + simDt * 30);
      }
    }
    for (const f of this.fighters) f.postUpdate(simDt);
  }

  timeUp() {
    this.mode = 'roundEnd';
    const [a, b] = this.fighters;
    const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
    const w = Math.abs(ra - rb) < 0.001 ? -1 : ra > rb ? 0 : 1;
    this.ui.banner('HẾT GIỜ', 'ko', 1.5);
    this.audio.play('ko');
    this.after(1.8, () => this.finishRound(w, 'time'));
  }

  // ============================ camera =====================================
  updateCamera(rdt, dt) {
    const cam = this.camera;
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    let lambda = 4;

    if (this.mode === 'select') {
      const t = this.realTime * 0.15;
      const two = this.preview.length > 1;
      desiredLook.set(two ? 1.0 : 0.55, 1.05, 0);
      desiredPos.set(Math.sin(t) * 0.6 + (two ? 1.0 : 0.55), 1.3, two ? 5.2 : 3.6);
      lambda = 3;
    } else if (this.camShot) {
      const s = this.camShot;
      lambda = s.lambda || 4;
      if (s.orbit) {
        const o = s.orbit;
        const ang = o.a0 + (this.cine ? this.cine.t : 0) * o.speed;
        desiredPos.set(o.center.x + Math.sin(ang) * o.r, o.h, o.center.z + Math.cos(ang) * o.r);
        desiredLook.copy(s.look);
      } else if (s.follow) {
        const f = s.follow;
        const fw = f.forwardVec();
        const ang = Math.atan2(fw.x, fw.z) + (s.front ? 0.35 : 1.2) + this.realTime * (s.orbitSpeed || 0.08);
        const r = s.front ? 3.6 : 5.5;
        desiredPos.set(f.pos.x + Math.sin(ang) * r, f.pos.y + (s.front ? 1.4 : 2.2), f.pos.z + Math.cos(ang) * r);
        desiredLook.set(f.pos.x, f.pos.y + (s.front ? 1.2 : 0.6), f.pos.z);
      } else {
        desiredPos.copy(s.pos);
        desiredLook.copy(s.look);
        if (s.snap) {
          this.camPos.copy(s.pos).add(new THREE.Vector3(0, 0.3, 0)).addScaledVector(s.pos.clone().sub(s.look).normalize(), 1.2);
          this.camLook.copy(s.look);
          s.snap = false;
        }
      }
    } else if (this.fighters.length === 2) {
      const [a, b] = this.fighters;
      const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(b.pos, a.pos).setY(0);
      const dist = dir.length();
      if (dist > 0.6) {
        const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
        // stay on the same side as the current camera to avoid flips
        const toCam = new THREE.Vector3().subVectors(this.camPos, mid).setY(0);
        if (perp.dot(toCam) < 0) perp.negate();
        this.camSide.lerp(perp, 1 - Math.exp(-3 * rdt)).normalize();
      }
      const back = 6.5 + dist * 0.62;
      desiredPos.copy(mid).addScaledVector(this.camSide, back);
      desiredPos.y = 2.3 + dist * 0.14 + Math.max(a.pos.y, b.pos.y) * 0.4;
      // slight pull toward arena centre for nicer framing of the backdrop
      desiredPos.addScaledVector(mid.clone().setY(0).negate(), 0.08);
      desiredLook.copy(mid).setY(1.1 + Math.max(a.pos.y, b.pos.y) * 0.5);
      lambda = 4.5;
    } else {
      const t = this.realTime * 0.05;
      desiredPos.set(Math.sin(t) * 16, 4, Math.cos(t) * 16);
      desiredLook.set(0, 1, 0);
    }
    // keep camera above water & inside the cliff ring
    desiredPos.y = Math.max(desiredPos.y, 0.6);
    const r = Math.hypot(desiredPos.x, desiredPos.z);
    if (r > 40) desiredPos.multiplyScalar(40 / r);

    const k = 1 - Math.exp(-lambda * rdt);
    this.camPos.lerp(desiredPos, k);
    this.camLook.lerp(desiredLook, Math.min(1, k * 1.5));
    cam.position.copy(this.camPos);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.35;
      cam.position.x += rand(-s, s);
      cam.position.y += rand(-s, s);
      cam.position.z += rand(-s, s);
      this.shakeAmt *= Math.exp(-7 * rdt);
    }
    cam.lookAt(this.camLook);
    const targetFov = this.cine ? 40 : this.mode === 'select' ? 38 : 48;
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      cam.fov = damp(cam.fov, targetFov, 4, rdt);
      cam.updateProjectionMatrix();
    }
    // keep shadow camera centred on the action
    const sun = this.arena.sun;
    const c = this.camLook;
    sun.target.position.set(c.x, 0, c.z);
    sun.position.copy(this.arena.sunDir).multiplyScalar(60).add(sun.target.position);
    sun.position.y = Math.max(sun.position.y, 18);
  }
}

const game = new Game();
window.__game = game;
game.init().then(() => {
  document.getElementById('loading').classList.remove('show');
});
