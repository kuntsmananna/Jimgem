"use client";

import { Fragment, useId, useState } from "react";
import type { SeriesColor } from "@/lib/chartPalette";
import { flavorCubeGradient } from "@/lib/flavorStyle";
import { currency } from "@/lib/money";

export interface LineSeries {
  label: string;
  color: SeriesColor;
  values: number[];
}

interface Point {
  x: number;
  y: number;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson): a smooth curve through
 * every point that never overshoots between two of them.
 *
 * It replaced a Catmull-Rom curve (v0.77), which bulged past its points —
 * a month of ₪0 after a busy one dipped the line *below* zero, drawing a
 * loss nobody made, and a peak overshot to a figure no month reached. A
 * chart that is read for its numbers cannot invent any.
 */
function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = (points[i + 1].y - points[i].y) / dx[i];
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  tangent[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tangent[i] = k * a * slope[i];
      tangent[i + 1] = k * b * slope[i];
    }
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${points[i].x + h} ${points[i].y + tangent[i] * h}, ${points[i + 1].x - h} ${points[i + 1].y - tangent[i + 1] * h}, ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return d;
}

/**
 * Gridline values at a round step, so every label on the scale is a value
 * the scale actually reaches. Four or five lines, from a round number at or
 * below the lowest value (zero, unless a month lost money) to one at or
 * above the highest.
 */
