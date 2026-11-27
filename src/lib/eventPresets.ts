import type { ContentPreset, Flavor, PackageType } from "./settings";

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
