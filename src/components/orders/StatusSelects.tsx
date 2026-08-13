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
const PAYMENT_BADGE_CLASS: Record<PaymentStatus, string> = {
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
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none ${PAYMENT_BADGE_CLASS[order.paymentStatus]}`}
    >
      {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((status) => (
        <option key={status} value={status}>
          {PAYMENT_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );
}

export function ProductionStatusSelect({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: () => void;
}) {
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
      className="keeps-color rounded-full border border-line bg-cream px-2.5 py-1 text-xs font-semibold text-ink outline-none"
    >
      {(Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[]).map((status) => (
        <option key={status} value={status}>
          {PRODUCTION_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );
}
