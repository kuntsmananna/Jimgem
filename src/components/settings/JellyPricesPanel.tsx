"use client";

import { UNIT_TIERS, type Prices } from "@/lib/orderTypes";
import type { ContentPreset } from "@/lib/settings";
import { RateList, patchRate } from "./RateList";

/**
 * Settings → Lists → Jelly prices. What the jelly itself costs.
 *
 * Two ways to price it, and an order can use both at once:
 *
 * - **A preset** has a price for the whole package. Applying it copies
 *   that number onto the order line, so changing it here never reprices
 *   an order already booked — the same copy-not-link rule the recipe
 *   itself follows.
 * - **Anything else** is priced per unit, at whichever tier the order's
 *   total falls into. The tiers are on the order as a whole, not per
 *   line, so 600 units across three trays gets the 500-and-up rate on all
 *   of them rather than three separate small-order rates.
 */
export function JellyPricesPanel({
  prices,
  presets,
}: {
  prices: Prices;
  presets: ContentPreset[];
}) {
  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div>
        <h2 className="font-display text-base font-bold text-ink">Jelly prices</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Per unit by order size, unless the package is one of your presets.
        </p>
      </div>

      <RateList
        rows={UNIT_TIERS.map((tier) => ({
          id: tier.key,
          label: tier.label,
          hint: "per unit",
          amount: prices[tier.key],
          save: (amount) => patchRate("/api/settings/prices", { key: tier.key, amount }),
        }))}
      />

      <div className="mt-5 border-t border-line pt-3">
        <h3 className="text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">Presets</h3>
        {presets.length === 0 ? (
          <p className="mt-2 text-xs text-ink-soft">
            No presets yet — add one under Flavors to price it here.
          </p>
        ) : (
          <RateList
            rows={presets.map((preset) => ({
              id: `preset-${preset.id}`,
              label: preset.name,
              hint: "per package",
              amount: preset.price,
              save: (price) =>
                // The whole preset goes up, not just the price: the route
                // replaces its recipe, so sending the price alone would
                // wipe the flavours.
                patchRate(`/api/settings/presets/${preset.id}`, {
                  name: preset.name,
                  packageTypeId: preset.packageTypeId,
                  price,
                  flavors: preset.flavors,
                }),
            }))}
          />
        )}
      </div>
    </section>
  );
}
