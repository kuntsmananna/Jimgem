"use client";

import { useId, useState } from "react";

export interface LineSeries {
  label: string;
  color: string;
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
const LINE_WIDTH = 2.75;

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

  const activeIndex = hoverIndex ?? highlightIndex;
  // Only the first series gets an area fill. Two overlapping gradients
  // would blend into a third colour where they cross, which reads as a
  // series that isn't there.
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
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            {primary && (
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primary.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={primary.color} stopOpacity={0.02} />
              </linearGradient>
            )}
          </defs>

          {primary && primaryPoints.length > 1 && (
            <path
              d={`${smoothPath(primaryPoints)} L ${primaryPoints[primaryPoints.length - 1].x} ${padTop + chartHeight} L ${primaryPoints[0].x} ${padTop + chartHeight} Z`}
              fill={`url(#${gradientId})`}
              stroke="none"
            />
          )}

          {series.map((s) => (
            <path
              key={s.label}
              d={smoothPath(pointsFor(s))}
              fill="none"
              stroke={s.color}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {activePoint && (
            <line
              x1={activePoint.x}
              y1={activePoint.y}
              x2={activePoint.x}
              y2={padTop + chartHeight}
              stroke={primary.color}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeOpacity={0.55}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Invisible hit targets — one per x-index, spanning the full chart height, for hover tooltips on every datapoint. */}
          {xLabels.map((label, i) => (
            <rect
              key={label + i}
              x={i * stepX - stepX / 2}
              y={0}
              width={stepX || width}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
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
              <span
                key={s.label}
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                style={{ background: s.color, left: `${activeFraction * 100}%`, top: `${(p.y / height) * 100}%` }}
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
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
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
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
