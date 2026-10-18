import { JellyPile } from "@/components/JellyLoader";

/**
 * What the Orders page shows while its data is on the way: the jelly heap
 * over the shapes the list is about to take, so the page has somewhere to
 * look and does not jump when the rows land.
 */
export default function OrdersLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`skeleton h-11 rounded-2xl ${i === 3 ? "max-md:hidden" : ""}`} />
        ))}
      </div>
      <div className="py-6">
        <JellyPile label="Stacking your orders…" />
      </div>
      <div className="flex flex-col gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-10 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
