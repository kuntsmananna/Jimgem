export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** CSS conic-gradient ring — no charting library, per the approved design (see CLAUDE.md). */
export function DonutChart({ slices, size = 140 }: { slices: DonutSlice[]; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const nonZero = slices.filter((s) => s.value > 0);

  if (total === 0) {
    return <p className="text-sm text-ink-soft">No data for this period.</p>;
  }

  let cursor = 0;
  const stops: string[] = [];
  for (const slice of nonZero) {
    const start = (cursor / total) * 360;
    cursor += slice.value;
    const end = (cursor / total) * 360;
    stops.push(`${slice.color} ${start}deg ${end}deg`);
  }

  return (
    <div className="flex items-center gap-5">
      <div
        className="shrink-0 rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${stops.join(", ")})`,
          maskImage: "radial-gradient(circle, transparent 58%, black 59%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 58%, black 59%)",
        }}
      />
      <ul className="flex flex-col gap-1.5">
        {nonZero.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="font-medium text-ink">{slice.label}</span>
            <span className="text-ink-soft">{Math.round((slice.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
