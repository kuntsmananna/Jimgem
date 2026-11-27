"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { shove, wobble } from "@/components/wobble";

type CubeColor = { g: string; b: string; s: string };

/** Under this pointer speed (px between readings) a brush is a rest. */
const STILL_PX = 2;
/** A brush this fast pushes with full strength. */
const FULL_PX = 40;
/** Phone acceleration (m/s²) into screen px/s², and turning (°/s) likewise. */
const MOTION_GAIN = 260;
const TURN_GAIN = 6;

/**
 * The customer's tray on the thank-you screen (v0.102, the owner's ask):
 * the flavours they bought, as a tray of jelly that wobbles under a finger
 * and when the phone is shaken. The same spring bodies (`wobble.ts`) the
 * dashboard's Jelly mode and the order form's tray preview move with, so
 * it is the same jelly.
 *
 * A finger brushing across ripples the cubes nearest it first. Shaking
 * reads `devicemotion` as a continuous force, as Jelly mode does; iOS
 * gives it only after the person agrees, from inside a tap, so there it
 * waits behind the "Shake it" button, and elsewhere it simply starts.
 * Nothing moves under `prefers-reduced-motion`.
 */
export function JellyTray({ cubes, shakeLabel }: { cubes: CubeColor[]; shakeLabel: string }) {
  const grid = useRef<HTMLDivElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [needsAsk, setNeedsAsk] = useState(false);
  const [listening, setListening] = useState(false);

  const columns = Math.max(1, Math.ceil(Math.sqrt(cubes.length)));
  const rows = Math.max(1, Math.ceil(cubes.length / columns));

  useEffect(() => {
    const asks = (globalThis.DeviceMotionEvent as unknown as { requestPermission?: unknown } | undefined)
      ?.requestPermission;
    // A laptop has no motion to read, whatever the browser claims.
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    // Deciding where the events come from needs the browser, so it is
    // decided once on mount rather than during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof asks === "function") setNeedsAsk(true);
    else setListening(true);
  }, []);

  useEffect(() => {
    if (!listening || !grid.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = grid.current;
    let lastAt = 0;
    let gx = 0;
    let gy = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const now = performance.now();
      const dt = Math.min(0.05, lastAt ? (now - lastAt) / 1000 : 1 / 60);
      lastAt = now;
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
      const fx = -ax * MOTION_GAIN + (e.rotationRate?.gamma ?? 0) * TURN_GAIN;
      const fy = ay * MOTION_GAIN + (e.rotationRate?.beta ?? 0) * TURN_GAIN;
      if (Math.abs(fx) + Math.abs(fy) < 40) return;
      for (const cube of Array.from(box.children)) shove(cube, fx, fy, dt);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [listening]);

  const ask = () => {
    const api = globalThis.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    api
      .requestPermission?.()
      .then((answer) => {
        if (answer === "granted") {
          setListening(true);
          setNeedsAsk(false);
        }
      })
      .catch(() => {});
  };

  const brush = (e: PointerEvent<HTMLDivElement>) => {
    const previous = last.current;
    last.current = { x: e.clientX, y: e.clientY };
    if (!previous) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    const speed = Math.hypot(dx, dy);
    if (speed < STILL_PX) return;
    const strength = Math.min(1, speed / FULL_PX);
    for (const cube of Array.from(e.currentTarget.children)) {
      const r = cube.getBoundingClientRect();
      const distance = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
      const reach = 1 - distance / (r.width * 4);
      if (reach <= 0) continue;
      wobble(cube, dx / speed, dy / speed, strength * reach, Math.min(120, distance * 0.35), r);
    }
  };

  if (cubes.length === 0) return null;
  return (
    <div className="flex flex-col items-center">
      <div
        ref={grid}
        onPointerMove={brush}
        onPointerDown={(e) => (last.current = { x: e.clientX, y: e.clientY })}
        onPointerLeave={() => (last.current = null)}
        data-tray
        className="grid touch-none gap-1.5 rounded-[18px] bg-[#ead9cf] p-3 shadow-[inset_0_2px_6px_rgb(60_30_10/0.18)] select-none"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, auto)`,
          gridAutoFlow: "column",
          width: `min(100%, ${columns * 30 + 24}px)`,
        }}
        aria-hidden
      >
        {cubes.map((c, i) => (
          <span
            key={i}
            className="jelly-cube motion-pop block aspect-square rounded-[4px]"
            style={{ "--g": c.g, "--b": c.b, "--s": c.s, animationDelay: `${120 + i * 22}ms` } as CSSProperties}
          />
        ))}
      </div>
      {needsAsk && (
        <button
          type="button"
          onClick={ask}
          className="press mt-2.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-bold"
        >
          {shakeLabel}
        </button>
      )}
    </div>
  );
}
