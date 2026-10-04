import { makePose } from './rig.js';

// Conventions (radians, joint-local):
//  arm/leg x<0 swings forward, elbow x<0 bends, knee x>0 bends
//  left arm z>0 raises out sideways, right arm z<0
//  spine/chest x>0 leans forward, y>0 brings right shoulder forward
//  tilt (whole body pitch about the feet): >0 forward, -PI/2 lying on back

const ZERO = { hipY: 0, tilt: 0 };

export const STANCE = makePose(ZERO, {
  hipY: -0.055,
  hips: [0, -0.4, 0],
  spine: [0.08, 0.08, 0],
  chest: [0.06, 0.16, 0],
  neck: [0, 0.05, 0],
  head: [-0.05, 0.12, 0],
  lArm: [-0.9, 0.1, 0.18],
  lFore: [-1.85, 0, 0],
  lHand: [0, 0, 0.1],
  rArm: [-0.55, -0.1, -0.28],
  rFore: [-2.15, 0, 0],
  rHand: [0, 0, -0.1],
  lLeg: [-0.5, 0.25, 0.1],
  lShin: [0.6, 0, 0],
  lFoot: [-0.1, 0, 0],
  rLeg: [0.22, 0.25, -0.12],
  rShin: [0.38, 0, 0],
  rFoot: [0.15, 0, 0],
});

export const P = (partial) => makePose(STANCE, partial);
const K = (t, partial, ease) => ({ t, p: P(partial), ease });

