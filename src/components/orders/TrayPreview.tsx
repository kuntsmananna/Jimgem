"use client";

import { memo, useMemo, useRef, type PointerEvent } from "react";
import { evenSplit, type OrderLineFlavor } from "@/lib/orderTypes";
import type { Flavor } from "@/lib/settings";
import { flavorCubeGradient, isMixFlavor } from "@/lib/flavorStyle";
import { wobble, WOBBLE_MS } from "@/components/wobble";

/**
 * Above this many units a literal grid stops being readable — cubes drop
 * below a few pixels and the colours blur into mud. Past it the preview
 * draws a proportional sample instead and says so.
 */
const SAMPLE_THRESHOLD = 300;
const SAMPLE_CUBES = 200;

/**
 * The widest a single cube is allowed to draw, in px.
 *
 * The grid stretches to its container, so without this a nine-unit box —
 * three columns — would render three enormous squares across the whole
 * panel. Capping the cube instead of the grid keeps every preview drawn at
 * the same scale, so a small tray beside a big one reads as smaller rather
 * than as the same picture at a different zoom.
 */
const MAX_CUBE = 22;
const CUBE_GAP = 2;
const GRID_PADDING = 8;

/**
 * Cubes across, chosen to make the grid as square as it can be: 9 cubes
 * are 3 × 3, 100 are 10 × 10.
 *
 * It used to be three fixed widths by package size, which drew a small
 * tray as 10 × 5 and a big one as 15 × 10 — the same jelly reading as a
 * different shape depending on how it was packed. A square block is what
 * a tray of cubes actually looks like, and it makes two packages
 * comparable at a glance.
 *
 * A count that isn't a perfect square leaves the last column or two a
 * cube short, which `cubeOrder` already handles.
 */
function gridColumns(total: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(total)));
}

/**
 * Deterministic PRNG, used only for the scatter inside a MIX. The result
 * has to survive a re-render — reshuffling on every keystroke would make
 * the preview flicker and stop reading as "this is the tray".
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The cubes in the order they were ordered, one flavour's worth at a time.
 *
 * A **MIX** line is the exception: it expands into an even spread of every
 * other flavour and that spread is then shuffled, so the mix reads as
 * genuinely assorted rather than as a row of neat sub-blocks. It still
 * occupies one contiguous stretch of the run, so laying the run out by
 * column puts the whole mix in its own columns — assorted within, blocked
 * without, which is what "one tray, part of it mixed" actually looks like.
 *
 * The shuffle is confined to the mix's own cubes, so a named flavour beside
 * it keeps its solid columns.
 */
function flavorRun(entries: OrderLineFlavor[], flavors: Flavor[], seed: number): string[] {
  const mixIds = new Set(flavors.filter(isMixFlavor).map((f) => String(f.id)));
  const spreadIds = flavors.filter((f) => !isMixFlavor(f) && !f.archivedAt).map((f) => String(f.id));
  const random = mulberry32(seed);

  const run: string[] = [];
  for (const entry of entries) {
    // With nothing to spread into, MIX stays a colour of its own rather
    // than vanishing from a tray someone ordered.
    if (!mixIds.has(entry.flavorId) || spreadIds.length === 0) {
      for (let i = 0; i < entry.units; i++) run.push(entry.flavorId);
      continue;
    }
    const mixed = evenSplit(spreadIds, entry.units).flatMap((part) =>
      Array<string>(part.units).fill(part.flavorId),
    );
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    run.push(...mixed);
  }
  return run;
}

/**
 * One entry per cube, laid out **by column**: each flavour takes whole
 * columns and at most one partial one, filling top to bottom then left to
 * right. `null` is a cube with no flavour assigned yet, which is how an
 * unbalanced line shows — and it lands in the last columns, so what is
 * still unspoken for is one block rather than gaps throughout.
 *
 * Every cube used to be shuffled into a single assortment. That is what a
 * real mixed tray looks like, but it cost the thing the preview is for:
 * with the colours scattered you cannot read the split back off the
 * picture. Columns for the named flavours, scatter kept where the order
 * genuinely *is* assorted (see `flavorRun`), gets both.
 *
 * The grid fills row-major, so a column's cubes are the positions
 * `col`, `col + columns`, `col + 2·columns`… and this writes the run into
 * those rather than in order.
 */
