/**
 * Jelly physics, shared by the tray preview's cubes and jelly mode.
 *
 * Every piece that has been pushed is a little **spring body** simulated
 * frame by frame (v0.79.1), not a canned animation. That is what makes it
 * feel like jelly rather than an effect:
 *
 * - **Pushes add up.** A new push adds velocity to whatever the piece is
 *   already doing, so a mouse moving across a row keeps it swaying instead
 *   of restarting the wobble from rest on every move — the restart was the
 *   "rough" feel the first versions had.
 * - **It settles slowly.** The spring is soft and lightly damped, so a
 *   piece swings through several shrinking oscillations over a couple of
 *   seconds before it comes to rest exactly where it was.
 * - **The top lags the base.** Each body carries a second, slower spring
 *   for its top, which chases the base; the gap between the two is drawn
 *   as lean (skew) and the vertical movement as a volume-keeping squash —
 *   the base moves, the top catches up late and overshoots, which is the
 *   motion that reads as jelly.
 * - **Small pieces go gooey**: their corners soften with how hard they are
 *   moving and firm up as they settle.
 *
 * One `requestAnimationFrame` loop runs while anything is moving and stops
 * when everything is still, clearing the inline styles it wrote so a piece
 * at rest is exactly the element it was. It writes `transform` and, for a
 * gooey piece, `border-radius` — never layout.
 */

type Body = {
  el: HTMLElement;
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
  gooey: boolean;
};

const bodies = new Map<Element, Body>();

/** Roughly how long a push takes to die away — the tray's pointer window. */
export const WOBBLE_MS = 900;
let frame = 0;
let last = 0;

/** The base's spring: soft, lightly damped — several slow swings. */
const STIFFNESS = 85;
const DAMPING = 4.2;
/** The top's spring, chasing the base: softer, so it lags and overshoots. */
const TOP_STIFFNESS = 55;
const TOP_DAMPING = 3.6;
/** A push of `lean` 1 sets off at this speed, px/s. */
const PUSH = 120;
/** The fastest a body may move, px/s — repeated pushes cannot run away. */
const MAX_SPEED = 320;
/** Below this, a body is at rest and is let go. */
const REST = 0.05;

function step(now: number) {
  const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
  last = now;
  for (const [el, b] of bodies) {
    // Semi-implicit Euler: stable for these springs at any frame rate.
    b.vx += (-STIFFNESS * b.x - DAMPING * b.vx) * dt;
    b.vy += (-STIFFNESS * b.y - DAMPING * b.vy) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.tvx += (TOP_STIFFNESS * (b.x - b.tx) - TOP_DAMPING * b.tvx) * dt;
    b.tvy += (TOP_STIFFNESS * (b.y - b.ty) - TOP_DAMPING * b.tvy) * dt;
    b.tx += b.tvx * dt;
    b.ty += b.tvy * dt;

    const energy = Math.abs(b.x) + Math.abs(b.y) + Math.abs(b.tx) + Math.abs(b.ty) + (Math.abs(b.vx) + Math.abs(b.vy)) / 20;
    if (energy < REST) {
      b.el.style.transform = "";
      if (b.gooey) b.el.style.borderRadius = "";
      bodies.delete(el);
      continue;
    }
    const r = b.reach;
    // Lean is the top trailing the base; squash follows vertical travel.
    const lean = (b.tx - b.x) * 2.2 * r;
    const turn = b.x * 0.45 * r;
    const squash = Math.max(-0.22, Math.min(0.22, (b.y - b.ty) * 0.035 * r + b.y * 0.012 * r));
    const sx = 1 + squash;
    b.el.style.transform =
      `translate(${(b.x * r).toFixed(2)}px, ${(b.y * r).toFixed(2)}px) ` +
      `rotate(${turn.toFixed(2)}deg) skewX(${lean.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${(1 / sx).toFixed(3)})`;
    if (b.gooey) {
      const melt = Math.min(1, energy / 10);
      b.el.style.borderRadius =
        `${(12 + 32 * melt).toFixed(0)}% ${(9 + 38 * melt).toFixed(0)}% ` +
        `${(14 + 28 * melt).toFixed(0)}% ${(8 + 36 * melt).toFixed(0)}%`;
    }
  }
  frame = bodies.size > 0 ? requestAnimationFrame(step) : 0;
}

function bodyFor(el: Element, size: { width: number; height: number }, reach?: number): Body | null {
  if (!(el instanceof HTMLElement)) return null;
  let b = bodies.get(el);
  if (!b) {
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
      // Large pieces — a figure tile, a pane — swing less, or a 300px
      // tile turned a few degrees would sweep across its neighbours.
      reach: reach ?? Math.min(1, 60 / Math.max(size.width, size.height, 1)) * 0.65 + 0.35,
      gooey: size.width <= 40 && size.height <= 40,
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
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > MAX_SPEED) {
    b.vx *= MAX_SPEED / speed;
    b.vy *= MAX_SPEED / speed;
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
    b.vx += ux * lean * PUSH;
    b.vy += uy * lean * PUSH;
    clampSpeed(b);
  };
  if (delay > 0) setTimeout(go, delay);
  else go();
}

/**
 * A continuous force on a piece for one sensor reading — the phone being
 * accelerated or tilted — as an acceleration in px/s² applied over `dt`
 * seconds. The jelly's own inertia does the rest: it lags, overshoots and
 * settles when the force stops.
 */
export function shove(el: Element, ax: number, ay: number, dt: number, reach = 1) {
  const b = bodyFor(el, { width: 1, height: 1 }, reach);
  if (!b) return;
  b.gooey = false;
  b.vx += ax * dt;
  b.vy += ay * dt;
  clampSpeed(b);
}
