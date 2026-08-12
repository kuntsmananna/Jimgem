"use client";

import { useState } from "react";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, rOuter, startAngle);
  const outerEnd = polarToCartesian(cx, cy, rOuter, endAngle);
  const innerEnd = polarToCartesian(cx, cy, rInner, endAngle);
  const innerStart = polarToCartesian(cx, cy, rInner, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Inline SVG donut chart — no charting library, per the approved design (see CLAUDE.md). */
export function DonutChart({
  slices,
  size = 140,
  valueFormat = (v: number) => `₪${nf.format(v)}`,
}: {
  slices: DonutSlice[];
  size?: number;
  valueFormat?: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const nonZero = slices.filter((s) => s.value > 0);

  if (total === 0) {
    return <p className="text-sm text-ink-soft">No data for this period.</p>;
  }

  const cx = size / 2;
  const cy = size / 2;
  // rOuter is inset by 1px so the outer edge isn't sitting exactly on the
  // SVG boundary, where antialiasing shaves a hairline off the stroke.
  // rInner is a fraction of rOuter (not of size) — the hole has to be
  // inside the ring, otherwise the band lands outside the viewport and
  // gets clipped at the cardinal points.
  const rOuter = size / 2 - 1;
  const rInner = rOuter * 0.59;

  const { arcs } = nonZero.reduce<{ arcs: { slice: DonutSlice; startAngle: number; endAngle: number }[]; cumulative: number }>(
    (acc, slice) => {
      const startAngle = (acc.cumulative / total) * 360;
      const cumulative = acc.cumulative + slice.value;
      const endAngle = (cumulative / total) * 360;
      return { arcs: [...acc.arcs, { slice, startAngle, endAngle }], cumulative };
    },
    { arcs: [], cumulative: 0 },
  );

  const active = hovered !== null ? arcs[hovered] : null;

  return (
    <div className="flex min-w-0 items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} onMouseLeave={() => setHovered(null)}>
          {arcs.map((arc, i) => (
            <path
              key={arc.slice.label}
              d={donutSlicePath(cx, cy, rOuter, rInner, arc.startAngle, arc.endAngle)}
              fill={arc.slice.color}
              opacity={hovered === null || hovered === i ? 1 : 0.45}
              onMouseEnter={() => setHovered(i)}
              className="transition-opacity"
            />
          ))}
        </svg>
        {active && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-bold text-ink">{active.slice.label}</span>
            <span className="text-[11px] text-ink-soft">{valueFormat(active.slice.value)}</span>
            <span className="text-[10px] text-ink-soft">{Math.round((active.slice.value / total) * 100)}%</span>
          </div>
        )}
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {nonZero.map((slice, i) => (
          <li
            key={slice.label}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="flex min-w-0 items-center gap-2 text-xs"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="min-w-0 flex-1 truncate font-medium text-ink" title={slice.label}>
              {slice.label}
            </span>
            <span className="shrink-0 text-ink-soft">{Math.round((slice.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
