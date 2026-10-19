"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { HoverCard } from "@/components/HoverCard";
import { cubeColors } from "@/components/JellyLoader";
import { SERIES_COLORS } from "@/lib/chartPalette";
import { overlayOpen } from "./useOverlayDismiss";
import { COARSE_POINTER, matchesNow } from "./useMediaQuery";
import { wobble } from "./wobble";

/**
 * Jelly mode (v0.79): an experience switch, not a setting. While it is on,
 * the app's decorative pieces — jelly cubes, chips, badges, the extras
 * marks and the figure tiles — wobble like jelly: as the mouse moves past
 * them on a laptop, and when the phone is shaken or tilted. Rows, panes,
 * fields and text never move, so the list can still be worked with it on.
 *
 * **Off at the start of every visit**, the owner's call: it is a toy you
 * switch on, not a preference to remember — so it is plain React state in
 * the app layout, with no cookie and no storage.
 *
 * **It holds still while someone is working**: whenever a popup or sheet
 * is open (`overlayOpen`) or the caret is in a field, nothing wobbles and
 * the tilt eases back to upright.
 */
const JellyModeContext = createContext<{ on: boolean; toggle: () => void }>({ on: false, toggle: () => {} });

/**
 * What wobbles. The two chip markers every chip in the app already wears
 * (`.keeps-color`, `.chip-neutral`), the jelly cubes, and `data-jiggle` for
 * the rest — the extras marks and the figure tiles. One selector, so a new
 * chip wobbles without anyone remembering to opt it in.
 */
const JIGGLY = ".jelly-cube, .keeps-color, .chip-neutral, [data-jiggle]";

/**
 * What a big sweep or a hard shake moves as well: the page's panes and the
 * Orders table's rows — the whole interface, briefly, and much more gently
 * than the pieces (`wobble` scales its swing down with size).
 */
const WHOLE = "main section, main .rounded-card, .orders-rows > tr:not(.day-row)";

/** How far from a slow pointer a piece still feels it, in px; a fast one reaches further. */
const REACH = 150;
/** Pointer travel between two ripples (px per ~90ms) that counts as a big sweep. */
const SWEEP = 260;
/** At most one ripple this often while the mouse keeps moving. */
const EVERY_MS = 90;
/** Pointer travel between two ripples for one to be as big as it gets. */
const FULL_PX = 90;
/** Acceleration (m/s², gravity removed) that counts as a shake. */
const SHAKE = 11;
/** Furthest a tilted phone leans the pieces, in degrees. */
const MAX_TILT = 6;

function holdingStill(): boolean {
  if (overlayOpen()) return true;
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
}

type Piece = { el: Element; x: number; y: number; width: number; height: number };

/** Everything matching `selector` that is on screen, with its centre and size. */
function onScreen(selector: string): Piece[] {
  const out: Piece[] = [];
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
    out.push({ el, x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height });
  }
  return out;
}

/**
 * Everything on screen at once, rippling out from (`x`, `y`) — a big sweep
 * of the mouse or a hard shake. The pieces take it at full strength and
 * the panes and rows at a fraction, so the whole interface moves but only
 * the jelly really wobbles.
 */
function shockwave(x: number, y: number, ux: number, uy: number, strength: number) {
  for (const [selector, scale] of [
    [WHOLE, 0.45],
    [JIGGLY, 1],
  ] as const) {
    for (const piece of onScreen(selector)) {
      const distance = Math.hypot(piece.x - x, piece.y - y);
      wobble(piece.el, ux, uy, strength * scale, Math.min(320, distance * 0.35), piece);
    }
  }
}

