/**
 * Jelly physics, shared by the tray preview's cubes and jelly mode.
 *
 * Every piece that has been pushed is a little **spring body** simulated
 * frame by frame (v0.79.1), not a canned animation:
 *
 * - **Pushes add up.** A new push adds velocity to whatever the piece is
 *   already doing, so a mouse moving across a row keeps it swaying instead
 *   of restarting the wobble from rest on every move — the restart was the
 *   "rough" feel the first versions had.
 * - **It settles slowly.** The spring is soft and lightly damped, so a
 *   piece swings through several shrinking oscillations before it comes to
 *   rest exactly where it was.
 * - **The top lags the base.** Each body carries a second, slower spring
 *   for its top, which chases the base; the gap between them is the lean.
 *
 * **The shape is what moves, not just the box** (v0.79.3). A transform can
 * only lean, turn and stretch a box, and its straight edges stay straight —
 * which the owner kept seeing as a square being distorted rather than as
 * jelly. So there is no skew at all now: the lean and the squash are drawn
 * mostly as **the outline itself flowing**, each corner's radius swelling
 * or shrinking with which way the jelly is sloshing, from the piece's own
 * radius at rest (read once, so the first frame does not jump) towards a
 * blob. The transform that is left is a small drift, a slight turn and a
 * gentle squash.
 *
 * One `requestAnimationFrame` loop runs while anything is moving and stops
 * when everything is still, clearing the inline styles it wrote so a piece
 * at rest is exactly the element it was. It writes `transform` and
 * `border-radius` — never layout.
 */

type Styled = Element & ElementCSSInlineStyle;

type Body = {
  el: Styled;
  /** Base offset (px) and velocity. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The top's offset, chasing the base on a slower spring. */
  tx: number;
  ty: number;
  tvx: number;
  tvy: number;
  /** How much of the motion a piece shows: 1 for small, less for big. */
  reach: number;
  /**
   * Its own springiness and heft, drawn at random once. Bodies alike in
   * every way pushed by one force move in lockstep, which reads as one
   * slab rather than a tray of separate jellies; a little spread desyncs
   * them.
   */
  spring: number;
  gain: number;
  /** Its box and its radius at rest, for the outline to flow from. */
  width: number;
  height: number;
  radius: number;
  /** An SVG icon has no outline to flow, and a sharp piece keeps its corners. */
  shaped: boolean;
};

const bodies = new Map<Element, Body>();

/** Roughly how long a push takes to die away — the tray's pointer window. */
export const WOBBLE_MS = 900;
let frame = 0;
let last = 0;

/** The base's spring: soft, lightly damped — several slow swings. */
const STIFFNESS = 85;
const DAMPING = 4.6;
/** The top's spring, chasing the base: softer, so it lags and overshoots. */
const TOP_STIFFNESS = 55;
const TOP_DAMPING = 4;
/** A push of `lean` 1 sets off at this speed, px/s. */
const PUSH = 70;
/** The fastest a body may move, px/s — repeated pushes cannot run away. */
const MAX_SPEED = 240;
/** Below this, a body is at rest and is let go. */
const REST = 0.05;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function step(now: number) {
  const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
  last = now;
  for (const [el, b] of bodies) {
    // Semi-implicit Euler: stable for these springs at any frame rate.
    const k = STIFFNESS * b.spring;
    b.vx += (-k * b.x - DAMPING * b.vx) * dt;
    b.vy += (-k * b.y - DAMPING * b.vy) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const tk = TOP_STIFFNESS * b.spring;
    b.tvx += (tk * (b.x - b.tx) - TOP_DAMPING * b.tvx) * dt;
    b.tvy += (tk * (b.y - b.ty) - TOP_DAMPING * b.tvy) * dt;
    b.tx += b.tvx * dt;
    b.ty += b.tvy * dt;

    const energy = Math.abs(b.x) + Math.abs(b.y) + Math.abs(b.tx) + Math.abs(b.ty) + (Math.abs(b.vx) + Math.abs(b.vy)) / 20;
    if (energy < REST) {
      b.el.style.transform = "";
      if (b.shaped) b.el.style.borderRadius = "";
      bodies.delete(el);
      continue;
    }
    const r = b.reach;
    // Which way the jelly is sloshing: the top trailing the base, -1…1.
    const slosh = clamp((b.tx - b.x) / 5, -1, 1);
    const lift = clamp((b.ty - b.y) / 5, -1, 1);
    const turn = (b.tx - b.x) * 0.5 * r;
    const squash = clamp((b.y - b.ty) * 0.02 * r, -0.08, 0.08);
    const sx = 1 + squash;
    b.el.style.transform =
      `translate(${(b.x * 0.6 * r).toFixed(2)}px, ${(b.y * 0.6 * r).toFixed(2)}px) ` +
      `rotate(${turn.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${(1 / sx).toFixed(3)})`;
    if (b.shaped) {
      // Each corner swells or tightens with the slosh, from the piece's own
      // radius towards half its side — the edges between them bow.
      const melt = Math.min(0.75, energy / 8) * r;
      const hw = b.width / 2;
      const hh = b.height / 2;
      const corner = (half: number, bias: number) =>
        clamp(b.radius + (half - b.radius) * melt * (0.55 + 0.45 * bias), 0, half).toFixed(1);
      // Horizontal radii follow the sideways slosh, vertical the lift.
      const h = [corner(hw, slosh), corner(hw, -slosh), corner(hw, -slosh * 0.6), corner(hw, slosh * 0.6)];
      const v = [corner(hh, lift), corner(hh, lift), corner(hh, -lift), corner(hh, -lift)];
      b.el.style.borderRadius = `${h.join("px ")}px / ${v.join("px ")}px`;
    }
  }
  frame = bodies.size > 0 ? requestAnimationFrame(step) : 0;
}