export const POSES = {
  stance: STANCE,
  run: P({ tilt: 0.32, hips: [0, 0, 0], spine: [0.1, 0, 0], chest: [0.1, 0, 0], head: [-0.4, 0, 0], neck: [-0.1, 0, 0],
    lArm: [1.15, 0, 0.3], lFore: [-0.25, 0, 0], rArm: [1.15, 0, -0.3], rFore: [-0.25, 0, 0], lHand: [0.4, 0, 0], rHand: [0.4, 0, 0] }),
  jumpUp: P({ hipY: 0, tilt: 0.1, hips: [0, 0, 0], chest: [0.15, 0, 0],
    lArm: [0.6, 0, 0.5], lFore: [-0.6, 0, 0], rArm: [0.6, 0, -0.5], rFore: [-0.6, 0, 0],
    lLeg: [-1.3, 0, 0.12], lShin: [1.9, 0, 0], rLeg: [-0.6, 0, -0.12], rShin: [1.5, 0, 0], lFoot: [0.4, 0, 0], rFoot: [0.4, 0, 0] }),
  fall: P({ hipY: 0, tilt: 0, hips: [0, 0, 0], chest: [0, 0, 0],
    lArm: [-0.3, 0, 0.9], lFore: [-0.5, 0, 0], rArm: [-0.3, 0, -0.9], rFore: [-0.5, 0, 0],
    lLeg: [-0.5, 0, 0.1], lShin: [0.7, 0, 0], rLeg: [-0.1, 0, -0.1], rShin: [0.4, 0, 0], lFoot: [0.3, 0, 0], rFoot: [0.3, 0, 0] }),
  block: P({ hipY: -0.14, hips: [0, -0.1, 0], spine: [0.2, 0, 0], chest: [0.2, 0.05, 0], head: [0.25, 0, 0],
    lArm: [-1.25, 0.35, -0.3], lFore: [-1.6, 0, 0], rArm: [-1.25, -0.35, 0.3], rFore: [-1.6, 0, 0],
    lLeg: [-0.55, 0.1, 0.18], lShin: [0.85, 0, 0], rLeg: [0.2, 0.1, -0.18], rShin: [0.7, 0, 0] }),
  seal: P({ hipY: -0.16, hips: [0, 0, 0], spine: [0.05, 0, 0], chest: [0.08, 0, 0], head: [0.12, 0, 0],
    lArm: [-0.45, 0.2, -0.45], lFore: [-1.95, 0, 0], rArm: [-0.45, -0.2, 0.45], rFore: [-1.95, 0, 0],
    lHand: [0, 0, -0.3], rHand: [0, 0, 0.3],
    lLeg: [-0.15, 0, 0.38], lShin: [0.45, 0, 0], rLeg: [-0.15, 0, -0.38], rShin: [0.45, 0, 0], lFoot: [-0.25, 0, -0.3], rFoot: [-0.25, 0, 0.3] }),
  hitHigh: P({ hipY: -0.06, spine: [-0.3, 0, 0], chest: [-0.35, 0.2, 0.1], head: [-0.6, 0.3, 0],
    lArm: [0.3, 0, 0.7], lFore: [-0.7, 0, 0], rArm: [0.2, 0, -0.6], rFore: [-0.9, 0, 0] }),
  hitLow: P({ hipY: -0.12, spine: [0.5, 0, 0], chest: [0.45, -0.2, 0], head: [0.35, 0, 0],
    lArm: [-0.4, 0, 0.3], lFore: [-1.5, 0, 0], rArm: [-0.5, 0, -0.2], rFore: [-1.6, 0, 0],
    lLeg: [-0.3, 0, 0.1], lShin: [0.7, 0, 0], rLeg: [0.3, 0, -0.1], rShin: [0.6, 0, 0] }),
  launched: P({ hipY: 0, hips: [0, 0, 0], spine: [-0.35, 0, 0], chest: [-0.3, 0, 0], head: [-0.4, 0, 0],
    lArm: [-2.5, 0, 0.7], lFore: [-0.4, 0, 0], rArm: [-2.3, 0, -0.8], rFore: [-0.5, 0, 0],
    lLeg: [-0.5, 0, 0.2], lShin: [0.7, 0, 0], rLeg: [-0.15, 0, -0.15], rShin: [0.3, 0, 0] }),
  down: P({ hipY: 0, tilt: -1.5708, hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [-0.2, 0.4, 0],
    lArm: [0.1, 0, 1.25], lFore: [-0.4, 0, 0], rArm: [-0.1, 0, -1.05], rFore: [-0.8, 0, 0],
    lLeg: [-0.05, 0, 0.18], lShin: [0.25, 0, 0], rLeg: [-0.4, 0, -0.12], rShin: [0.8, 0, 0], lFoot: [0.6, 0, 0], rFoot: [0.3, 0, 0] }),
  dash: P({ tilt: 0.55, hipY: -0.05, hips: [0, 0, 0], spine: [0, 0, 0], chest: [0.1, 0, 0], head: [-0.6, 0, 0],
    lArm: [1.4, 0, 0.25], lFore: [-0.2, 0, 0], rArm: [1.4, 0, -0.25], rFore: [-0.2, 0, 0],
    lLeg: [-1.0, 0, 0.05], lShin: [1.3, 0, 0], rLeg: [0.6, 0, -0.05], rShin: [0.9, 0, 0] }),
  win: P({ hipY: 0, hips: [0, 0, 0], spine: [-0.03, 0, 0], chest: [-0.05, 0, 0], head: [0, 0, 0],
    rArm: [-0.85, 0.3, 0.45], rFore: [-1.95, 0, 0], rHand: [0, 0.8, 0],
    lArm: [0.35, 0, 0.12], lFore: [-0.4, 0, 0],
    lLeg: [0, 0, 0.12], lShin: [0.05, 0, 0], rLeg: [0, 0, -0.12], rShin: [0.05, 0, 0], lFoot: [0, 0, 0], rFoot: [0, 0, 0] }),
  // jutsu presets
  castHand: P({ hipY: -0.12, hips: [0, 0.2, 0], spine: [0.1, 0, 0], chest: [0.15, 0.3, 0], head: [0, -0.2, 0],
    rArm: [-1.5, 0, 0.1], rFore: [-0.2, 0, 0], rHand: [-0.8, 0, 0], lArm: [-1.1, 0.4, -0.2], lFore: [-0.9, 0, 0],
    lLeg: [-0.75, 0.2, 0.1], lShin: [0.85, 0, 0], rLeg: [0.55, 0.2, -0.1], rShin: [0.35, 0, 0] }),
  holdOrb: P({ hipY: -0.1, hips: [0, 0.3, 0], chest: [0.05, 0.3, 0], head: [0.1, -0.25, 0],
    rArm: [-0.6, 0, -0.35], rFore: [-1.3, 0, 0], rHand: [-1.2, 0, 0], lArm: [-0.8, 0.3, -0.1], lFore: [-1.2, 0, 0], lHand: [0.6, 0, 0] }),
  breath: P({ hipY: -0.08, hips: [0, 0, 0], spine: [-0.2, 0, 0], chest: [-0.25, 0, 0], head: [-0.15, 0, 0],
    rArm: [-1.25, -0.2, 0.55], rFore: [-2.3, 0, 0], lArm: [-0.6, 0, 0.3], lFore: [-1.2, 0, 0],
    lLeg: [-0.6, 0, 0.15], lShin: [0.6, 0, 0], rLeg: [0.35, 0, -0.15], rShin: [0.35, 0, 0] }),
  breathOut: P({ hipY: -0.12, hips: [0, 0, 0], spine: [0.2, 0, 0], chest: [0.25, 0, 0], head: [0.05, 0, 0],
    rArm: [-1.35, -0.2, 0.5], rFore: [-2.2, 0, 0], lArm: [-0.4, 0, 0.6], lFore: [-0.6, 0, 0],
    lLeg: [-0.75, 0, 0.15], lShin: [0.8, 0, 0], rLeg: [0.5, 0, -0.15], rShin: [0.3, 0, 0] }),
  skyCall: P({ hipY: -0.05, hips: [0, 0, 0], spine: [-0.1, 0, 0], chest: [-0.15, 0, 0], head: [-0.4, 0, 0],
    rArm: [-3.0, 0, -0.25], rFore: [-0.1, 0, 0], lArm: [-0.3, 0, 0.5], lFore: [-1.2, 0, 0],
    lLeg: [-0.2, 0, 0.3], lShin: [0.3, 0, 0], rLeg: [-0.1, 0, -0.3], rShin: [0.2, 0, 0] }),
  stompUp: P({ hipY: -0.02, hips: [0, 0, 0], chest: [-0.1, 0, 0],
    lArm: [-2.6, 0, 0.3], lFore: [-0.6, 0, 0], rArm: [-2.6, 0, -0.3], rFore: [-0.6, 0, 0],
    lLeg: [-1.5, 0, 0.1], lShin: [1.7, 0, 0], rLeg: [0.05, 0, -0.1], rShin: [0.1, 0, 0] }),
  slam: P({ hipY: -0.42, hips: [0, 0, 0], spine: [0.5, 0, 0], chest: [0.4, 0, 0], head: [-0.3, 0, 0],
    lArm: [-1.2, 0, -0.1], lFore: [-0.2, 0, 0], rArm: [-1.2, 0, 0.1], rFore: [-0.2, 0, 0],
    lLeg: [-1.2, 0, 0.3], lShin: [1.6, 0, 0], rLeg: [0.4, 0, -0.3], rShin: [1.3, 0, 0], lFoot: [-0.4, 0, 0], rFoot: [0.6, 0, 0] }),
  bladeDash: P({ tilt: 0.45, hipY: -0.1, hips: [0, 0.5, 0], chest: [0.1, 0.4, 0], head: [-0.5, -0.4, 0],
    rArm: [-1.55, 0, 0], rFore: [0, 0, 0], rHand: [0, 0, 0], lArm: [1.2, 0, 0.3], lFore: [-0.3, 0, 0],
    lLeg: [-1.0, 0, 0.05], lShin: [1.2, 0, 0], rLeg: [0.6, 0, -0.05], rShin: [0.8, 0, 0] }),
};

