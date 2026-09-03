"use client";

import { Fragment, useId, useState } from "react";
import type { SeriesColor } from "@/lib/chartPalette";
import { flavorCubeGradient } from "@/lib/flavorStyle";

export interface LineSeries {
  label: string;
  color: SeriesColor;
  values: number[];
}

interface Point {
  x: number;
  y: number;
}

/** Catmull-Rom → cubic Bezier conversion (tension 1/6) — smooth curve through every point, no library. */
function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Stroke weight in px. Non-scaling, so it stays constant however wide the chart renders. */
const LINE_WIDTH = 5.5;

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
 * Peak opacity of the area beneath a line, by position in the series list.
 *
 * Every series gets a fill — that is the look — but only the first at full
 * strength. Two fills at equal weight blend where they cross into a third
 * colour that reads as a series nobody plotted; keeping the later ones
 * faint makes the overlap read as shade instead.
 */
const AREA_OPACITY = [0.44, 0.22, 0.15];

/**
 * How far down the fill has faded to a third of its peak.
 *
 * Ramping straight to zero at the baseline leaves real colour across the
 * whole lower half, and three of those stacked came out a flat grey. Dying
 * back this quickly keeps each fill a glow under its own line, which is
 * where it reads as belonging to that line at all.
 */
const AREA_FALLOFF = "55%";

/** Peak fill opacity for the nth series, holding the last value for any beyond the list. */
const areaOpacity = (i: number) => AREA_OPACITY[i] ?? AREA_OPACITY[AREA_OPACITY.length - 1];

/**
 * Horizontal inset for the tooltip card, as a fraction of chart width.
 * Inside this margin the card flips to the other side of its point so it
 * never gets clipped at the edges.
 */
const TOOLTIP_FLIP_MARGIN = 0.25;

