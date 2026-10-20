import Link from "next/link";

/**
 * Which year the Dashboard and the Biz Plan are reading.
 *
 * Their figures are a month per month, so two Januaries would otherwise
 * land in one bucket — and the nightly roll-forward of monthly expenses
 * books into next year whether or not anybody has. The year is a search
 * param (`?year=2027`) read on the server, which is where the figures are
 * computed. Drawn only once there is more than one year to choose between:
 * a single pill naming the only year there is says nothing.
 */
export function YearSwitch({ year, years, path }: { year: number; years: number[]; path: string }) {
  if (years.length < 2) return null;
  return (
    <nav aria-label="Year" className="flex shrink-0 items-center gap-1 rounded-full bg-card p-1">
      {years.map((y) => (
        <Link
          key={y}
          href={`${path}?year=${y}`}
          aria-current={y === year ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums transition max-md:py-1.5 ${
            y === year ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {y}
        </Link>
      ))}
    </nav>
  );
}
