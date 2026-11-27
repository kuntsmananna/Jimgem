import type { ContentPreset, Flavor, PackageType } from "./settings";
import { isMixFlavor } from "./flavorStyle";

/**
 * A preset as the event screens show it: its name, how many it holds, its
 * usual price and the colour of its biggest flavour, so a box reads as a
 * box of jelly rather than as a word. Client-safe — plain data in, plain
 * data out.
 */
export interface PresetSummary {
  id: number;
  name: string;
  units: number;
  usualPrice: number | null;
  color: { g: string; b: string; s: string };
}

const NEUTRAL = { g: "#efe6df", b: "#d9cbc1", s: "#b9a89c" };

export function presetSummaries(presets: ContentPreset[], flavors: Flavor[], packageTypes: PackageType[]): PresetSummary[] {
  return presets.map((preset) => {
    const top = [...preset.flavors].sort((a, b) => b.share - a.share)[0];
    const flavor = top ? flavors.find((f) => f.id === top.flavorId) : undefined;
    return {
      id: preset.id,
      name: preset.name,
      units: packageTypes.find((p) => p.id === preset.packageTypeId)?.unitsPerPackage ?? 0,
      usualPrice: preset.price,
      color: flavor ? { g: flavor.colorGlow, b: flavor.colorBase, s: flavor.colorShadow } : NEUTRAL,
    };
  });
}

type CubeColor = { g: string; b: string; s: string };

/**
 * The cubes a customer's thank-you tray is drawn with (v0.102): the boxes
 * they bought, as jelly, in proportion to the flavours in them — at most
 * `cap` cubes, each flavour a run so the colours read as blocks, largest
 * first. A MIX flavour is spread over every other live flavour, the way
 * the order form's tray preview draws an assortment.
 */
export function trayCubes(
  items: { presetId: number; qty: number }[],
  presets: ContentPreset[],
  flavors: Flavor[],
  packageTypes: PackageType[],
  cap = 36,
): CubeColor[] {
  const byId = new Map(flavors.map((f) => [f.id, f]));
  const plain = flavors.filter((f) => !f.archivedAt && !isMixFlavor(f));
  const units = new Map<number, number>();
  const give = (id: number, n: number) => units.set(id, (units.get(id) ?? 0) + n);
  for (const item of items) {
    const preset = presets.find((p) => p.id === item.presetId);
    if (!preset) continue;
    const size = packageTypes.find((p) => p.id === preset.packageTypeId)?.unitsPerPackage ?? 1;
    const shares = preset.flavors.reduce((sum, f) => sum + f.share, 0) || 1;
    for (const part of preset.flavors) {
      const n = (size * item.qty * part.share) / shares;
      const flavor = byId.get(part.flavorId);
      if (flavor && isMixFlavor(flavor) && plain.length > 0) {
        for (const other of plain) give(other.id, n / plain.length);
      } else give(part.flavorId, n);
    }
  }
  const runs = [...units.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = runs.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return [];
  const count = Math.min(cap, Math.max(1, Math.round(total)));
  // Largest remainder, so the cubes add up to `count` exactly.
  const exact = runs.map(([id, n]) => ({ id, n: (n / total) * count }));
  const whole = exact.map((r) => ({ id: r.id, n: Math.floor(r.n), rest: r.n - Math.floor(r.n) }));
  let left = count - whole.reduce((sum, r) => sum + r.n, 0);
  for (const r of [...whole].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    r.n += 1;
    left -= 1;
  }
  const cubes: CubeColor[] = [];
  for (const r of whole) {
    const f = byId.get(r.id);
    const color = f ? { g: f.colorGlow, b: f.colorBase, s: f.colorShadow } : NEUTRAL;
    for (let i = 0; i < r.n; i++) cubes.push(color);
  }
  return cubes;
}

/**
 * The flavour units in `qty` boxes of a preset — its package size times
 * each flavour's share. MIX stays MIX, as it does on an order.
 */
export function presetFlavorUnits(
  presetId: number,
  qty: number,
  presets: ContentPreset[],
  packageTypes: PackageType[],
): { flavorId: string; units: number }[] {
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return [];
  const size = packageTypes.find((p) => p.id === preset.packageTypeId)?.unitsPerPackage ?? 0;
  const shares = preset.flavors.reduce((sum, f) => sum + f.share, 0) || 1;
  return preset.flavors.map((f) => ({ flavorId: String(f.flavorId), units: (size * qty * f.share) / shares }));
}
