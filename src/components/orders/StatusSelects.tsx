"use client";

import { useState } from "react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  orderToInput,
  type Order,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orderTypes";

const PAYMENT_BADGE_CLASS: Record<PaymentStatus, string> = {
  unpaid: "bg-black/5 text-ink-soft",
  deposit: "bg-tile-peach text-ink",
  paid: "bg-tile-sage text-ink",
  comp: "bg-tile-lavender text-ink",
  net40: "bg-tile-mint text-ink",
};

export function PaymentStatusSelect({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  // Sheet orders are read-only except for production status — payment status there
  // comes from the Sheet's own row color and can't be edited from here.
  if (order.source === "sheet") {
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PAYMENT_BADGE_CLASS[order.paymentStatus]}`}>
        {PAYMENT_STATUS_LABEL[order.paymentStatus]}
      </span>
    );
  }

  async function handleChange(status: PaymentStatus) {
    setBusy(true);
    await fetch(`/api/orders/${order.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...orderToInput(order), paymentStatus: status }),
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
    await fetch("/api/orders/production-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: order.key, status }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <select
      value={order.productionStatus ?? ""}
      disabled={busy}
      onChange={(e) => handleChange(e.target.value as ProductionStatus)}
      className="rounded-full border border-line bg-cream px-2.5 py-1 text-xs font-semibold text-ink outline-none"
    >
      {!order.productionStatus && <option value="">Not tracked</option>}
      {(Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[]).map((status) => (
        <option key={status} value={status}>
          {PRODUCTION_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );
}