/** Each piece's resting corner, read once ever rather than once per wobble. */
const radii = new WeakMap<Element, string>();

/**
 * Below this resting radius a piece is sharp, and stays sharp: the tray's
 * cubes and the Units cell's are drawn square on purpose, and melting them
 * turned a tray — a picture of a split — into a grid of dots.
 */
const SHARP = 3;

/** A piece's corner radius at rest, in px, capped where the browser caps it. */
function restingRadius(el: Element, width: number, height: number): number {
  let value = radii.get(el);
  if (value === undefined) {
    value = getComputedStyle(el).borderTopLeftRadius;
    radii.set(el, value);
  }
  const half = Math.min(width, height) / 2;
  const px = value.endsWith("%") ? (parseFloat(value) / 100) * Math.min(width, height) : parseFloat(value);
  return clamp(Number.isFinite(px) ? px : 0, 0, half);
}

function bodyFor(el: Element, size: { width: number; height: number }, reach?: number): Body | null {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return null;
  let b = bodies.get(el);
  if (!b) {
    const radius = el instanceof HTMLElement ? restingRadius(el, size.width, size.height) : 0;
    const shaped = el instanceof HTMLElement && radius >= SHARP;
    b = {
      el,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      tvx: 0,
      tvy: 0,
      // Larger pieces swing less, or a long button would sweep across its
      // neighbours.
      reach: reach ?? Math.min(1, 40 / Math.max(size.width, size.height, 1)) * 0.6 + 0.4,
      spring: 0.65 + Math.random() * 0.7,
      gain: 0.55 + Math.random() * 0.9,
      width: size.width,
      height: size.height,
      radius,
      shaped,
    };
    bodies.set(el, b);
  }
  if (!frame) {
    last = performance.now();
    frame = requestAnimationFrame(step);
  }
  return b;
}

function clampSpeed(b: Body) {
  // Scaled by the body's heft, or every body hitting the ceiling would
  // move identically again.
  const limit = MAX_SPEED * b.gain;
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > limit) {
    b.vx *= limit / speed;
    b.vy *= limit / speed;
  }
}

/**
 * Pushes a piece the way it was pushed (`ux`, `uy`, a unit direction),
 * `lean` 0-1 hard, after `delay` ms. `size` is its box when the caller has
 * already measured it (a read between writes costs a style flush per
 * piece); `reach` overrides how much of the motion it shows.
 */
export function wobble(
  el: Element,
  ux: number,
  uy: number,
  lean: number,
  delay = 0,
  size?: { width: number; height: number },
  reach?: number,
) {
  const go = () => {
    const b = bodyFor(el, size ?? el.getBoundingClientRect(), reach);
    if (!b) return;
    b.vx += ux * lean * PUSH * b.gain;
    b.vy += uy * lean * PUSH * b.gain;
    clampSpeed(b);
  };
  if (delay > 0) setTimeout(go, delay);
  else go();
}

/**
 * A continuous force on a piece for one sensor reading — the phone being
 * accelerated or tilted — as an acceleration in px/s² applied over `dt`
 * seconds. `size` is its box when the caller has already measured it. The jelly's own inertia does the rest: it lags, overshoots and
 * settles when the force stops.
 */
export function shove(el: Element, ax: number, ay: number, dt: number, size?: { width: number; height: number }) {
  const b = bodies.get(el) ?? bodyFor(el, size ?? el.getBoundingClientRect());
  if (!b) return;
  b.vx += ax * dt * b.gain;
  b.vy += ay * dt * b.gain;
  clampSpeed(b);
}
