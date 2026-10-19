/**
 * One jelly wobble, shared by the tray preview's cubes and jelly mode.
 *
 * The element leans the way it was pushed (`ux`, `uy`, a unit direction),
 * springs back past upright and settles in three shrinking swings,
 * squashing as it leans — pushed down it squashes, pulled up it stretches.
 * `lean` is 0-1, how hard. Web Animations rather than a CSS class, because
 * the direction and size differ every time; a new wobble cancels the one
 * before it on the same element rather than stacking on it. It only ever
 * moves `transform`.
 */
const running = new WeakMap<Element, Animation>();

/** How long one wobble takes to settle. */
export const WOBBLE_MS = 700;

export function wobble(el: Element, ux: number, uy: number, lean: number, delay = 0) {
  const pose = (k: number) => {
    const skew = -ux * 14 * lean * k;
    const shift = ux * 2 * lean * k;
    const squash = 1 - uy * 0.12 * lean * k;
    return `translateX(${shift}px) skewX(${skew}deg) scale(${2 - squash}, ${squash})`;
  };
  running.get(el)?.cancel();
  running.set(
    el,
    el.animate(
      [
        { transform: "none" },
        { transform: pose(1), offset: 0.16 },
        { transform: pose(-0.55), offset: 0.4 },
        { transform: pose(0.28), offset: 0.62 },
        { transform: pose(-0.1), offset: 0.82 },
        { transform: "none" },
      ],
      { duration: WOBBLE_MS, easing: "ease-out", delay, fill: "backwards" },
    ),
  );
}
