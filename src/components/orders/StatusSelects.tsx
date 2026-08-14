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

/**
 * The full picker, kept for the Kanban card: there you are moving a card
 * to a named column, sometimes backwards, so being able to jump straight
 * to any status matters more than saving a click. The table uses the
 * cycling pill below instead.
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

/** Queue → Preparing → Delivered → Queue. Production only ever moves forward in practice. */
const PRODUCTION_ORDER: ProductionStatus[] = ["queue", "preparing", "delivered"];

const PRODUCTION_DOT: Record<ProductionStatus, string> = {
  queue: "bg-ink-soft/40",
  preparing: "bg-tile-peach",
  delivered: "bg-accent",
};

/**
 * A compact click-to-advance pill, replacing the full-width dropdown that
 * used to have its own column. Marking an order delivered is one click on
 * the row you're already looking at, and the column stops eating the
 * width the content chips needed.
 *
 * It cycles rather than opening a menu: with three states in a fixed
 * order, a menu is two interactions to do what one click can.
 */
export function ProductionStatusPill({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const current = order.productionStatus;
  const next = PRODUCTION_ORDER[(PRODUCTION_ORDER.indexOf(current) + 1) % PRODUCTION_ORDER.length];

  async function advance() {
    setBusy(true);
    await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "patch", productionStatus: next }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={advance}
      title={`${PRODUCTION_STATUS_LABEL[current]} — click to mark ${PRODUCTION_STATUS_LABEL[next]}`}
      className="chip-neutral flex w-fit items-center gap-1.5 rounded-full bg-black/[0.06] px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-ink transition disabled:opacity-50"
    >
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PRODUCTION_DOT[current]}`} />
      {PRODUCTION_STATUS_LABEL[current]}
    </button>
  );
}
