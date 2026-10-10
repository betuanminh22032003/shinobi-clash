import * as THREE from 'three';

const down = new Set();
const pressed = new Set();

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  down.add(e.code);
  pressed.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => down.clear());

export const Keys = {
  isDown: (c) => down.has(c),
  wasPressed: (c) => pressed.has(c),
  endFrame: () => pressed.clear(),
};

export const LAYOUTS = {
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    jump: ['Space'], attack: ['KeyJ'], shuriken: ['KeyK'], special: ['KeyL'], special2: ['Semicolon'],
    charge: ['KeyU'], block: ['KeyI'], ultimate: ['KeyO'], awaken: ['KeyP'], dash: ['ShiftLeft', 'ShiftRight'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    jump: ['Numpad0'], attack: ['Numpad1'], shuriken: ['Numpad2'], special: ['Numpad3'], special2: ['Numpad9'],
    charge: ['Numpad4'], block: ['Numpad5'], ultimate: ['Numpad6'], awaken: ['Numpad7'], dash: ['NumpadDecimal', 'NumpadEnter'],
  },
};

const merge = (a, b) => {
  const o = {};
  for (const k of Object.keys(a)) o[k] = [...a[k], ...b[k]];
  return o;
};
LAYOUTS.solo = merge(LAYOUTS.p1, LAYOUTS.p2);

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

export function emptyIntent() {
  return { mx: 0, mz: 0, jump: false, attack: false, shuriken: false, special: false, special2: false, ultimate: false, awaken: false, dash: false, block: false, charge: false };
}

/** Converts a 2D stick (x right, y forward) into a world-space direction relative to the camera. */
export function cameraRelative(camera, x, y, out) {
  camera.getWorldDirection(_f);
  _f.y = 0;
  _f.normalize();
  _r.crossVectors(_f, UP).normalize();
  out.mx = _r.x * x + _f.x * y;
  out.mz = _r.z * x + _f.z * y;
}

export class HumanController {
  constructor(layout, padIndex) {
    this.L = layout;
    this.pad = padIndex;
    this.prevButtons = [];
  }
  any(list, fn) {
    return list.some(fn);
  }
  getInput(camera) {
    const L = this.L;
    const held = (k) => this.any(L[k], (c) => down.has(c));
    const tap = (k) => this.any(L[k], (c) => pressed.has(c));
    let x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    let y = (held('up') ? 1 : 0) - (held('down') ? 1 : 0);
    const out = emptyIntent();
    out.jump = tap('jump');
    out.attack = tap('attack');
    out.shuriken = tap('shuriken');
    out.special = tap('special');
    out.special2 = tap('special2');
    out.ultimate = tap('ultimate');
    out.awaken = tap('awaken');
    out.dash = tap('dash');
    out.block = held('block');
    out.charge = held('charge');

    // gamepad
    const gp = this.pad !== undefined && navigator.getGamepads ? navigator.getGamepads()[this.pad] : null;
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.2) {
        x = ax;
        y = -ay;
      }
      const b = gp.buttons.map((bt) => bt.pressed);
      const edge = (i) => b[i] && !this.prevButtons[i];
      out.jump ||= edge(0);
      out.attack ||= edge(2);
      out.shuriken ||= edge(1);
      // Y = jutsu 1, RS click (or Y while holding RT) = jutsu 2, LS click = awakening
      if (edge(3) && b[7]) out.special2 = true;
      else out.special ||= edge(3);
      out.special2 ||= edge(11);
      out.awaken ||= edge(10);
      out.dash ||= edge(5);
      out.ultimate ||= edge(6);
      out.block ||= !!b[4];
      out.charge ||= !!b[7] && !b[3];
      if (b[12]) y = 1; if (b[13]) y = -1; if (b[14]) x = -1; if (b[15]) x = 1;
      this.prevButtons = b;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    cameraRelative(camera, x, y, out);
    return out;
  }
}

export function padPressed(i) {
  const gp = navigator.getGamepads ? navigator.getGamepads()[i] : null;
  return gp ? gp.buttons.map((b) => b.pressed) : [];
}
