/**
 * A chart series' colour, in the same three-stop shape as a flavour's
 * (`colorGlow` → `colorBase` → `colorShadow`, same hue, varying only in
 * lightness) so `flavorStyle.ts`'s gradient recipes apply to it unchanged.
 *
 * `LineChart` runs the ramp across the plot as the line's stroke and fades
 * `colorBase` out beneath it; the legend and hover dots use `colorBase`
 * alone, since a 10px circle can't show a gradient anyway.
 */
export interface SeriesColor {
  colorGlow: string;
  colorBase: string;
  colorShadow: string;
}

/**
 * The line-chart palette, lifted from the product's own flavour colours
 * (see CLAUDE.md's seed list) rather than invented — a chart line and a
 * jelly cube are then the same material, and no chart needs a colour
 * decision of its own.
 *
 * `sage` is the exception: it's the house accent (`#4f6f52`) given the
 * same three-stop treatment, and it stays on whichever series is the
 * subject of its chart.
 */
export const SERIES_COLORS = {
  /** House accent. Revenue, and orders on the volume chart. */
  sage: { colorGlow: "#7FA981", colorBase: "#4F6F52", colorShadow: "#2C4430" },
  /** Vodka Berry. Profit — the line read against revenue. */
  berry: { colorGlow: "#E82DC7", colorBase: "#8A1878", colorShadow: "#55104A" },
  /** Jasmine. Expenses — warm, and already the hue that column was. */
  jasmine: { colorGlow: "#FFA940", colorBase: "#E8720F", colorShadow: "#8F4409" },
  /** Kir Royale. Units sold. */
  royale: { colorGlow: "#FF5C8A", colorBase: "#8A1030", colorShadow: "#55071E" },
  /** Midori Sour. Spare — nothing claims it yet. */
  midori: { colorGlow: "#7DFF3D", colorBase: "#4A9418", colorShadow: "#2C5A0E" },
} as const satisfies Record<string, SeriesColor>;

/** Shared category-color palette for expense donuts across Dashboard and Expenses. */
export const EXPENSE_PALETTE = [
  "var(--color-tile-peach)",
  "var(--color-tile-mint)",
  "var(--color-tile-lavender)",
  "var(--color-tile-sage)",
  "#B8A6D9",
  "#D9A6A6",
];
