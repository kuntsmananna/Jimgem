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

/**
 * The same three stops run top-to-bottom instead of from a corner, for
 * the flavour-split bar. A segment there can be a few pixels wide and is
 * always full height, which puts the radial version's light source
 * off-screen and flattens the whole segment to its shadow colour — this
 * keeps the glow readable at any width.
 */
export function flavorBarGradient(flavor: Pick<Flavor, "colorGlow" | "colorBase" | "colorShadow">): string {
  return `linear-gradient(180deg, ${flavor.colorGlow} 0%, ${flavor.colorBase} 55%, ${flavor.colorShadow} 100%)`;
}

/**
 * A single jelly cube in the tray preview. Lit from the top-left corner
 * rather than outside it: at a dozen pixels square the radial version's
 * off-canvas light source never lands, leaving every cube flat.
 */
export function flavorCubeGradient(flavor: Pick<Flavor, "colorGlow" | "colorBase" | "colorShadow">): string {
  return `linear-gradient(145deg, ${flavor.colorGlow} 0%, ${flavor.colorBase} 55%, ${flavor.colorShadow} 100%)`;
}
