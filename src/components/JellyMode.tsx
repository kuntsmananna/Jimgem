"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { HoverCard } from "@/components/HoverCard";
import { cubeColors } from "@/components/JellyLoader";
import { SERIES_COLORS } from "@/lib/chartPalette";
import { overlayOpen } from "./useOverlayDismiss";
import { COARSE_POINTER, matchesNow } from "./useMediaQuery";
import { shove, wobble } from "./wobble";

/**
 * Jelly mode (v0.79): an experience switch, not a setting. While it is on,
 * the small pieces of every page — cubes, chips, badges, icons, buttons —
 * wobble like jelly: as the mouse moves past them on a laptop, and as the
 * phone moves. Rows, panes, fields and text stay put, so the list can
 * still be worked with it on.
 *
 * **Off at the start of every visit**, the owner's call: it is a toy you
 * switch on, not a preference to remember — so it is plain React state in
 * the app layout, with no cookie and no storage.
 *
 * **It holds still while someone is working**: whenever a popup or sheet
 * is open (`overlayOpen`) or the caret is in a field, nothing wobbles and
 * whatever was moving settles.
 */
const JellyModeContext = createContext<{ on: boolean; toggle: () => void }>({ on: false, toggle: () => {} });

/**
 * What wobbles: the small things on a page — the jelly cubes, every chip
 * and badge (`.keeps-color`, `.chip-neutral`, which every chip already
 * wears), the extras marks (`data-jiggle`), every icon (`svg.lucide`),
 * every shared button (`.press`, which the filter chips wear), the nav's
 * pills and the logo (`data-jiggle-item`). One selector, so a new chip or
 * button joins without opting in.
 *
 * **Never the boxes they sit in** (v0.79.3). Rows, cards, tiles and panes
 * stood still while the pieces inside them wobbled: a square with straight
 * edges can only ever be leaned and stretched, which the owner found read
 * as a square being distorted rather than as jelly. `MAX_PIECE` is what
 * enforces it, so a big `.press` button or a figure tile is left alone by
 * size rather than by name.
 */
const JIGGLY =
  ".jelly-cube, .keeps-color, .chip-neutral, [data-jiggle], svg.lucide, .press, header nav a, nav[aria-label] a, nav[aria-label] button, [data-jiggle-item]";

/** Anything wider or taller than this, in px, is a box rather than a piece. */
const MAX_PIECE = 160;

/** How far from a slow pointer a piece still feels it, in px; a fast one reaches further. */
const REACH = 150;
/** Pointer travel between two ripples (px per ~90ms) that counts as a big sweep. */
const SWEEP = 260;
/** At most one ripple this often while the mouse keeps moving. */
const EVERY_MS = 90;
/** Pointer travel between two ripples for one to be as big as it gets. */
const FULL_PX = 90;
/** A phone's acceleration (m/s²) into the jelly's push (px/s²). */
const MOTION_GAIN = 65;
/** A phone's turning (°/s) into the jelly's push (px/s²). */
const TURN_GAIN = 2.5;

function holdingStill(): boolean {
  if (overlayOpen()) return true;
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
}

type Piece = { el: Element; x: number; y: number; width: number; height: number };

/** Every piece that is on screen, with its centre and size. */
function onScreen(): Piece[] {
  const out: Piece[] = [];
  for (const el of document.querySelectorAll(JIGGLY)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
    if (r.width > MAX_PIECE || r.height > MAX_PIECE) continue;
    out.push({ el, x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height });
  }
  return out;
}

/**
 * Every piece on screen at once, rippling out from (`x`, `y`) — a big
 * sweep of the mouse.
 */
