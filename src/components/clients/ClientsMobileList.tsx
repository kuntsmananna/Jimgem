"use client";

import { Phone } from "lucide-react";
import type { ClientWithStats } from "@/lib/clients";
import { formatOrderDate } from "@/lib/orderTypes";
import { currency } from "@/lib/money";

/**
 * Everything but digits and a leading `+`, so a number stored the way a
 * person writes it — "054-123-4567" — still dials.
 */
const dialable = (phone: string) => phone.replace(/(?!^\+)[^\d]/g, "");

/**
 * The Clients list on a phone: one card per client.
 *
 * The desktop row lays six figures out on `LIST_COLUMNS`, about 34rem of
 * fixed columns under a header that names them — a shape that only works
 * where all six can sit side by side and be read down the page. A card
 * keeps the four a phone is opened for: who they are, how to reach them,
 * what they have spent, and whether they still owe anything.
 *
 * **What they owe is the one thing that acts**, so it is the only figure
 * given a chip and a place on the name's own line. The email, the SUMIT
 * link, their order history and Archive all live inside `ClientModal`.
 *
 * The card is two targets, not one: the face opens the client, and a call
 * button takes the right edge. That is also why the face is a `<button>`
 * rather than the whole card being one — an `<a href="tel:">` inside a
 * button is invalid markup, and the number is the reason this page gets
 * opened away from a desk. **The number is still edited by opening the
 * client**, where Phone is an ordinary field; the call button is an
 * addition to the card, not a replacement for tapping it.
 */

export function ClientsMobileList({
  clients,
  balanceOf,
  onOpen,
  emptyNote,
}: {
  /** Already searched and sorted — the same array the desktop rows take. */
  clients: ClientWithStats[];
  /** What is still owed across their booked orders — see `ordersByClient`. */
  balanceOf: (client: ClientWithStats) => number;
  onOpen: (id: number) => void;
  emptyNote: string;
}) {
  if (clients.length === 0) {
    return <p className="px-1 py-6 text-sm text-ink-soft">{emptyNote}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {clients.map((client) => {
        const balance = balanceOf(client);
        return (
          <div
            key={client.id}
            className="flex items-stretch overflow-hidden rounded-card border border-line bg-card"
          >
            <button onClick={() => onOpen(client.id)} className="min-w-0 flex-1 px-4 py-3 text-left">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 truncate text-[15px] font-bold">{client.name}</p>
              {balance > 0 && (
                <span className="keeps-color shrink-0 rounded-full bg-tile-peach px-2 py-0.5 text-[11px] font-bold text-ink tabular-nums">
                  {currency(balance)} due
                </span>
              )}
            </div>

            <div className="mt-2 flex items-baseline gap-2 text-xs text-ink-soft">
              {/* The number is why you opened this page while out. Plain
                  text rather than a `tel:` link: the card is a button, and
                  an anchor inside one is invalid markup. */}
              <span className="shrink-0 tabular-nums">{client.phone || "no phone"}</span>
              {client.orderCount > 0 && (
                <span className="shrink-0">
                  · {client.orderCount}
                  {client.orderCount === 1 ? " order" : " orders"}
                </span>
              )}
              {client.lastOrderDate && (
                <span className="shrink-0 truncate">· {formatOrderDate(client.lastOrderDate)}</span>
              )}
              <span className="flex-1" />
              <span className="shrink-0 text-sm font-bold text-ink tabular-nums">
                {client.orderCount ? currency(client.totalSpent) : "—"}
              </span>
            </div>
            </button>

            {/* A column of its own rather than a chip beside the number:
                it is the one place on this page where a mis-tap costs a
                phone call, so it wants the width and the hairline. */}
            {client.phone && (
              <a
                href={`tel:${dialable(client.phone)}`}
                aria-label={`Call ${client.name}`}
                title={`Call ${client.phone}`}
                className="flex w-14 shrink-0 items-center justify-center border-l border-line text-accent"
              >
                <Phone size={18} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
