import type { Flavor } from "./settings";

/**
 * The jelly gradient for a flavor: same-hue glow → base → shadow with the
 * light source just outside the top-left corner, so a swatch reads as a
 * translucent cube rather than a flat colour chip (see CLAUDE.md's design
 * tokens for the reasoning).
 *
 * Client-safe, like orderTypes.ts and icons.ts — pure, and the `Flavor`
 * import is type-only so settings.ts's server deps are erased. It lives
 * here rather than in a component because the recipe is a design token
 * shared by Settings' swatches, the order form's flavour cards and the
 * order content chips, and those had already started to diverge.
 */
export function flavorGradient(flavor: Pick<Flavor, "colorGlow" | "colorBase" | "colorShadow">): string {
  return `radial-gradient(circle at -15% -15%, ${flavor.colorGlow}, ${flavor.colorBase} 55%, ${flavor.colorShadow} 100%)`;
}