export function JellyModeProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);

  const toggle = useCallback(() => {
    // Asked here, inside the tap, because that is the only place iOS will
    // let it be asked.
    if (!on) askForMotion();
    setOn(!on);
  }, [on]);

  // The mouse: a ripple from wherever the pointer is, in the way it went.
  useEffect(() => {
    if (!on) return;
    document.documentElement.classList.add("jelly-on");
    let last: { x: number; y: number; at: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const now = performance.now();
      const previous = last;
      if (previous && now - previous.at < EVERY_MS) return;
      last = { x: e.clientX, y: e.clientY, at: now };
      if (!previous || now - previous.at > 500 || holdingStill()) return;
      const dx = e.clientX - previous.x;
      const dy = e.clientY - previous.y;
      const speed = Math.hypot(dx, dy);
      if (speed < 3) return;
      const strength = Math.min(1, speed / FULL_PX);
      if (speed > SWEEP) {
        shockwave(e.clientX, e.clientY, dx / speed, dy / speed, 1);
        return;
      }
      // A faster pointer reaches further, up to three times as far.
      const radius = REACH * Math.min(3, 1 + speed / 120);
      for (const piece of onScreen(JIGGLY)) {
        const distance = Math.hypot(piece.x - e.clientX, piece.y - e.clientY);
        const reach = 1 - distance / radius;
        if (reach <= 0) continue;
        wobble(piece.el, dx / speed, dy / speed, strength * reach, Math.min(160, distance * 0.4), piece);
      }
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.classList.remove("jelly-on");
    };
  }, [on]);

  // The phone: a shake bounces everything on screen; a tilt leans it.
  useEffect(() => {
    if (!on || !matchesNow(COARSE_POINTER)) return;
    const html = document.documentElement;
    const root = html.style;
    html.classList.add("jelly-tilt");
    let lastShake = 0;
    let frame = 0;
    let tilt = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (!a || a.x === null || a.y === null) return;
      const force = Math.hypot(a.x, a.y, a.z ?? 0);
      const now = performance.now();
      if (force < SHAKE || now - lastShake < 350 || holdingStill()) return;
      lastShake = now;
      // Screen y runs down where the sensor's runs up.
      const len = Math.hypot(a.x, a.y) || 1;
      const strength = Math.min(1, force / (SHAKE * 2.5));
      // A hard shake moves the whole interface, like a big mouse sweep.
      if (force > SHAKE * 2) {
        shockwave(window.innerWidth / 2, window.innerHeight / 2, a.x / len, -a.y / len, strength);
        return;
      }
      for (const piece of onScreen(JIGGLY)) {
        wobble(piece.el, a.x / len, -a.y / len, strength, Math.random() * 140, piece);
      }
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      // Left-right tilt, -90..90; a gentle tilt is enough to see it. Eased
      // toward the reading rather than jumping to it, so a hand's tremor
      // is a sway and holding still settles upright smoothly.
      const target = holdingStill() ? 0 : Math.max(-1, Math.min(1, (e.gamma ?? 0) / 35)) * MAX_TILT;
      tilt += (target - tilt) * 0.2;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.setProperty("--jelly-tilt", `${tilt.toFixed(2)}deg`);
      });
    };
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onTilt);
      cancelAnimationFrame(frame);
      root.removeProperty("--jelly-tilt");
      html.classList.remove("jelly-tilt");
    };
  }, [on]);

  const value = useMemo(() => ({ on, toggle }), [on, toggle]);
  return <JellyModeContext.Provider value={value}>{children}</JellyModeContext.Provider>;
}

/**
 * iOS gives motion and orientation only after the person agrees, and only
 * when asked from inside a tap — which the switch is. Elsewhere the two
 * functions do not exist and the events simply arrive. A refusal leaves
 * the mode on and still; there is nothing useful to say about it.
 */
function askForMotion() {
  type Asks = { requestPermission?: () => Promise<string> };
  for (const api of [globalThis.DeviceMotionEvent, globalThis.DeviceOrientationEvent] as unknown as Asks[]) {
    api?.requestPermission?.().catch(() => {});
  }
}

export function useJellyMode() {
  return useContext(JellyModeContext);
}

/**
 * The switch's face: an irregular blob of jelly (`.jelly-blob` in
 * globals.css) that quivers for as long as the mode is on. Exported for the
 * staff bottom bar's cell, which takes an icon component.
 */
export function JellyBlob({ size = 16, on = false }: { size?: number; on?: boolean }) {
  return (
    <span
      aria-hidden
      className={`jelly-blob ${on ? "is-quivering" : ""}`}
      style={{ ...cubeColors(SERIES_COLORS.berry), width: size, height: size * 0.8 }}
    />
  );
}

/**
 * Beside the What's new sparkle in the nav (`icon`), and as a row in the
 * phone's More sheet or a cell in a staff account's bottom bar (`row`,
 * `cell`). Selected is the fill, as everywhere in the app.
 */
export function JellyModeButton({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { on, toggle } = useJellyMode();
  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className={`flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-semibold ${on ? "" : "opacity-60"}`}
      >
        <JellyBlob size={17} on={on} />
        <span className="flex-1">Jelly mode</span>
        <span className="text-xs font-medium opacity-70">{on ? "On — shake or tilt" : "Off"}</span>
      </button>
    );
  }
  return (
    <HoverCard
      width={220}
      height={80}
      tone="ink"
      placement="below-right"
      render={() => (
        <div className="text-xs leading-snug">
          <p className="font-bold">Jelly mode {on ? "is on" : ""}</p>
          <p className="mt-0.5 opacity-75">
            Just for fun: cubes, chips and tiles wobble as your mouse moves past. Off again next visit.
          </p>
        </div>
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? "Jelly mode is on. Turn it off" : "Jelly mode: make the interface wobble"}
        className={`press flex h-8 w-8 items-center justify-center rounded-full transition ${
          on ? "bg-black" : "hover:bg-black/5"
        }`}
      >
        <JellyBlob size={20} on={on} />
      </button>
    </HoverCard>
  );
}
