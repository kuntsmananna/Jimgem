"use client";

import { useState } from "react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  type Order,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orderTypes";

/**
 * `keeps-color` on the coloured badges, `chip-neutral` on the one that is
 * just a tint of the surface — see globals.css's line-hover block for why
 * the two behave differently on a hovered black row.
 */
export const PAYMENT_BADGE_CLASS: Record<PaymentStatus, string> = {
  unpaid: "chip-neutral bg-black/5 text-ink-soft",
  deposit: "keeps-color bg-tile-peach text-ink",
  paid: "keeps-color bg-tile-sage text-ink",
  comp: "keeps-color bg-tile-lavender text-ink",
  net40: "keeps-color bg-tile-mint text-ink",
};

export function PaymentStatusSelect({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleChange(status: PaymentStatus) {
    setBusy(true);
    await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "patch", paymentStatus: status }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <select
      value={order.paymentStatus}
      disabled={busy}
      onChange={(e) => handleChange(e.target.value as PaymentStatus)}
      className={`rounded-full border-0 px-1.5 py-1 text-[11px] font-semibold outline-none ${PAYMENT_BADGE_CLASS[order.paymentStatus]}`}
    >
      {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((status) => (
        <option key={status} value={status}>
          {PAYMENT_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );
}

/**
 * The stage picker, used by both the table and the Kanban card.
 *
 * The table used to carry a click-to-advance pill instead, which was one
 * click to mark an order delivered. That worked while the stages were a
 * strict forward march; with Offer in front of Queue they are not — an
 * offer is accepted or it is dropped, and cycling through Preparing to
 * get back is not a sequence anyone means.
 */
export function ProductionStatusSelect({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleChange(status: ProductionStatus) {
    setBusy(true);
    await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "patch", productionStatus: status }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <select
      value={order.productionStatus}
      disabled={busy}
      onChange={(e) => handleChange(e.target.value as ProductionStatus)}
      className={`rounded-full px-1.5 py-1 text-[11px] font-semibold outline-none ${PRODUCTION_BADGE_CLASS[order.productionStatus]}`}
    >
      {(Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[]).map((status) => (
        <option key={status} value={status}>
          {PRODUCTION_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );
}

/**
 * A hollow dot for Offer, filling in as the order becomes real: nothing is
 * committed yet, and a solid dot beside Queue's said the two were the same
 * kind of thing.
 */
export const PRODUCTION_DOT: Record<ProductionStatus, string> = {
  offer: "bg-transparent ring-1 ring-inset ring-ink-soft/60",
  queue: "bg-ink-soft/40",
  preparing: "bg-tile-peach",
  delivered: "bg-accent",
};

/**
 * `chip-neutral` on all four: each is a tint of the surface rather than a
 * colour of its own, so they have to invert with a hovered black row —
 * see globals.css. Offer's dashed edge is what marks it as not yet a
 * booking, and it survives the inversion because the border is drawn from
 * `currentColor`.
 */
export const PRODUCTION_BADGE_CLASS: Record<ProductionStatus, string> = {
  offer: "chip-neutral border border-dashed border-current bg-black/[0.03] text-ink-soft",
  queue: "chip-neutral border border-line bg-black/[0.04] text-ink",
  preparing: "chip-neutral border border-line bg-black/[0.04] text-ink",
  delivered: "chip-neutral border border-line bg-black/[0.04] text-ink",
};
