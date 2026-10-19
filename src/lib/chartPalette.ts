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
 * The flavour ramps, for anything drawn *as jelly* — the loader's heap, the
 * empty state's cube, the What's new pictures. Lifted from the product's
 * own flavour colours (see CLAUDE.md's seed list), so a drawn cube is the
 * same material as a real one. Charts do not use these since v0.77; see
 * `CHART_COLORS`.
 *
 * `sage` is the house accent (`#4f6f52`) given the same three-stop
 * treatment.
 */
export const SERIES_COLORS = {
  sage: { colorGlow: "#7FA981", colorBase: "#4F6F52", colorShadow: "#2C4430" },
  /** Vodka Berry. */
  berry: { colorGlow: "#E82DC7", colorBase: "#8A1878", colorShadow: "#55104A" },
  /** Jasmine. */
  jasmine: { colorGlow: "#FFA940", colorBase: "#E8720F", colorShadow: "#8F4409" },
  /** Kir Royale. */
  royale: { colorGlow: "#FF5C8A", colorBase: "#8A1030", colorShadow: "#55071E" },
  /** Midori Sour. */
  midori: { colorGlow: "#7DFF3D", colorBase: "#4A9418", colorShadow: "#2C5A0E" },
} as const satisfies Record<string, SeriesColor>;

/**
 * The chart palette (v0.77): the flavour hues taken down to dusty
 * versions of themselves — the owner's pick from three colourings. At full
 * saturation two lines and a fill were the loudest thing on every page
 * they sat on, and a chart is read for its shape, not its colour. Same
 * three-stop shape as a flavour, so `LineChart` still lights a line like a
 * jelly cube, top-left to bottom-right.
 *
 * Named by hue rather than by series: what a colour means is said at the
 * call site, and `sage` — the house accent — stays on whichever series is
 * the subject of its chart.
 */
export const CHART_COLORS = {
  /** Revenue, and orders on the volume chart. */
  sage: { colorGlow: "#9DB79F", colorBase: "#5F7F62", colorShadow: "#3D5640" },
  /** Profit, and new clients. */
  plum: { colorGlow: "#C79BBC", colorBase: "#8C5A7E", colorShadow: "#5E3A55" },
  /** Expenses. */
  ochre: { colorGlow: "#E5C08A", colorBase: "#C08A3E", colorShadow: "#7F5A24" },
  /** Units sold. */
  rose: { colorGlow: "#E3AEB2", colorBase: "#B8737A", colorShadow: "#7D4A50" },
  /** Spare. */
  slate: { colorGlow: "#A9B8C3", colorBase: "#6E7F8C", colorShadow: "#48555F" },
} as const satisfies Record<string, SeriesColor>;

/**
 * One colour per category in a breakdown — the same dusty hues as
 * `CHART_COLORS`, in an order that keeps neighbours apart, then two warm
 * greys for the long tail.
 */
export const EXPENSE_PALETTE = [
  CHART_COLORS.sage.colorBase,
  CHART_COLORS.plum.colorBase,
  CHART_COLORS.ochre.colorBase,
  CHART_COLORS.rose.colorBase,
  CHART_COLORS.slate.colorBase,
  "#A39587",
  "#C9BBAE",
];
