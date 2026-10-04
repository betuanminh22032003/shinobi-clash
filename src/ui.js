import { CHARACTERS } from './characters.js';
import { Keys } from './input.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor(game) {
    this.g = game;
    this.screens = ['loading', 'title', 'select', 'pause', 'result', 'controls'];
    this.activeMenu = null;
    this.bannerTimer = null;
    this.toastTimers = [null, null];
    this.comboTimers = [null, null];
    this.lastCombo = [0, 0];
    this.bindMenus();
    this.buildCards();
  }

  // ---------------- screens ----------------
  show(id) {
    for (const s of this.screens) $(s).classList.toggle('show', s === id);
    const menus = { title: 'mainMenu', pause: 'pauseMenu', result: 'resultMenu', controls: 'controls' };
    this.activeMenu = menus[id] ? $(menus[id]) : null;
    this.current = id;
  }
  overlay(id, on) {
    $(id).classList.toggle('show', on);
  }
  hud(on) {
    $('hud').classList.toggle('hidden', !on);
  }
  setLoading(p) {
    $('loadFill').style.width = `${Math.round(p * 100)}%`;
  }

  bindMenus() {
    const handle = (menuId, fn) => {
      $(menuId).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.g.audio.init();
        this.g.audio.play('confirm');
        fn(b.dataset.act, b);
      });
      $(menuId).addEventListener('mouseover', (e) => {
        const b = e.target.closest('button');
        if (!b || b.classList.contains('sel')) return;
        $(menuId).querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this.g.audio.play('menu');
      });
    };
    handle('mainMenu', (a) => this.g.onMenu(a));
    handle('pauseMenu', (a, b) => this.g.onPause(a, b));
    handle('resultMenu', (a) => this.g.onResult(a));
    $('controls').addEventListener('click', (e) => {
      if (e.target.closest('button')) this.closeControls();
    });
    $('diffRow').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.setDiff(b.dataset.diff);
      this.g.audio.play('menu');
    });
  }

  openControls(back) {
    this.controlsBack = back;
    this.show('controls');
  }
  closeControls() {
    this.show(this.controlsBack || 'title');
  }

  /** keyboard navigation for the active menu; called every frame */
  /** Maps gamepad edges onto virtual key codes so menus work with a controller. */
  padKeys() {
    const out = new Set();
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    this.padPrev = this.padPrev || {};
    for (const gp of pads) {
      const prev = this.padPrev[gp.index] || [];
      const b = gp.buttons.map((x) => x.pressed);
      const ay = gp.axes[1] || 0, ax = gp.axes[0] || 0;
      b[20] = ay < -0.6; b[21] = ay > 0.6; b[22] = ax < -0.6; b[23] = ax > 0.6;
      const edge = (i) => b[i] && !prev[i];
      if (edge(12) || edge(20)) out.add('ArrowUp');
      if (edge(13) || edge(21)) out.add('ArrowDown');
      if (edge(14) || edge(22)) out.add('ArrowLeft');
      if (edge(15) || edge(23)) out.add('ArrowRight');
      if (edge(0)) out.add('Enter');
      if (edge(1)) out.add('Escape');
      if (edge(9)) out.add('Start');
      this.padPrev[gp.index] = b;
    }
    return out;
  }

  navigate() {
    const pk = this.padKeys();
    this.lastPad = pk;
    const pressed = (...c) => c.some((k) => Keys.wasPressed(k) || pk.has(k));
    if (this.current === 'select') return this.navigateSelect(pressed);
    const m = this.activeMenu;
    if (!m) return;
    const btns = [...m.querySelectorAll('button:not(.hidden)')];
    if (!btns.length) return;
    let i = btns.findIndex((b) => b.classList.contains('sel'));
    const row = m.classList.contains('row');
    const prev = row ? ['ArrowLeft', 'KeyA'] : ['ArrowUp', 'KeyW'];
    const next = row ? ['ArrowRight', 'KeyD'] : ['ArrowDown', 'KeyS'];
    if (pressed(...prev)) i = (i - 1 + btns.length) % btns.length;
    else if (pressed(...next)) i = (i + 1) % btns.length;
    else if (pressed('Enter', 'NumpadEnter', 'KeyJ', 'Space')) {
      this.g.audio.init();
      btns[Math.max(0, i)].click();
      return;
    } else return;
    btns.forEach((b, k) => b.classList.toggle('sel', k === i));
    this.g.audio.init();
    this.g.audio.play('menu');
  }

  // ---------------- character select ----------------
  buildCards() {
    const wrap = $('cards');
    wrap.innerHTML = '';
    CHARACTERS.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'card';
      d.style.setProperty('--c1', hex(c.colors.accent));
      d.innerHTML = `<span class="tag t1">P1</span><span class="tag t2">${'P2'}</span><div class="ck">${c.kanji}</div><div class="cn">${c.name}</div><div class="ce">${c.title.split('—')[1].trim().toUpperCase()}</div>`;
      d.addEventListener('mouseenter', () => this.highlight(i));
      d.addEventListener('click', () => {
        this.highlight(i);
        this.confirmSelect();
      });
      wrap.appendChild(d);
    });
  }

  startSelect(mode) {
    this.sel = { mode, step: 0, idx: 0, picks: [], diff: this.sel?.diff || 'normal' };
    $('diffRow').classList.add('hidden');
    document.querySelectorAll('.card').forEach((c) => c.classList.remove('p1pick', 'p2pick'));
    this.show('select');
    this.updateSelectHead();
    this.highlight(0);
  }

  updateSelectHead() {
    const s = this.sel;
    const label = s.mode === 'arcade' ? 'THỬ THÁCH — CHỌN NINJA CỦA BẠN' : s.step === 0 ? 'NGƯỜI CHƠI 1 — CHỌN NINJA' : s.mode === 'pvp' ? 'NGƯỜI CHƠI 2 — CHỌN NINJA' : s.mode === 'training' ? 'CHỌN BAO CÁT TẬP LUYỆN' : 'CHỌN ĐỐI THỦ';
    $('selHead').textContent = label;
    $('selHead').style.color = s.step === 0 ? 'var(--p1)' : 'var(--p2)';
  }

  highlight(i) {
    if (!this.sel) return;
    if (this.sel.idx !== i) this.g.audio.play('menu');
    this.sel.idx = i;
    document.querySelectorAll('.card').forEach((c, k) => c.classList.toggle('hl', k === i));
    const c = CHARACTERS[i];
    const bar = (v) => `<i style="width:${Math.round(v * 120)}px"></i>`;
    $('selInfo').innerHTML = `
      <div class="k" style="color:${hex(c.colors.chakra)}">${c.kanji}</div>
      <div class="n">${c.name}</div>
      <div class="t">${c.title}</div>
      <div class="stat" style="color:#7fe08a"><b>Sinh lực</b>${bar(c.stats.hp)}</div>
      <div class="stat" style="color:#6fd0ff"><b>Tốc độ</b>${bar(c.stats.speed)}</div>
      <div class="stat" style="color:#ff8a5a"><b>Sức mạnh</b>${bar(c.stats.power)}</div>
      <div class="mv"><b>${c.special.name}</b>${c.special.desc}</div>
      <div class="mv"><b>★ ${c.ultimate.name}</b>${c.ultimate.desc}</div>`;
    this.g.onSelectHighlight(c, this.sel.step);
  }

  setDiff(d) {
    this.sel.diff = d;
    document.querySelectorAll('#diffRow button').forEach((b) => b.classList.toggle('sel', b.dataset.diff === d));
  }

  confirmSelect() {
    const s = this.sel;
    this.g.audio.init();
    this.g.audio.play('confirm');
    if (s.step === 2) {
      this.g.startMatch({ mode: s.mode, p1: s.picks[0], p2: s.picks[1], diff: s.diff });
      return;
    }
    s.picks[s.step] = CHARACTERS[s.idx];
    if (s.mode === 'arcade') {
      this.g.startArcade(s.picks[0]);
      return;
    }
    document.querySelectorAll('.card')[s.idx].classList.add(s.step === 0 ? 'p1pick' : 'p2pick');
    if (s.step === 0) {
      s.step = 1;
      this.updateSelectHead();
      const next = (s.idx + 1) % CHARACTERS.length;
      this.highlight(next);
    } else {
      if (s.mode === 'cpu') {
        s.step = 2;
        $('diffRow').classList.remove('hidden');
        $('selHead').textContent = 'CHỌN ĐỘ KHÓ — ENTER ĐỂ CHIẾN';
        this.setDiff(s.diff);
      } else {
        this.g.startMatch({ mode: s.mode, p1: s.picks[0], p2: s.picks[1], diff: s.diff });
      }
    }
  }

  navigateSelect(pressed) {
    const s = this.sel;
    const n = CHARACTERS.length;
    if (pressed('Escape')) {
      this.g.audio.play('menu');
      if (s.step === 0) this.g.showTitle();
      else {
        s.step = Math.max(0, s.step - 1);
        if (s.step < 2) $('diffRow').classList.add('hidden');
        document.querySelectorAll('.card').forEach((c) => c.classList.remove(s.step === 0 ? 'p1pick' : 'p2pick'));
        if (s.step === 0) document.querySelectorAll('.card').forEach((c) => c.classList.remove('p2pick'));
        this.updateSelectHead();
      }
      return;
    }
    if (s.step === 2) {
      const order = ['easy', 'normal', 'hard'];
      let k = order.indexOf(s.diff);
      if (pressed('ArrowLeft', 'KeyA')) this.setDiff(order[Math.max(0, k - 1)]);
      if (pressed('ArrowRight', 'KeyD')) this.setDiff(order[Math.min(2, k + 1)]);
      if (pressed('Enter', 'KeyJ', 'Space', 'NumpadEnter')) this.confirmSelect();
      return;
    }
    if (pressed('ArrowLeft', 'KeyA')) this.highlight((s.idx - 1 + n) % n);
    if (pressed('ArrowRight', 'KeyD')) this.highlight((s.idx + 1) % n);
    if (pressed('Enter', 'KeyJ', 'Space', 'NumpadEnter', 'Numpad1')) this.confirmSelect();
  }

  // ---------------- HUD ----------------
  setupHUD(fighters, mode) {
    fighters.forEach((f, i) => {
      const p = `p${i + 1}`;
      $(`${p}Name`).textContent = f.def.name;
      $(`${p}Portrait`).querySelector('span').textContent = f.def.kanji;
      $(`${p}Portrait`).style.setProperty('--pc', hex(f.def.colors.accent));
      $(`${p}Ck`).style.background = `linear-gradient(180deg, #fff, ${hex(f.def.colors.chakra)} 55%, ${hex(f.def.colors.accent)})`;
    });
    this.roundsWon = [0, 0];
    $('helpHint').textContent = mode === 'training' ? 'ESC: Tạm dừng · Chakra hồi nhanh khi luyện tập' : 'ESC: Tạm dừng';
  }

  updateHUD(fighters, time, round, wins, infinite) {
    fighters.forEach((f, i) => {
      const p = `p${i + 1}`;
      const hp = Math.max(0, f.hp / f.maxHp);
      $(`${p}Hp`).style.width = `${hp * 100}%`;
      $(`${p}Hp`).classList.toggle('low', hp < 0.25);
      $(`${p}HpLag`).style.width = `${Math.max(0, f.dispHp / f.maxHp) * 100}%`;
      $(`${p}Ck`).style.width = `${f.chakra}%`;
      $(`${p}Ck`).parentElement.classList.toggle('full', f.chakra >= 100);
      $(`${p}CkLabel`).textContent = f.chakra >= 100 ? 'TUYỆT KỸ SẴN SÀNG!' : `CHAKRA ${Math.floor(f.chakra)}`;
      const subs = $(`${p}Subs`);
      if (subs.childElementCount !== 4) subs.innerHTML = '<i></i><i></i><i></i><i></i>';
      [...subs.children].forEach((c, k) => c.classList.toggle('on', k < f.subs));
      const rounds = $(`${p}Rounds`);
      if (rounds.childElementCount !== 2) rounds.innerHTML = '<i></i><i></i>';
      [...rounds.children].forEach((c, k) => c.classList.toggle('on', k < wins[i]));
    });
    const t = $('timer');
    t.textContent = infinite ? '∞' : Math.max(0, Math.ceil(time));
    t.classList.toggle('low', !infinite && time < 10);
    const stage = this.g.cfg?.mode === 'arcade' ? `ẢI ${this.g.arcade.stage + 1}/3 · ` : '';
    $('roundLabel').textContent = infinite ? 'LUYỆN TẬP' : `${stage}HIỆP ${round}`;
  }

  combo(i, n) {
    const el = $(`p${i + 1}Combo`);
    if (n < 2) return;
    el.innerHTML = `${n}<small>LIÊN KÍCH</small>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.comboTimers[i]);
    this.comboTimers[i] = setTimeout(() => el.classList.remove('show'), 1300);
  }

  toast(i, text, color = '#fff') {
    const el = $(`p${i + 1}Toast`);
    el.textContent = text;
    el.style.color = color;
    el.classList.add('show');
    clearTimeout(this.toastTimers[i]);
    this.toastTimers[i] = setTimeout(() => el.classList.remove('show'), 900);
  }

  banner(html, cls = '', dur = 1.2) {
    const b = $('banner');
    clearTimeout(this.bannerTimer);
    b.className = '';
    b.innerHTML = html;
    void b.offsetWidth;
    b.className = `show ${cls}`;
    if (dur > 0) {
      this.bannerTimer = setTimeout(() => {
        b.className = `out ${cls}`;
      }, dur * 1000);
    }
  }
  clearBanner() {
    clearTimeout(this.bannerTimer);
    $('banner').className = '';
  }

  letterbox(on) {
    $('letterbox').classList.remove('hidden');
    $('letterbox').classList.toggle('on', on);
  }

  jutsuBanner(f, on) {
    const jb = $('jutsuBanner');
    if (!on) {
      jb.classList.remove('show');
      return;
    }
    $('jbKanji').textContent = f.def.kanji;
    $('jbKanji').style.color = hex(f.def.colors.chakra);
    $('jbOwner').textContent = `${f.def.name} · TUYỆT KỸ`;
    $('jbName').textContent = f.def.ultimate.name;
    jb.classList.toggle('right', f.index === 1);
    jb.classList.add('show');
  }

  setFlash(a) {
    $('flash').style.opacity = a;
  }

  result(winner, sub, { title, kanji, next = false } = {}) {
    $('resTitle').textContent = title || (winner ? `${winner.def.name} CHIẾN THẮNG` : 'HÒA');
    $('resKanji').textContent = kanji || (winner ? '勝' : '和');
    $('resSub').textContent = sub;
    $('btnNext').classList.toggle('hidden', !next);
    $('btnRestart').textContent = next ? 'Đấu Lại' : this.g.cfg?.mode === 'arcade' ? 'Thử Lại' : 'Đấu Lại';
    const btns = [...$('resultMenu').querySelectorAll('button:not(.hidden)')];
    $('resultMenu').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b === btns[0]));
    this.show('result');
  }

  setMusicLabel(on) {
    const b = document.querySelector('#pauseMenu [data-act="music"]');
    b.textContent = `Nhạc: ${on ? 'Bật' : 'Tắt'}`;
  }
}
