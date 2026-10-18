"use client";

import { paymentMethodIconElement } from "@/lib/icons";
import { usePaymentMethods } from "./PaymentMethodsContext";

/**
 * How an order was paid, as an icon-and-label pill.
 *
 * Neutral rather than coloured: the payment *status* beside it already
 * wears colour, and two coloured pills side by side would compete for the
 * one meaning colour has on that row — is this paid. `chip-neutral` lets
 * it invert with a hovered line (see globals.css).
 *
 * Renders a dash for an order nobody has said yet, the table's usual mark
 * for an empty cell.
 */
export function PaymentMethodChip({ methodId }: { methodId: number | null }) {
  const methods = usePaymentMethods();
  if (methodId === null) return <span className="text-ink-soft/50">–</span>;
  const name = methods.find((method) => method.id === methodId)?.name ?? "Unknown method";
  return (
    <span
      title={name}
      className="chip-neutral flex w-fit items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink"
    >
      <span className="shrink-0">{paymentMethodIconElement(name)}</span>
      <span className="truncate">{name}</span>
    </span>
  );
}
