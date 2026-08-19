"use client";

import type { ReactNode } from "react";
import { MapPin, StickyNote, Users } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  formatOrderDate,
  orderTotal,
  orderUnits,
  unitsPerPackageMap,
  type Order,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { UnitsIcon } from "@/lib/icons";
import { HoverCard } from "@/components/HoverCard";
import { StageChip } from "./StageChip";
import { EventTypeChip } from "./EventTypeChip";
import { ContentChips } from "./ContentChips";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

const CARD_WIDTH = 300;
/** Enough for the tallest card (content chips wrap), used to keep it on screen. */
const CARD_HEIGHT = 340;

/**
 * Wraps a Kanban card or calendar pill so hovering it shows the whole
 * order. Both views are deliberately sparse — they answer "what is on
 * this day / in this column", and this answers "what exactly is it"
 * without a click.
 *
 * The Orders table doesn't use this one: every field here is already a
 * column there, so it shows `ContentHoverCard` instead — the one thing a
 * row can't spell out in the space it has.
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
  return (
    <HoverCard
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      className={className}
      render={() => {
        // Inside render, so the ~70 cards that are merely mounted don't
        // each build a lookup map for a card nobody is looking at.
        const units = orderUnits(order.packageLines, unitsPerPackageMap(packageTypes));
        return (
        <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate font-display text-sm font-bold text-ink">
                {order.customer || "(no name)"}
              </p>
              <p className="shrink-0 text-xs font-semibold text-ink-soft">{formatOrderDate(order.date)}</p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <EventTypeChip value={order.customerType} />
              <StageChip stageKey={order.productionStatus} />
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
              <ContentChips lines={order.packageLines} flavors={flavors} packageTypes={packageTypes} />
            </div>

            {/* The order's worth with its extras in, matching the order
                sheet's Total — delivery no longer needs calling out beside
                it, because it is part of the figure now. */}
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2">
              <span className="text-sm font-semibold text-ink">{currency(orderTotal(order))}</span>
              <span className="text-xs text-ink-soft">
                {order.deposit > 0 ? `${currency(order.deposit)} deposit` : "no deposit"}
              </span>
            </div>
        </>
        );
      }}
    >
      {children}
    </HoverCard>
  );
}
