"use client";

import { useState } from "react";
import {
  PAYMENT_STATUS_LABEL,
  type Order,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orderTypes";
import { useStage, useStages } from "@/components/ProductionStagesContext";

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
 * The stage picker, used by the table's Status column and the Kanban card.
 *
 * The options come from the owner's list rather than a fixed set, and the
 * pill wears the stage's own colour — which is what makes Status read as a
 * different kind of thing from the payment badge beside it.
 *
 * A stage already on an order stays selectable even once archived, so
 * opening the control and closing it cannot retype the order.
 */
export function ProductionStatusSelect({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const stages = useStages();
  const current = useStage(order.productionStatus);

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
      onChange={(e) => handleChange(e.target.value)}
      // `keeps-color` because the fill *is* the information here — a stage
      // given the row's cream text on hover would simply vanish.
      className={`keeps-color rounded-md border-0 px-1.5 py-1 text-[11px] font-bold text-ink outline-none ${
        current?.countsAsIncome === false ? "outline-1 outline-dashed outline-ink/35" : ""
      }`}
      style={{ background: current?.color ?? "var(--color-line)" }}
    >
      {stages
        .filter((stage) => !stage.archivedAt || stage.key === order.productionStatus)
        .map((stage) => (
          <option key={stage.key} value={stage.key}>
            {stage.label}
          </option>
        ))}
      {/* A stage removed from the list entirely still has to hold its
          place, or saving the row would move the order somewhere else. */}
      {!current && <option value={order.productionStatus}>{order.productionStatus}</option>}
    </select>
  );
}
