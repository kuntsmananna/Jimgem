"use client";

import { useMemo } from "react";
import type { OrderLineFlavor } from "@/lib/orderTypes";
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
 * Deterministic PRNG. The scatter has to survive a re-render — reshuffling
 * every keystroke would make the preview flicker and stop reading as
 * "this is the tray".
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
 * One entry per cube, shuffled into an assorted mix. `null` is a cube
 * with no flavour assigned yet, which is how an unbalanced line shows.
 */
function cubeOrder(entries: OrderLineFlavor[], total: number, seed: number): (string | null)[] {
  const cubes: (string | null)[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.units && cubes.length < total; i++) cubes.push(entry.flavorId);
  }
  while (cubes.length < total) cubes.push(null);

  const random = mulberry32(seed);
  for (let i = cubes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cubes[i], cubes[j]] = [cubes[j], cubes[i]];
  }
  return cubes;
}

/**
 * What the packed tray looks like: a grid of jelly cubes in the chosen
 * flavours, assorted the way a real mixed tray is rather than sorted into
 * blocks.
 *
 * Replaced the draggable split bar. The bar showed proportions accurately
 * but never showed the *product* — this is the thing being handed to a
 * customer, so getting the mix wrong is visible at a glance.
 */
export function TrayPreview({
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
  const assigned = entries.reduce((sum, e) => sum + e.units, 0);

  if (totalUnits <= 0) {
    return <p className="text-xs text-ink-soft">Set a quantity to see the tray.</p>;
  }

  // Loose units have no tray to divide into — draw the whole run at once.
  const loose = unitsPerPackage <= 1;
  const sampled = totalUnits > SAMPLE_THRESHOLD;

  if (loose || sampled) {
    const shown = sampled ? SAMPLE_CUBES : totalUnits;
    const scale = totalUnits / shown;
    const scaledEntries = entries.map((e) => ({ flavorId: e.flavorId, units: Math.round(e.units / scale) }));
    return (
      <div className="flex flex-col gap-2">
        <Grid
          cubes={cubeOrder(sampled ? scaledEntries : entries, shown, totalUnits * 7919 + entries.length)}
          columns={Math.min(25, Math.ceil(Math.sqrt(shown * 1.7)))}
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

  return (
    <div className="flex flex-col gap-2">
      <Grid
        cubes={cubeOrder(perTray, unitsPerPackage, unitsPerPackage * 7919 + entries.length)}
        columns={trayColumns(unitsPerPackage)}
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
}

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