export function runPose(phase, out) {
  // procedural ninja run built on POSES.run
  const b = POSES.run;
  const s = Math.sin(phase), c = Math.cos(phase);
  Object.assign(out, b);
  out.hipY = -0.06 + Math.abs(c) * 0.05;
  out.lLeg = [-s * 1.0 - 0.25, 0, 0.05];
  out.rLeg = [s * 1.0 - 0.25, 0, -0.05];
  out.lShin = [0.35 + Math.max(0, -c) * 1.5 + Math.max(0, s) * 0.4, 0, 0];
  out.rShin = [0.35 + Math.max(0, c) * 1.5 + Math.max(0, -s) * 0.4, 0, 0];
  out.lFoot = [0.1 + Math.max(0, -s) * 0.5, 0, 0];
  out.rFoot = [0.1 + Math.max(0, s) * 0.5, 0, 0];
  out.hips = [0, s * 0.15, 0];
  out.chest = [0.12, -s * 0.2, 0];
  return out;
}

// ---------------------------------------------------------------------------
// Taijutsu move list (shared). hits[].t is seconds into the move.
// ---------------------------------------------------------------------------
export const MOVES = {
  jab: {
    dur: 0.3, cancel: 0.13, next: 'cross', trail: 'lHand', lunge: 5,
    keys: [
      K(0, {}),
      K(0.06, { hips: [0, -0.6, 0], chest: [0.1, -0.35, 0], lArm: [-1.55, 0, 0.02], lFore: [-0.05, 0, 0], lHand: [0, 0, 0], head: [0, 0.3, 0] }, 'out'),
      K(0.15, { hips: [0, -0.6, 0], chest: [0.1, -0.35, 0], lArm: [-1.5, 0, 0.02], lFore: [-0.1, 0, 0], head: [0, 0.3, 0] }),
      K(0.3, {}),
    ],
    hits: [{ t: 0.06, range: 1.7, arc: 1.2, dmg: 4, kb: 2.2, stun: 0.32, bone: 'lHand', sfx: 'hit' }],
  },
  cross: {
    dur: 0.34, cancel: 0.15, next: 'roundhouse', trail: 'rHand', lunge: 6,
    keys: [
      K(0, { hips: [0, -0.6, 0], chest: [0.1, -0.35, 0] }),
      K(0.08, { hips: [0, 0.25, 0], chest: [0.15, 0.55, 0], head: [0, -0.4, 0], rArm: [-1.55, 0.05, 0.02], rFore: [-0.05, 0, 0], rHand: [0, 0, 0],
        rLeg: [0.4, 0.2, -0.12], rShin: [0.15, 0, 0], rFoot: [0.6, 0, 0], lLeg: [-0.6, 0.2, 0.1], lShin: [0.5, 0, 0] }, 'out'),
      K(0.18, { hips: [0, 0.25, 0], chest: [0.15, 0.55, 0], head: [0, -0.4, 0], rArm: [-1.5, 0.05, 0.02], rFore: [-0.1, 0, 0] }),
      K(0.34, {}),
    ],
    hits: [{ t: 0.08, range: 1.8, arc: 1.2, dmg: 5, kb: 2.5, stun: 0.34, bone: 'rHand', sfx: 'hit' }],
  },
  roundhouse: {
    dur: 0.48, cancel: 0.24, next: 'palm', trail: 'rFoot', lunge: 6,
    keys: [
      K(0, {}),
      K(0.1, { hipY: -0.03, hips: [0, 0.5, 0], chest: [0, 0.2, 0], rLeg: [-1.5, 0, -0.35], rShin: [1.9, 0, 0], lLeg: [0, 0, 0.08], lShin: [0.2, 0, 0], lFoot: [0, 0, 0] }),
      K(0.19, { hipY: -0.02, hips: [0, 1.35, 0], spine: [-0.15, 0, 0.35], chest: [-0.05, -0.5, 0.1], head: [0, -0.8, -0.3],
        rLeg: [-1.35, 0.2, -1.15], rShin: [0.12, 0, 0], rFoot: [0.6, 0, 0], lLeg: [0.05, 0, 0.05], lShin: [0.15, 0, 0], lFoot: [0, 0, 0],
        lArm: [-0.8, 0, 0.7], lFore: [-1.2, 0, 0], rArm: [0.3, 0, -0.6], rFore: [-0.8, 0, 0] }, 'out'),
      K(0.3, { hipY: -0.02, hips: [0, 1.6, 0], spine: [-0.1, 0, 0.3], chest: [0, -0.5, 0.1], head: [0, -0.9, -0.3],
        rLeg: [-1.0, 0.2, -0.9], rShin: [0.6, 0, 0], lLeg: [0.05, 0, 0.05], lShin: [0.15, 0, 0],
        lArm: [-0.8, 0, 0.7], lFore: [-1.2, 0, 0], rArm: [0.3, 0, -0.6], rFore: [-0.8, 0, 0] }),
      K(0.48, {}),
    ],
    hits: [{ t: 0.18, range: 2.1, arc: 1.8, dmg: 7, kb: 3.2, stun: 0.42, bone: 'rFoot', sfx: 'hitHeavy' }],
  },
  palm: {
    dur: 0.66, cancel: 9, trail: 'rHand', lunge: 7,
    keys: [
      K(0, {}),
      K(0.15, { hipY: -0.18, hips: [0, -0.7, 0], chest: [0, -0.5, 0], head: [0, 0.6, 0],
        lArm: [0.6, 0, 0.35], lFore: [-1.4, 0, 0], rArm: [0.6, 0, -0.35], rFore: [-1.4, 0, 0],
        lLeg: [-0.6, 0.2, 0.2], lShin: [1.0, 0, 0], rLeg: [0.3, 0.2, -0.2], rShin: [0.9, 0, 0] }),
      K(0.25, { hipY: -0.18, hips: [0, 0, 0], spine: [0.15, 0, 0], chest: [0.25, 0, 0], head: [-0.1, 0, 0],
        lArm: [-1.5, 0, -0.18], lFore: [-0.05, 0, 0], lHand: [-1.3, 0, 0], rArm: [-1.5, 0, 0.18], rFore: [-0.05, 0, 0], rHand: [-1.3, 0, 0],
        lLeg: [-0.9, 0, 0.12], lShin: [1.0, 0, 0], rLeg: [0.65, 0, -0.12], rShin: [0.1, 0, 0], rFoot: [0.6, 0, 0] }, 'out'),
      K(0.45, { hipY: -0.18, hips: [0, 0, 0], spine: [0.15, 0, 0], chest: [0.25, 0, 0], head: [-0.1, 0, 0],
        lArm: [-1.45, 0, -0.18], lFore: [-0.1, 0, 0], lHand: [-1.2, 0, 0], rArm: [-1.45, 0, 0.18], rFore: [-0.1, 0, 0], rHand: [-1.2, 0, 0],
        lLeg: [-0.9, 0, 0.12], lShin: [1.0, 0, 0], rLeg: [0.65, 0, -0.12], rShin: [0.1, 0, 0] }),
      K(0.66, {}),
    ],
    hits: [{ t: 0.25, range: 2.2, arc: 1.4, dmg: 10, kb: 11, launch: 6, stun: 0.6, bone: 'rHand', sfx: 'hitHeavy', burst: true }],
  },
  diveKick: {
    dur: 0.9, air: true, trail: 'rFoot',
    keys: [
      K(0, POSES.jumpUp),
      K(0.12, { hipY: 0, tilt: 0.55, hips: [0, 0.3, 0], chest: [-0.1, 0, 0], head: [-0.5, 0, 0],
        rLeg: [-1.25, 0, -0.05], rShin: [0.05, 0, 0], rFoot: [0.7, 0, 0], lLeg: [-0.3, 0, 0.1], lShin: [1.8, 0, 0],
        lArm: [0.4, 0, 0.9], lFore: [-0.4, 0, 0], rArm: [0.6, 0, -0.9], rFore: [-0.3, 0, 0] }, 'out'),
      K(0.9, { hipY: 0, tilt: 0.55, hips: [0, 0.3, 0], chest: [-0.1, 0, 0], head: [-0.5, 0, 0],
        rLeg: [-1.25, 0, -0.05], rShin: [0.05, 0, 0], rFoot: [0.7, 0, 0], lLeg: [-0.3, 0, 0.1], lShin: [1.8, 0, 0],
        lArm: [0.4, 0, 0.9], lFore: [-0.4, 0, 0], rArm: [0.6, 0, -0.9], rFore: [-0.3, 0, 0] }),
    ],
    hits: [],
  },
  throw: {
    dur: 0.38, cancel: 9, trail: 'rHand',
    keys: [
      K(0, {}),
      K(0.1, { hips: [0, -0.5, 0], chest: [0, -0.6, 0], head: [0, 0.6, 0], rArm: [0.2, 0, -1.3], rFore: [-1.2, 0, 0] }),
      K(0.18, { hips: [0, 0.3, 0], chest: [0.1, 0.55, 0], head: [0, -0.4, 0], rArm: [-1.5, -0.3, -0.25], rFore: [-0.1, 0, 0], rHand: [0, 0, 0] }, 'out'),
      K(0.38, {}),
    ],
    hits: [],
  },
  getup: {
    dur: 0.55,
    keys: [
      { t: 0, p: POSES.down },
      K(0.25, { hipY: -0.35, tilt: -0.5, spine: [0.5, 0, 0], chest: [0.4, 0, 0], lLeg: [-1.4, 0, 0.3], lShin: [2.0, 0, 0], rLeg: [-0.6, 0, -0.3], rShin: [1.8, 0, 0],
        lArm: [0.4, 0, 0.4], rArm: [0.4, 0, -0.4] }),
      K(0.55, {}),
    ],
    hits: [],
  },
};

export const COMBO_START = 'jab';