function shockwave(x: number, y: number, ux: number, uy: number, strength: number) {
  for (const piece of onScreen()) {
    const distance = Math.hypot(piece.x - x, piece.y - y);
    wobble(piece.el, ux, uy, strength, Math.min(320, distance * 0.35), piece);
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
      for (const piece of onScreen()) {
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

  /*
   * The phone: every piece on screen at once. Moving the phone pushes
   * them — their inertia, so a jolt right throws them left — and turning
   * it sways them, both as continuous forces from the motion sensor rather
   * than a shake that has to cross a threshold (the first version's
   * threshold was missed by real shakes, so all anyone saw was the tilt).
   * Each piece has a spring of its own, so they ripple rather than move as
   * one.
   */
  useEffect(() => {
    if (!on || !matchesNow(COARSE_POINTER)) return;
    let pieces: Element[] = [];
    let refreshedAt = 0;
    let lastAt = 0;
    // Gravity, estimated, for phones that only report it mixed in.
    let gx = 0;
    let gy = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const now = performance.now();
      const dt = Math.min(0.05, lastAt ? (now - lastAt) / 1000 : 1 / 60);
      lastAt = now;
      if (holdingStill()) return;
      if (now - refreshedAt > 1000) {
        refreshedAt = now;
        pieces = onScreen().map((p) => p.el);
      }
      // Linear acceleration (m/s²), gravity removed — the sensor's own
      // where it gives one, else a high-pass of the mixed reading.
      let ax = e.acceleration?.x ?? null;
      let ay = e.acceleration?.y ?? null;
      if (ax === null || ay === null) {
        const raw = e.accelerationIncludingGravity;
        if (!raw || raw.x === null || raw.y === null) return;
        gx = gx * 0.9 + raw.x * 0.1;
        gy = gy * 0.9 + raw.y * 0.1;
        ax = raw.x - gx;
        ay = raw.y - gy;
      }
      // Turning (°/s): tipping left-right is gamma, forward-back is beta.
      const turnX = e.rotationRate?.gamma ?? 0;
      const turnY = e.rotationRate?.beta ?? 0;
      // Into screen px/s²: inertia opposes the phone's own movement, and
      // the sensor's y runs up where the screen's runs down.
      const fx = -ax * MOTION_GAIN + turnX * TURN_GAIN;
      const fy = ay * MOTION_GAIN + turnY * TURN_GAIN;
      if (Math.abs(fx) + Math.abs(fy) < 40) return;
      for (const el of pieces) shove(el, fx, fy, dt);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [on]);

  const value = useMemo(() => ({ on, toggle }), [on, toggle]);
  return <JellyModeContext.Provider value={value}>{children}</JellyModeContext.Provider>;
}

/**
 * iOS gives motion only after the person agrees, and only
 * when asked from inside a tap — which the switch is. Elsewhere the two
 * functions do not exist and the events simply arrive. A refusal leaves
 * the mode on and still; there is nothing useful to say about it.
 */
function askForMotion() {
  type Asks = { requestPermission?: () => Promise<string> };
  for (const api of [globalThis.DeviceMotionEvent] as unknown as Asks[]) {
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
/**
 * The cartoon "it's moving" marks either side of the blob — two short arcs
 * a side, the way a comic draws a wobble. Faint and still while the mode
 * is off; while it is on they pulse outward (`.jelly-switch.is-on`), so the
 * button reads as a mode that animates, not as one more icon.
 */
export function WiggleLines() {
  return (
    <svg aria-hidden viewBox="0 0 44 32" className="jelly-lines pointer-events-none absolute inset-0 h-full w-full" fill="none">
      <g className="jelly-lines-left" strokeLinecap="round" strokeWidth="1.6">
        <path d="M9 11 Q6 16 9 21" />
        <path d="M5.5 9 Q1.5 16 5.5 23" />
      </g>
      <g className="jelly-lines-right" strokeLinecap="round" strokeWidth="1.6">
        <path d="M35 11 Q38 16 35 21" />
        <path d="M38.5 9 Q42.5 16 38.5 23" />
      </g>
    </svg>
  );
}

/**
 * `icon` is the desktop header's switch, with its explaining hover card;
 * `sheet` is the same switch in the phone's More sheet, beside the name,
 * thumb-sized and with no hover card (on touch a card opens on the tap the
 * switch needs).
 */
export function JellyModeButton({ variant = "icon" }: { variant?: "icon" | "sheet" }) {
  const { on, toggle } = useJellyMode();
  if (variant === "sheet") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? "Jelly mode is on. Turn it off" : "Jelly mode: make the interface wobble"}
        className={`jelly-switch press relative flex h-10 w-13 items-center justify-center rounded-full ${on ? "is-on" : ""}`}
      >
        <WiggleLines />
        <JellyBlob size={21} on={on} />
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
        className={`jelly-switch press relative flex h-8 w-11 items-center justify-center rounded-full ${on ? "is-on" : ""}`}
      >
        <WiggleLines />
        <JellyBlob size={18} on={on} />
      </button>
    </HoverCard>
  );
}
