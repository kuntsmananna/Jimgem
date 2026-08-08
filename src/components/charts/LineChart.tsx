export interface LineSeries {
  label: string;
  color: string;
  values: number[];
}

/** Inline SVG line chart — no charting library, per the approved design (see CLAUDE.md). */
export function LineChart({
  series,
  xLabels,
  height = 180,
  highlightIndex = null,
  normalizePerSeries = false,
}: {
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  highlightIndex?: number | null;
  /** Scale each series to its own peak (0-100%) instead of a shared max — for series with very different magnitudes. */
  normalizePerSeries?: boolean;
}) {
  const width = 100; // viewBox units, scales via SVG's own responsiveness
  const padTop = 10;
  const padBottom = 16;
  const chartHeight = height - padTop - padBottom;

  const sharedMax = Math.max(1, ...series.flatMap((s) => s.values));
  const maxFor = (s: LineSeries) => (normalizePerSeries ? Math.max(1, ...s.values) : sharedMax);
  const stepX = xLabels.length > 1 ? width / (xLabels.length - 1) : 0;

  const toPoints = (s: LineSeries) =>
    s.values
      .map((v, i) => {
        const x = i * stepX;
        const y = padTop + chartHeight - (v / maxFor(s)) * chartHeight;
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {series.map((s) => (
          <polyline
            key={s.label}
            points={toPoints(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s) =>
          s.values.map((v, i) => {
            const x = i * stepX;
            const y = padTop + chartHeight - (v / maxFor(s)) * chartHeight;
            const isHighlighted = highlightIndex === i;
            return (
              <circle
                key={`${s.label}-${i}`}
                cx={x}
                cy={y}
                r={isHighlighted ? 2 : 1}
                fill={s.color}
                stroke={isHighlighted ? "#000" : "none"}
                strokeWidth={isHighlighted ? 0.6 : 0}
              />
            );
          }),
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-ink-soft">
        {xLabels.map((label, i) => (
          <span key={label} className={i === highlightIndex ? "font-bold text-ink" : ""}>
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
