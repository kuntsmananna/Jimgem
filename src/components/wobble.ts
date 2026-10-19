/**
 * One jelly wobble, shared by the tray preview's cubes and jelly mode.
 *
 * A damped spring rather than a fixed pose (v0.79): the element is
 * shoved the way it was pushed (`ux`, `uy`, a unit direction), overshoots,
 * swings back and settles, and each part of that moves on its own phase —
 * the shove leads, the lean follows a beat behind, the squash-and-stretch
 * lags further and keeps its volume (wider as it gets shorter). That lag
 * between parts is what reads as jelly; the first version skewed every
 * part in lockstep, which read as a square being distorted. Small pieces
 * (`gooey`) also soften their corners mid-wobble and firm up as they
 * settle, the way a cube of jelly loses its edges when it is shaken.
 *
 * `lean` is 0-1, how hard. Web Animations, because direction and size
 * differ every time; a new wobble cancels the one before it on the same
 * element rather than stacking on it. It moves `transform` and, for a
 * gooey piece, `border-radius` — never layout.
 */
const running = new WeakMap<Element, Animation>();
const restingRadius = new WeakMap<Element, string>();

/** How long one wobble takes to settle. */
export const WOBBLE_MS = 950;

/** Keyframes sampled along the spring. */
const STEPS = 16;

/** A damped spring's swing at time `t` (0-1), starting from rest. */
function spring(t: number): number {
  if (t <= 0) return 0;
  return Math.exp(-4.2 * t) * Math.sin(2 * Math.PI * 2.3 * t);
}

/**
 * `size` is the piece's box when the caller has already measured it — the
 * tray computes its cubes' size from the grid, and jelly mode has every
 * rect from finding the pieces. Measured here only as a fallback: a read
 * between `animate()` calls costs a style flush per piece.
 */
export function wobble(
  el: Element,
  ux: number,
  uy: number,
  lean: number,
  delay = 0,
  size?: { width: number; height: number },
) {
  const box = size ?? el.getBoundingClientRect();
  // Large pieces — a figure tile, a pane in a big shake — swing less, or a
  // 300px tile turned 7° would sweep across its neighbours.
  const reach = Math.min(1, 60 / Math.max(box.width, box.height, 1)) * 0.6 + 0.4;
  const gooey = box.width <= 40 && box.height <= 40;
  if (gooey && !restingRadius.has(el)) restingRadius.set(el, getComputedStyle(el).borderRadius);

  const frames: Keyframe[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const shove = spring(t) * lean;
    const sway = spring(t - 0.05) * lean;
    const squash = spring(t - 0.09) * lean;
    const tx = ux * 5 * reach * shove;
    const ty = uy * 4 * reach * shove;
    const turn = (ux * 7 - uy * 2) * sway * reach;
    const skew = -ux * 6 * sway * reach;
    const sx = 1 + 0.13 * squash * reach;
    const sy = 1 / sx;
    const frame: Keyframe = {
      offset: t,
      transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${turn.toFixed(2)}deg) skewX(${skew.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
    };
    if (gooey) {
      // Corners soften with the swing's size and firm up as it dies away,
      // each corner a little differently so the outline goes irregular.
      const melt = Math.min(1, Math.abs(spring(t - 0.03)) * lean * 1.6);
      frame.borderRadius =
        t === 0 || t === 1
          ? restingRadius.get(el)!
          : `${(14 + 30 * melt).toFixed(0)}% ${(10 + 38 * melt).toFixed(0)}% ${(16 + 26 * melt).toFixed(0)}% ${(8 + 34 * melt).toFixed(0)}%`;
    }
    frames.push(frame);
  }
  frames[frames.length - 1].transform = "none";

  running.get(el)?.cancel();
  running.set(
    el,
    el.animate(frames, { duration: WOBBLE_MS, easing: "linear", delay, fill: "backwards" }),
  );
}
