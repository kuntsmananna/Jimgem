import type { CSSProperties } from "react";
import { SERIES_COLORS, type SeriesColor } from "@/lib/chartPalette";

/**
 * The app's loaders, made of the product: sharp jelly cubes.
 *
 * No `"use client"` and no state — both are pure markup animated by CSS
 * (`.jelly-pile`, `.jelly-hop` and `.jelly-cube` in globals.css), so a
 * route's `loading.tsx` can render one from the server and it starts
 * moving before any JavaScript has arrived.
 */

/** A cube's colours as the custom properties `.jelly-cube` reads. */
export function cubeColors(color: Pick<SeriesColor, "colorGlow" | "colorBase" | "colorShadow">): CSSProperties {
  return {
    "--g": color.colorGlow,
    "--b": color.colorBase,
    "--s": color.colorShadow,
  } as CSSProperties;
}

const SIZE = 22;

/*
 * Six cubes, three on the floor, two on those and one on top — a heap,
 * placed slightly off-grid and each resting at its own small tilt. `sx` is
 * how far to the side it lands before tumbling into place (and so which
 * way it rolls), `r0` the quarter-turn it rolls through, `rf` the tilt it
 * stops at. Dropped in that order, 0.21s apart.
 */
const PILE: { left: number; bottom: number; sx: number; r0: number; rf: number; color: SeriesColor }[] = [
  { left: 4, bottom: 0, sx: 14, r0: 90, rf: -3, color: SERIES_COLORS.berry },
  { left: 50, bottom: 0, sx: -16, r0: -90, rf: 2, color: SERIES_COLORS.jasmine },
  { left: 27, bottom: 0, sx: 10, r0: 90, rf: 1, color: SERIES_COLORS.midori },
  { left: 15, bottom: 22, sx: -12, r0: -90, rf: -6, color: SERIES_COLORS.royale },
  { left: 39, bottom: 21, sx: 13, r0: 90, rf: 5, color: SERIES_COLORS.sage },
  { left: 27, bottom: 43, sx: -10, r0: -90, rf: -2, color: SERIES_COLORS.berry },
];

/**
 * The full loader: a heap of jelly building itself, with an optional line
 * under it. For a page or a section that is fetching.
 */
export function JellyPile({ label }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
      <div aria-hidden className="jelly-pile relative h-[70px] w-[78px] border-b-2 border-line">
        {PILE.map((cube, i) => (
          <span
            key={i}
            className="jelly-cube"
            style={{
              ...cubeColors(cube.color),
              left: cube.left,
              bottom: cube.bottom,
              width: SIZE,
              height: SIZE,
              animationDelay: `${i * 0.21}s`,
              "--sx": `${cube.sx}px`,
              "--r0": `${cube.r0}deg`,
              "--rf": `${cube.rf}deg`,
            } as CSSProperties}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-ink-soft">{label ?? "Loading…"}</span>
    </div>
  );
}

/**
 * The small loader, for a button or a chip that is saving: three cubes
 * hopping in turn, in the colour of the text around them.
 */
export function JellyHop({ size = 6, label = "Working" }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="jelly-hop inline-flex items-end gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="bg-current"
          style={{ width: size, height: size, animationDelay: `${i * 0.11}s` }}
        />
      ))}
    </span>
  );
}
