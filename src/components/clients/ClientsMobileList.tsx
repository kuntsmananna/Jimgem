"use client";

import { Phone } from "lucide-react";
import type { ClientWithStats } from "@/lib/clients";
import { formatOrderDate } from "@/lib/orderTypes";
import { currency } from "@/lib/money";

/**
 * Everything but the digits, keeping a leading `+` so a number stored the
 * way a person writes it — "054-123-4567", "+972 54-123-4567" — still
 * dials.
 *
 * The `+` is looked for *before the first digit* rather than at index 0,
 * because "(+972) 54-…" is written often enough to matter and an anchored
 * test dropped the country code off exactly those, dialling them as
 * domestic numbers.
 */
const dialable = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return /^\D*\+/.test(phone) ? `+${digits}` : digits;
};

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
              {/*
                What they owe is the one thing on this card that asks you
                to do something, so it is the card's loudest figure. It
                used to be 11px in a chip beside a 14px bold lifetime
                total — the figure that acts, set smaller than the one
                that does not.
              */}
              {balance > 0 && (
                <span className="keeps-color shrink-0 rounded-full bg-tile-peach px-2.5 py-1 text-[13px] font-bold text-ink tabular-nums">
                  {currency(balance)} due
                </span>
              )}
            </div>

            <div className="mt-2 flex items-baseline gap-2 text-xs text-ink-soft">
              {/* The number is why you opened this page while out. Plain
                  text rather than a `tel:` link: the card is a button, and
                  an anchor inside one is invalid markup.

                  It is **the one thing on this line allowed to shrink**.
                  Everything here was `shrink-0`, so a long number beside
                  "12 orders" and a date pushed the lifetime spend off the
                  card's right edge — a figure clipped mid-digit, which is
                  worse than a number cut short next to a button that
                  dials it anyway. */}
              <span className="min-w-0 truncate tabular-nums">{client.phone || "no phone"}</span>
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
              {/* Lifetime spend belongs on the quiet line with the rest of
                  the history — darker than its neighbours so the Spend sort
                  still has something to read down, but no longer shouting
                  over the balance above it. */}
              <span className="shrink-0 text-xs font-semibold text-ink tabular-nums">
                {client.orderCount ? currency(client.totalSpent) : "—"}
              </span>
            </div>
            </button>

            {/* A column of its own rather than a chip beside the number:
                it is the one place on this page where a mis-tap costs a
                phone call, so it wants the width and the hairline. */}
            {/*
              The column is always here, even with no number in it. Drawn
              only for clients who have a phone, the cards came out two
              different widths and the list's right edge zigzagged down the
              page — and an empty slot is also true: it says this client has
              no number, which is worth seeing while scanning.
            */}
            {client.phone ? (
              <a
                href={`tel:${dialable(client.phone)}`}
                aria-label={`Call ${client.name}`}
                title={`Call ${client.phone}`}
                className="flex w-14 shrink-0 items-center justify-center border-l border-line text-accent"
              >
                <Phone size={18} />
              </a>
            ) : (
              <span
                aria-hidden
                className="flex w-14 shrink-0 items-center justify-center border-l border-line text-ink-soft/25"
              >
                <Phone size={18} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