/** Inline SVG line chart — no charting library, per the approved design (see CLAUDE.md). */
export function LineChart({
  series,
  xLabels,
  height = 200,
  highlightIndex = null,
  normalizePerSeries = false,
  valueFormat = (v: number) => `₪${nf.format(v)}`,
}: {
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  highlightIndex?: number | null;
  /** Scale each series to its own peak (0-100%) instead of a shared max — for series with very different magnitudes. */
  normalizePerSeries?: boolean;
  valueFormat?: (value: number) => string;
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 100; // viewBox units, scales via SVG's own responsiveness
  const padTop = 12;
  const padBottom = 12;
  const chartHeight = height - padTop - padBottom;

  const sharedMax = Math.max(1, ...series.flatMap((s) => s.values));
  const maxFor = (s: LineSeries) => (normalizePerSeries ? Math.max(1, ...s.values) : sharedMax);
  const stepX = xLabels.length > 1 ? width / (xLabels.length - 1) : 0;

  const pointsFor = (s: LineSeries): Point[] =>
    s.values.map((v, i) => ({
      x: i * stepX,
      y: padTop + chartHeight - (v / maxFor(s)) * chartHeight,
    }));

  /** The line closed down to the baseline, so the gradient beneath it has something to fill. */
  const areaPath = (points: Point[]) =>
    `${smoothPath(points)} L ${points[points.length - 1].x} ${padTop + chartHeight} L ${points[0].x} ${padTop + chartHeight} Z`;

  const activeIndex = hoverIndex ?? highlightIndex;
  const primary = series[0];
  const primaryPoints = primary ? pointsFor(primary) : [];
  const activePoint = activeIndex !== null ? primaryPoints[activeIndex] : undefined;

  // The tooltip is positioned in percentages against the wrapper rather
  // than drawn in the SVG: the SVG uses preserveAspectRatio="none", which
  // would stretch any text inside it horizontally.
  const activeFraction = activeIndex !== null && xLabels.length > 1 ? activeIndex / (xLabels.length - 1) : 0;
  const flipLeft = activeFraction > 1 - TOOLTIP_FLIP_MARGIN;
  const flipRight = activeFraction < TOOLTIP_FLIP_MARGIN;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          /*
            The first and last points sit exactly on the viewBox edge, so
            the x labels under them line up — which means half of a 5.5px
            stroke, and the whole of its round cap, falls outside. Let it:
            the alternative is insetting the plot, which would slide every
            line a few pixels away from the label it belongs to. There is
            card padding either side to spill into.
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
                  y2={padTop + chartHeight}
                >
                  <stop offset="0%" stopColor={s.color.colorGlow} />
                  <stop offset="55%" stopColor={s.color.colorBase} />
                  <stop offset="100%" stopColor={s.color.colorShadow} />
                </linearGradient>
                <linearGradient id={`${gradientId}-area-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color.colorBase} stopOpacity={areaOpacity(i)} />
                  <stop offset={AREA_FALLOFF} stopColor={s.color.colorBase} stopOpacity={areaOpacity(i) / 3} />
                  <stop offset="100%" stopColor={s.color.colorBase} stopOpacity={0} />
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

          {/* Fills and lines share the wipe, so the colour under a line is
              uncovered by the same edge rather than arriving on its own. */}
          <g clipPath={`url(#${gradientId}-reveal)`}>
            {/* Every fill first, then every stroke — otherwise a later
                series' area washes over the line drawn before it. */}
            {series.map((s, i) => {
              const points = pointsFor(s);
              if (points.length < 2) return null;
              return (
                <path
                  key={s.label}
                  d={areaPath(points)}
                  fill={`url(#${gradientId}-area-${i})`}
                  stroke="none"
                />
              );
            })}

            {series.map((s, i) => (
              <path
                key={s.label}
                d={smoothPath(pointsFor(s))}
                fill="none"
                stroke={`url(#${gradientId}-line-${i})`}
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {activePoint && (
            <line
              x1={activePoint.x}
              y1={activePoint.y}
              x2={activePoint.x}
              y2={padTop + chartHeight}
              stroke={primary.color.colorBase}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeOpacity={0.55}
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
          Dots and tooltip are HTML positioned over the SVG, not drawn in
          it: preserveAspectRatio="none" stretches the viewBox
          horizontally, which would turn a circle into an ellipse and
          distort any text.
        */}
        {activeIndex !== null &&
          series.map((s) => {
            const p = pointsFor(s)[activeIndex];
            if (!p) return null;
            return (
              // A ring rather than a filled dot: on a line this thick a
              // solid dot of the same colour just reads as a bulge.
              <span
                key={s.label}
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card shadow-sm"
                style={{
                  border: `2.5px solid ${s.color.colorBase}`,
                  left: `${activeFraction * 100}%`,
                  top: `${(p.y / height) * 100}%`,
                }}
              />
            );
          })}

        {activeIndex !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-2xl border border-line bg-card px-3 py-2 shadow-lg"
            style={{
              left: `${activeFraction * 100}%`,
              top: 0,
              transform: `translateX(${flipLeft ? "-100%" : flipRight ? "0%" : "-50%"}) translateY(-0.5rem)`,
            }}
          >
            <p className="text-[10px] font-semibold tracking-wide text-ink-soft uppercase">{xLabels[activeIndex]}</p>
            {series.map((s) => (
              <p key={s.label} className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: flavorCubeGradient(s.color) }}
                />
                <span className="text-[11px] text-ink-soft">{s.label}</span>
                <span className="font-display text-sm font-bold text-ink">
                  {valueFormat(s.values[activeIndex] ?? 0)}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between text-[10px] font-medium text-ink-soft">
        {xLabels.map((label, i) => (
          <span key={label} className={i === activeIndex ? "font-bold text-ink" : ""}>
            {label}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-ink-soft">
            {/* The same jelly recipe the flavour swatches use — the ramp
                these colours came from, at swatch size. */}
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: flavorCubeGradient(s.color) }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
