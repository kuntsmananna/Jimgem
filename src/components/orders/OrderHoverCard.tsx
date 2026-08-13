"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MapPin, StickyNote, Users } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  formatOrderDate,
  orderUnits,
  type Order,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { UnitsIcon } from "@/lib/icons";
import { EventTypeChip } from "./EventTypeChip";
import { ContentChips } from "./ContentChips";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

const CARD_WIDTH = 300;
/** Enough for the tallest card (content chips wrap), used to keep it on screen. */
const CARD_HEIGHT = 340;
const GAP = 8;

/**
 * Places the card beside the hovered element, flipping to its other side
 * rather than running off the edge — the Kanban's right-hand column and
 * the calendar's Saturday cell both sit against the viewport edge.
 */
function position(rect: DOMRect): { left: number; top: number } {
  const fitsRight = rect.right + GAP + CARD_WIDTH <= window.innerWidth - GAP;
  const left = fitsRight ? rect.right + GAP : Math.max(GAP, rect.left - GAP - CARD_WIDTH);
  const top = Math.max(GAP, Math.min(rect.top, window.innerHeight - CARD_HEIGHT - GAP));
  return { left, top };
}

/**
 * Wraps a Kanban card or calendar pill so hovering it shows the whole
 * order. Both views are deliberately sparse — they answer "what is on
 * this day / in this column", and this answers "what exactly is it"
 * without a click.
 *
 * Rendered through a portal at fixed coordinates rather than as an
 * absolutely-positioned child, so it is never clipped by, or stacked
 * under, the day cell it belongs to.
 */
export function OrderHoverCard({
  order,
  flavors,
  packageTypes,
  className = "",
  children,
}: {
  order: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  className?: string;
  children: ReactNode;
}) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const units = orderUnits(order.contentLines, new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage])));

  return (
    <div
      className={className}
      onMouseEnter={(e) => setAt(position(e.currentTarget.getBoundingClientRect()))}
      onMouseLeave={() => setAt(null)}
    >
      {children}

      {at !== null &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: at.left, top: at.top, width: CARD_WIDTH }}
            className="pointer-events-none fixed z-50 rounded-card border border-line bg-card p-4 shadow-xl"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate font-display text-sm font-bold text-ink">
                {order.customer || "(no name)"}
              </p>
              <p className="shrink-0 text-xs font-semibold text-ink-soft">{formatOrderDate(order.date)}</p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <EventTypeChip value={order.customerType} />
              <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-ink">
                {PRODUCTION_STATUS_LABEL[order.productionStatus]}
              </span>
              <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-ink">
                {PAYMENT_STATUS_LABEL[order.paymentStatus]}
              </span>
            </div>

            <dl className="mt-3 flex flex-col gap-1 text-xs text-ink-soft">
              {order.location && (
                <div className="flex items-start gap-1.5">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  <span>{order.location}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {order.guests !== null && (
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {nf.format(order.guests)} guests
                  </span>
                )}
                {units > 0 && (
                  <span className="flex items-center gap-1">
                    <UnitsIcon size={12} />
                    {nf.format(units)} units
                  </span>
                )}
                {order.mirrors !== null && <span>{nf.format(order.mirrors)} mirrors</span>}
              </div>
              {order.notes && (
                <div className="flex items-start gap-1.5">
                  <StickyNote size={12} className="mt-0.5 shrink-0" />
                  <span>{order.notes}</span>
                </div>
              )}
            </dl>

            <div className="mt-3">
              <ContentChips lines={order.contentLines} flavors={flavors} packageTypes={packageTypes} />
            </div>

            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2">
              <span className="text-sm font-semibold text-ink">{currency(order.totalAmount)}</span>
              <span className="text-xs text-ink-soft">
                {order.deposit > 0 ? `${currency(order.deposit)} deposit` : "no deposit"}
                {order.deliveryCost !== null && ` · ${currency(order.deliveryCost)} delivery`}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
