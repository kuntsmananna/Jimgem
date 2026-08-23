"use client";

import { PRICE_FIELDS, type Prices } from "@/lib/orderTypes";
import { RateList, patchRate } from "./RateList";
import { PaneHeader } from "@/components/Pane";

/**
 * Settings → Lists → Add-on prices. What the extras cost, which fills an
 * order's money side as it is typed (see `repriceOrder`).
 *
 * No add or remove: each key is wired to a specific field on the order,
 * so a sixth would have nothing to price. Display is not here — it prices
 * itself from its own list of options, which is why `ORDER_EXTRAS` gives
 * each extra a `standard` rather than a single rate key.
 */
export function PricesPanel({ prices }: { prices: Prices }) {
  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader title="Add-on prices" description={<>
          Standard rates. Every order starts from these and can still be changed on the order itself.
        </>} />

      <RateList
        rows={PRICE_FIELDS.map((field) => ({
          id: field.key,
          label: field.label,
          hint: field.per,
          amount: prices[field.key],
          save: (amount) => patchRate("/api/settings/prices", { key: field.key, amount }),
        }))}
      />
    </section>
  );
}