function cubeOrder(run: string[], total: number, columns: number): (string | null)[] {
  const padded: (string | null)[] = run.slice(0, total);
  while (padded.length < total) padded.push(null);

  const cubes: (string | null)[] = new Array(total).fill(null);
  const rows = Math.ceil(total / columns);
  let next = 0;
  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      const index = row * columns + col;
      // A partial last row leaves the rightmost columns a cube shorter.
      // Skipping without consuming keeps every column taking exactly the
      // cubes it has room for, so nothing shifts by one.
      if (index < total) cubes[index] = padded[next++];
    }
  }
  return cubes;
}

/**
 * What the packed tray looks like: a grid of jelly cubes in the chosen
 * flavours, each one filling whole columns and at most one partial column.
 *
 * Replaced the draggable split bar. The bar showed proportions accurately
 * but never showed the *product* — this is the thing being handed to a
 * customer, so getting the mix wrong is visible at a glance. Laying the
 * flavours out in columns keeps both halves of that: it is still a picture
 * of the tray, and the split can be read straight off it.
 */
export const TrayPreview = memo(function TrayPreview({
  entries,
  unitsPerPackage,
  quantity,
  flavors,
  packageName,
}: {
  entries: OrderLineFlavor[];
  unitsPerPackage: number;
  quantity: number;
  flavors: Flavor[];
  packageName: string;
}) {
  const colorFor = useMemo(() => {
    const map = new Map(flavors.map((f) => [String(f.id), flavorCubeGradient(f)]));
    return (id: string | null) => (id === null ? null : (map.get(id) ?? null));
  }, [flavors]);

  const totalUnits = unitsPerPackage * quantity;
  if (totalUnits <= 0) {
    return <p className="text-xs text-ink-soft">Set a quantity to see the tray.</p>;
  }

  const assigned = entries.reduce((sum, e) => sum + e.units, 0);

  // Loose units have no tray to divide into — draw the whole run at once.
  const loose = unitsPerPackage <= 1;
  const sampled = totalUnits > SAMPLE_THRESHOLD;

  if (loose || sampled) {
    const shown = sampled ? SAMPLE_CUBES : totalUnits;
    const scale = totalUnits / shown;
    // Scaled before the run is built, not after: a MIX line has to reach
    // flavorRun still whole, or there is nothing left to recognise as one.
    const scaled = sampled
      ? entries.map((e) => ({ flavorId: e.flavorId, units: Math.round(e.units / scale) }))
      : entries;
    const columns = gridColumns(shown);
    return (
      <div className="flex flex-col gap-2">
        <Grid
          cubes={cubeOrder(flavorRun(scaled, flavors, shown * 7919 + entries.length), shown, columns)}
          columns={columns}
          colorFor={colorFor}
        />
        <p className="text-[11px] text-ink-soft">
          {sampled
            ? `${totalUnits.toLocaleString()} units — 1 cube ≈ ${Math.round(scale)} units`
            : `${totalUnits.toLocaleString()} loose units`}
          {assigned < totalUnits && ` · ${(totalUnits - assigned).toLocaleString()} unassigned`}
        </p>
      </div>
    );
  }

  /*
   * One tray, not one per package. Every tray on a line is packed to the
   * same recipe by construction, so drawing five identical grids was five
   * times the scrolling for no extra information — the count says the
   * rest.
   */
  const perTray = entries.map((e) => ({ flavorId: e.flavorId, units: Math.round(e.units / quantity) }));
  const columns = gridColumns(unitsPerPackage);

  return (
    <div className="flex flex-col gap-2">
      <Grid
        cubes={cubeOrder(
          flavorRun(perTray, flavors, unitsPerPackage * 7919 + entries.length),
          unitsPerPackage,
          columns,
        )}
        columns={columns}
        colorFor={colorFor}
      />
      <p className="text-[11px] text-ink-soft">
        One {packageName.toLowerCase()} · {unitsPerPackage} units
        {quantity > 1 && (
          <>
            {" "}
            × <span className="font-bold text-ink">{quantity}</span> ={" "}
            {totalUnits.toLocaleString()} units
          </>
        )}
        {assigned < totalUnits && ` · ${(totalUnits - assigned).toLocaleString()} unassigned`}
      </p>
    </div>
  );
});

