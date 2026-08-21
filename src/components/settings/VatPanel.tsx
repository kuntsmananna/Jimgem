"use client";

import { VAT_MODES, VAT_REGISTERED_FROM, type Prices } from "@/lib/orderTypes";
import { RateList, patchRate } from "./RateList";

/**
 * Settings → Lists → VAT. One rate, and what it means.
 *
 * Separate from the add-on prices even though it shares their table: those
 * are what things cost, this is a percentage applied after everything
 * else. Changing it affects **new** orders only — an order stores the rate
 * it was booked at, so a rate change can never silently reprice work
 * already agreed.
 */
export function VatPanel({ prices }: { prices: Prices }) {
  return (
    <section className="break-inside-avoid rounded-card border border-line bg-card p-6">
      <div>
        <h2 className="font-display text-base font-bold text-ink">VAT</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Applied to new orders and expenses. Existing ones keep the rate they were saved with, so changing this
          never reprices work already agreed.
        </p>
      </div>

      <RateList
        rows={[
          {
            id: "vat_rate",
            label: "Rate",
            hint: "percent",
            amount: prices.vat_rate,
            save: (amount) => patchRate("/api/settings/prices", { key: "vat_rate", amount }),
          },
        ]}
      />

      <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
        Each order and expense says how VAT applies to it —{" "}
        {VAT_MODES.map((mode) => mode.label).join(", ")}. Anything dated before {VAT_REGISTERED_FROM}, when the
        business registered, was stamped as exempt.
      </p>
    </section>
  );
}