function niceTicks(min: number, max: number): number[] {
  const rough = (max - min || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // Never below 1: every series here counts shekels, orders or units, so a
  // half-step would label the same whole number twice once formatted.
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough);
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = low; v <= high + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const compact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/**
 * "₪20k" — the scale's labels, which have no room for a full figure. Below
 * a thousand it is `currency` itself, so the sign sits where `withSign`
 * puts it everywhere else.
 */
const shortShekels = (v: number) =>
  Math.abs(v) >= 1000 ? `${v < 0 ? "-" : ""}₪${compact.format(Math.abs(v) / 1000)}k` : currency(v);

/** Stroke weight in px. Non-scaling, so it stays constant however wide the chart renders. */
const LINE_WIDTH = 3;

/**
 * How far past the plot the reveal clip reaches, in viewBox units.
 *
 * Enough to cover a stroke drawn outside the box at either end. Generous
 * on purpose: the x axis is 100 units stretched across the whole card, so
 * a unit here is a few pixels, and being too small crops a line while
 * being too large only starts the wipe an imperceptible moment early.
 */
const EDGE_BLEED = 6;

/**
 * Peak opacity of the glow beneath a line, by position in the series list.
 *
 * Every series gets one — that is the look — but only the first at full
 * strength. Two fills at equal weight blend where they cross into a third
 * colour that reads as a series nobody plotted; keeping the later ones
 * faint makes the overlap read as shade instead.
 */
const AREA_OPACITY = [0.3, 0.15, 0.1];

/**
 * How far down the glow has faded out entirely. It dies well before the
 * baseline so each one stays a glow under its own line rather than a
 * flood of colour across the lower half, where three of them stacked
 * came out a flat grey.
 */
const AREA_FALLOFF = "62%";

/** Peak fill opacity for the nth series, holding the last value for any beyond the list. */
const areaOpacity = (i: number) => AREA_OPACITY[i] ?? AREA_OPACITY[AREA_OPACITY.length - 1];

/**
 * Horizontal inset for the tooltip card, as a fraction of chart width.
 * Inside this margin the card flips to the other side of its point so it
 * never gets clipped at the edges.
 */
const TOOLTIP_FLIP_MARGIN = 0.25;

/**
 * A line chart in the "jelly glass" style (v0.77, the owner's pick of
 * three): lines lit like the jelly cubes, a glow under each that fades
 * fast, a dashed grid with a real scale on the left, and a dark reading
 * card on hover.
 */
export function LineChart({
  series,
  xLabels,
  height = 200,
  highlightIndex = null,
  normalizePerSeries = false,
  valueFormat = currency,
  axisFormat = shortShekels,
}: {
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  highlightIndex?: number | null;
  /**
   * Scale each series to its own peak (0-100%) instead of a shared max — for
   * series with very different magnitudes. There is then no one scale to
   * label, so the left-hand figures are left off and only the grid stays.
   */
  normalizePerSeries?: boolean;
  valueFormat?: (value: number) => string;
  /** The scale's labels — short, since they share a 44px column. */
  axisFormat?: (value: number) => string;
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 100; // viewBox units, scales via SVG's own responsiveness
  const padTop = 10;
  const padBottom = 6;
  const chartHeight = height - padTop - padBottom;
  const bottom = padTop + chartHeight;

  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(1, ...all));
  const low = ticks[0];
  const high = ticks[ticks.length - 1];
  const yShared = (v: number) => bottom - ((v - low) / (high - low)) * chartHeight;
  const yFor = (s: LineSeries) => {
    if (!normalizePerSeries) return yShared;
    const peak = Math.max(1, ...s.values);
    return (v: number) => bottom - (v / peak) * chartHeight;
  };
  // Gridlines: the scale's own values, or quarters when there is no scale.
  const gridYs = normalizePerSeries ? [0, 0.25, 0.5, 0.75, 1].map((f) => bottom - f * chartHeight) : ticks.map(yShared);
  const zeroY = normalizePerSeries ? bottom : yShared(0);

  const stepX = xLabels.length > 1 ? width / (xLabels.length - 1) : 0;
  const pointsFor = (s: LineSeries): Point[] => {
    const y = yFor(s);
    return s.values.map((v, i) => ({ x: i * stepX, y: y(v) }));
  };
  // Worked out once a render and shared by the fills, the lines and the
  // hover markers.
  const plotted = series.map(pointsFor);

  /** The line closed down to zero, so the glow beneath it has something to fill. */
  const areaPath = (points: Point[]) =>
    `${monotonePath(points)} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`;

  // A month read on a tap stays pinned, so it can outlive the data it was
  // read from — switch the Expenses period to a shorter one and index 20
  // names nothing. Anything past the labels reads as no month at all.
  const wanted = hoverIndex ?? highlightIndex;
  const activeIndex = wanted !== null && wanted < xLabels.length ? wanted : null;

  // The tooltip is positioned in percentages against the plot rather than
  // drawn in the SVG: the SVG uses preserveAspectRatio="none", which would
  // stretch any text inside it horizontally.
  const fractionOf = (i: number) => (xLabels.length > 1 ? i / (xLabels.length - 1) : 0);
  const activeFraction = activeIndex !== null ? fractionOf(activeIndex) : 0;
  const flipLeft = activeFraction > 1 - TOOLTIP_FLIP_MARGIN;
  const flipRight = activeFraction < TOOLTIP_FLIP_MARGIN;
  const showAxis = !normalizePerSeries;

  return (
    <div>
      <div className="flex">
        {showAxis && (
          <div aria-hidden className="relative w-11 shrink-0" style={{ height }}>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-2.5 -translate-y-1/2 text-[10px] font-medium text-ink-soft tabular-nums"
                style={{ top: `${(yShared(t) / height) * 100}%` }}
              >
                {axisFormat(t)}
              </span>
            ))}
          </div>
        )}
        <div className="relative min-w-0 flex-1">
          {/* What the picture says, in words, for a screen reader (v0.87):
              the values were otherwise only reachable by hovering or
              tapping a month, which a screen reader cannot do. */}
          <p className="sr-only">{describe(series, xLabels, valueFormat)}</p>
          <svg
            aria-hidden
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            preserveAspectRatio="none"
            /*
              The first and last points sit exactly on the viewBox edge, so
              the x labels under them line up — which means half of the
              stroke, and the whole of its round cap, falls outside. Let it:
              the alternative is insetting the plot, which would slide every
              line a few pixels away from the label it belongs to.
            */
            overflow="visible"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              {series.map((s, i) => (
                <Fragment key={s.label}>
                  {/*
                    The stroke ramp is laid across the whole plot in user
                    space, not along each path's own bounding box: a flat
                    series would otherwise compress the full glow→shadow
                    range into a few pixels of height and come out banded,
                    and two series would be lit from different directions.
                    Top-left to bottom-right is the flavour gradient's own
                    light source (see flavorStyle.ts), so a line and a
                    jelly cube are lit the same way.
                  */}
                  <linearGradient
                    id={`${gradientId}-line-${i}`}
                    gradientUnits="userSpaceOnUse"
                    x1={0}
                    y1={padTop}
                    x2={width}
                    y2={bottom}
                  >
                    <stop offset="0%" stopColor={s.color.colorGlow} />
                    <stop offset="55%" stopColor={s.color.colorBase} />
                    <stop offset="100%" stopColor={s.color.colorShadow} />
                  </linearGradient>
                  <linearGradient id={`${gradientId}-area-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color.colorBase} stopOpacity={areaOpacity(i)} />
                    <stop offset={AREA_FALLOFF} stopColor={s.color.colorBase} stopOpacity={0} />
                  </linearGradient>
                </Fragment>
              ))}
              {/*
                The wipe that uncovers the plot, once, when the chart
                arrives. A growing clip rather than a stroke-dash, because
                these lines carry `vector-effect: non-scaling-stroke` and a
                dash pattern under that is measured in screen pixels while
                `pathLength` normalises the path to one unit — the two
                disagree and leave a permanent gap in the line. See
                `.motion-reveal`.
              */}
              <clipPath id={`${gradientId}-reveal`}>
                {/*
                  Grown past the plot on every side, because the ends of the
                  lines are drawn outside it (see `overflow` above) and a
                  clip at the viewBox would put back exactly the cropping
                  that attribute exists to prevent.
                */}
                <rect
                  className="motion-reveal"
                  x={-EDGE_BLEED}
                  y={-EDGE_BLEED}
                  width={width + EDGE_BLEED * 2}
                  height={height + EDGE_BLEED * 2}
                />
              </clipPath>
            </defs>

            {/* The grid: dashed, with zero drawn solid as the floor. A
                dash under a non-scaling stroke is measured in screen
                pixels, which on a straight line is exactly what is wanted. */}
            {gridYs.map((y, i) => (
              <line
                key={i}
                x1={0}
                x2={width}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth={1}
                strokeDasharray={Math.abs(y - zeroY) < 0.01 ? undefined : "2 5"}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Fills and lines share the wipe, so the colour under a line is
                uncovered by the same edge rather than arriving on its own. */}
            <g clipPath={`url(#${gradientId}-reveal)`}>
              {/* Every fill first, then every stroke — otherwise a later
                  series' area washes over the line drawn before it. */}
              {series.map((s, i) => {
                const points = plotted[i];
                if (points.length < 2) return null;
                return <path key={s.label} d={areaPath(points)} fill={`url(#${gradientId}-area-${i})`} stroke="none" />;
              })}

              {series.map((s, i) => (
                <path
                  key={s.label}
                  d={monotonePath(plotted[i])}
                  fill="none"
                  stroke={`url(#${gradientId}-line-${i})`}
                  strokeWidth={LINE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {activeIndex !== null && (
              <line
                x1={activeIndex * stepX}
                x2={activeIndex * stepX}
                y1={padTop}
                y2={bottom}
                stroke="var(--color-ink)"
                strokeOpacity={0.2}
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/*
              Invisible hit targets — one per x-index, spanning the full chart
              height, for hover tooltips on every datapoint.

              `onClick` beside the hover, so a phone can read a month too:
              without it every value this chart carries is unreachable on
              touch, and the line is a picture. It changes nothing on a mouse,
              where hovering has already set the same index by the time a
              click lands, and the rects hit-test on touch because they are
              filled `transparent` rather than `none`. A tapped month then
              keeps its tooltip until another is tapped, which is what you
              want without a pointer to move away.
            */}
            {xLabels.map((label, i) => (
              <rect
                key={label + i}
                x={i * stepX - stepX / 2}
                y={0}
                width={stepX || width}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                onClick={() => setHoverIndex(i)}
              />
            ))}
          </svg>

          {/*
            Markers and tooltip are HTML positioned over the SVG, not drawn
            in it: preserveAspectRatio="none" stretches the viewBox
            horizontally, which would turn a square into a slab and distort
            any text. The marker is a small jelly cube, lit like the line.
          */}
          {activeIndex !== null &&
            series.map((s, i) => {
              const p = plotted[i][activeIndex];
              if (!p) return null;
              return (
                <span
                  key={s.label}
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-2 border-card shadow-sm"
                  style={{
                    background: flavorCubeGradient(s.color),
                    left: `${activeFraction * 100}%`,
                    top: `${(p.y / height) * 100}%`,
                  }}
                />
              );
            })}

          {activeIndex !== null && (
            <div
              className="pointer-events-none absolute z-10 rounded-xl bg-black px-3 py-2 text-cream shadow-xl"
              style={{
                left: `${activeFraction * 100}%`,
                top: 0,
                transform: `translateX(${flipLeft ? "-100%" : flipRight ? "0%" : "-50%"}) translateY(-0.75rem)`,
              }}
            >
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-60">{xLabels[activeIndex]}</p>
              {series.map((s) => (
                <p key={s.label} className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: flavorCubeGradient(s.color) }} />
                  <span className="text-[11px] opacity-75">{s.label}</span>
                  <span className="ml-auto pl-3 text-xs font-bold tabular-nums">{valueFormat(s.values[activeIndex] ?? 0)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Each label centred under its own point, in the plot's width. */}
      <div className={`relative mt-1.5 h-4 text-[10px] font-medium text-ink-soft ${showAxis ? "ml-11" : ""}`}>
        {xLabels.map((label, i) => (
          <span
            key={label + i}
            className={`absolute -translate-x-1/2 whitespace-nowrap ${i === activeIndex ? "font-bold text-ink" : ""}`}
            style={{ left: `${fractionOf(i) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
      <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 ${showAxis ? "ml-11" : ""}`}>
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-ink-soft">
            {/* The same jelly recipe the flavour swatches use — the ramp
                these colours came from, at swatch size. */}
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: flavorCubeGradient(s.color) }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One sentence per line: its highest and lowest month, and the latest. */
function describe(series: LineSeries[], xLabels: string[], format: (value: number) => string): string {
  return series
    .map((s) => {
      if (s.values.length === 0) return `${s.label}: no data.`;
      const max = s.values.indexOf(Math.max(...s.values));
      const min = s.values.indexOf(Math.min(...s.values));
      const last = s.values.length - 1;
      return `${s.label}: highest ${format(s.values[max])} in ${xLabels[max]}, lowest ${format(s.values[min])} in ${xLabels[min]}, latest ${format(s.values[last])} in ${xLabels[last]}.`;
    })
    .join(" ");
}
