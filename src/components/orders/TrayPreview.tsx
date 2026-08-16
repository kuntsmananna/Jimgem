"use client";

import { memo, useMemo } from "react";
import { expandMixFlavors, type OrderLineFlavor } from "@/lib/orderTypes";
import type { Flavor } from "@/lib/settings";
import { flavorCubeGradient } from "@/lib/flavorStyle";

/**
 * Above this many units a literal grid stops being readable — cubes drop
 * below a few pixels and the colours blur into mud. Past it the preview
 * draws a proportional sample instead and says so.
 */
const SAMPLE_THRESHOLD = 300;
const SAMPLE_CUBES = 200;

/** Cubes across, per package. Fixed so a tray always reads as the same shape. */
export function trayColumns(unitsPerPackage: number): number {
  if (unitsPerPackage <= 1) return 20;
  if (unitsPerPackage <= 60) return 10;
  return 15;
}

/**
 * One entry per cube, laid out **by column**: each flavour takes whole
 * columns and at most one partial one, filling top to bottom then left to
 * right. `null` is a cube with no flavour assigned yet, which is how an
 * unbalanced line shows — and it lands in the last columns, so what is
 * still unspoken for is one block rather than gaps throughout.
 *
 * Cubes used to be shuffled into a random assortment, which is what a real
 * mixed tray looks like. It cost the thing the preview is for: with the
 * colours scattered you cannot read the split back off the picture, and
 * "is this roughly half and half" was a counting exercise.
 *
 * The grid fills row-major, so a column's cubes are the positions
 * `col`, `col + columns`, `col + 2·columns`… and this writes each
 * flavour's run into those rather than in order.
 */
function cubeOrder(entries: OrderLineFlavor[], total: number, columns: number): (string | null)[] {
  const run: (string | null)[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.units && run.length < total; i++) run.push(entry.flavorId);
  }
  while (run.length < total) run.push(null);

  const cubes: (string | null)[] = new Array(total).fill(null);
  const rows = Math.ceil(total / columns);
  let next = 0;
  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      const index = row * columns + col;
      // A partial last row leaves the rightmost columns a cube shorter.
      // Skipping without consuming keeps every column taking exactly the
      // cubes it has room for, so nothing shifts by one.
      if (index < total) cubes[index] = run[next++];
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
  // Everything below draws from the expanded copy; `entries` stays the
  // source of truth for the unassigned count reported alongside it.
  const drawn = expandMixFlavors(entries, flavors);

  // Loose units have no tray to divide into — draw the whole run at once.
  const loose = unitsPerPackage <= 1;
  const sampled = totalUnits > SAMPLE_THRESHOLD;

  if (loose || sampled) {
    const shown = sampled ? SAMPLE_CUBES : totalUnits;
    const scale = totalUnits / shown;
    const scaledEntries = drawn.map((e) => ({ flavorId: e.flavorId, units: Math.round(e.units / scale) }));
    const columns = Math.min(25, Math.ceil(Math.sqrt(shown * 1.7)));
    return (
      <div className="flex flex-col gap-2">
        <Grid
          cubes={cubeOrder(sampled ? scaledEntries : drawn, shown, columns)}
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
  const perTray = drawn.map((e) => ({ flavorId: e.flavorId, units: Math.round(e.units / quantity) }));
  const columns = trayColumns(unitsPerPackage);

  return (
    <div className="flex flex-col gap-2">
      <Grid
        cubes={cubeOrder(perTray, unitsPerPackage, columns)}
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
  return (
    <div
      className="grid gap-[2px] rounded-lg bg-black/[0.07] p-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role="img"
      aria-label="Preview of the packed tray"
    >
      {cubes.map((id, i) => {
        const background = colorFor(id);
        return (
          <span
            key={i}
            className={`aspect-square rounded-[2px] ${background ? "" : "bg-line/60"}`}
            style={background ? { background } : undefined}
          />
        );
      })}
    </div>
  );
}
