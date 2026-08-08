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
  const padTop = 28;
  const padBottom = 20;
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
  const primary = series[0];
  const primaryPoints = primary ? pointsFor(primary) : [];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-ink-soft">
        <span aria-hidden className="text-sm">
          ↑
        </span>
        {activeIndex !== null && series[0] && (
          <div className="text-right">
            {series.map((s) => (
              <div key={s.label} className="flex items-center justify-end gap-1.5 text-xs font-semibold">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span className="text-ink-soft">{s.label}</span>
                <span style={{ color: s.color }}>{valueFormat(s.values[activeIndex] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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
              <stop offset="0%" stopColor={primary.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={primary.color} stopOpacity={0} />
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

        {series.map((s) => {
          const points = pointsFor(s);
          return (
            <path
              key={s.label}
              d={smoothPath(points)}
              fill="none"
              stroke={s.color}
              strokeWidth={1.6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {activeIndex !== null &&
          series.map((s) => {
            const points = pointsFor(s);
            const p = points[activeIndex];
            if (!p) return null;
            return (
              <g key={s.label}>
                <line x1={p.x} y1={padTop} x2={p.x} y2={padTop + chartHeight} stroke={s.color} strokeOpacity={0.15} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <circle cx={p.x} cy={p.y} r={2.2} fill="white" stroke={s.color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}

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
