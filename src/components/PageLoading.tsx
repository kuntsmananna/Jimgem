import { JellyPile } from "@/components/JellyLoader";

/**
 * What a page shows while its data is on the way: the jelly heap over the
 * rough shapes the page is about to take, so there is somewhere to look
 * and nothing jumps when the content lands.
 *
 * One component, so every page loads the same way; each route's
 * `loading.tsx` only says what it is fetching and which shape to sketch.
 * Server-safe markup — CSS does all the moving (see `.jelly-pile` and
 * `.skeleton` in globals.css).
 */
export function PageLoading({
  label,
  shape = "list",
}: {
  label: string;
  /** "list": figures over rows. "panels": a grid of panes (Dashboard, Settings). */
  shape?: "list" | "panels";
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-11 rounded-2xl" />
        ))}
      </div>
      <div className="py-6">
        <JellyPile label={label} />
      </div>
      {shape === "list" ? (
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-10 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-48 rounded-card" />
          ))}
        </div>
      )}
    </div>
  );
}