function Grid({
  cubes,
  columns,
  colorFor,
}: {
  cubes: (string | null)[];
  columns: number;
  colorFor: (id: string | null) => string | null;
}) {
  const jiggle = useJiggle(columns);
  return (
    <div
      onPointerMove={jiggle}
      className="grid gap-[2px] rounded-lg bg-black/[0.07] p-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        maxWidth: columns * MAX_CUBE + (columns - 1) * CUBE_GAP + GRID_PADDING * 2,
      }}
      role="img"
      aria-label="Preview of the packed tray"
    >
      {cubes.map((id, i) => {
        const background = colorFor(id);
        return (
          <span
            key={i}
            className={`aspect-square origin-bottom rounded-[2px] ${background ? "" : "bg-line/60"}`}
            style={background ? { background } : undefined}
          />
        );
      })}
    </div>
  );
}

/** At most one new wobble this often while the pointer keeps moving. */
const JIGGLE_EVERY_MS = 110;
/** How far the pointer travels between two wobbles for one to be as big as it gets. */
const JIGGLE_FULL_PX = 96;

/**
 * Brushing the pointer across a tray wobbles the cubes like jelly, in the
 * direction the pointer went.
 *
 * Each cube leans that way from its base (`origin-bottom` — it sits on
 * the tray), springs back past upright and settles in three shrinking
 * swings, squashing as it leans. The cubes nearest the pointer go first
 * and the far ones a beat later, so the wobble runs across the tray as a
 * ripple rather than the whole grid twitching as one. How far they lean
 * follows how fast the pointer moved, so a slow pass barely stirs them.
 *
 * Web Animations rather than a CSS class, because the direction and size
 * differ every time and a keyframe cannot take them as arguments without
 * restarting the animation by removing and re-adding the class. A new
 * wobble cancels the one before it on each cube rather than stacking on
 * it. Each cube's centre is worked out from the grid's geometry, not
 * measured: a rect read per cube between `animate()` calls forced a style
 * flush per cube, and caught cubes still skewed by the last wobble. Off
 * entirely under `prefers-reduced-motion`, and it never moves anything but
 * `transform`.
 */
function useJiggle(columns: number) {
  const last = useRef<{ x: number; y: number; at: number } | null>(null);
  return (e: PointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    const previous = last.current;
    if (previous && now - previous.at < JIGGLE_EVERY_MS) return;
    last.current = { x: e.clientX, y: e.clientY, at: now };
    if (!previous || now - previous.at > WOBBLE_MS) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    const speed = Math.hypot(dx, dy);
    if (speed < 2) return;
    const strength = Math.min(1, speed / JIGGLE_FULL_PX);
    const ux = dx / speed;
    const uy = dy / speed;

    const grid = e.currentTarget.getBoundingClientRect();
    const size = (grid.width - 2 * GRID_PADDING - (columns - 1) * CUBE_GAP) / columns;
    const cubes = Array.from(e.currentTarget.children);
    cubes.forEach((cube, i) => {
      const cx = grid.left + GRID_PADDING + (i % columns) * (size + CUBE_GAP) + size / 2;
      const cy = grid.top + GRID_PADDING + Math.floor(i / columns) * (size + CUBE_GAP) + size / 2;
      const distance = Math.hypot(cx - e.clientX, cy - e.clientY);
      // Close cubes take the whole push and it fades to nothing over ~6
      // cubes' width — so the work follows the ripple, not the tray: an
      // event tray of a thousand cubes still animates a few dozen.
      const reach = 1 - distance / (size * 6);
      if (reach <= 0) return;
      wobble(cube, ux, uy, strength * reach, Math.min(120, distance * 0.35));
    });
  };
}
