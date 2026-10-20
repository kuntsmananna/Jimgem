"use client";

import { dialable } from "@/components/clients/ClientsMobileList";
import { useMemo, useRef, useState } from "react";
import { Phone, UserPlus } from "lucide-react";
import type { Client } from "@/lib/clients";
import { looksLikeSameClient, normalizeClientName } from "@/lib/clientName";
import { TextInput } from "@/components/Field";
import { usePopoverDismiss } from "@/components/useOverlayDismiss";

/**
 * Who the order is for.
 *
 * It looks like the free-text headline it replaced, and still types like
 * one — a name nobody has ordered under before is simply typed and the
 * client is created when the order is saved. What it adds is recognition:
 * as the name is typed, clients already on file are offered, and picking
 * one links the order to them.
 *
 * That link is the whole point. SUMIT can create and update a customer but
 * cannot list or search them, so the id it hands back has to be stored
 * against something — and an order pointing at free text has nothing to
 * store it on. Every client view, every document, and every "what do they
 * owe" question hangs off this one field.
 *
 * A near match is *offered*, never applied: `בילדוטס` and `בילדוטס בע"מ`
 * are usually the same customer and occasionally aren't, and only a person
 * can tell which.
 */
export function ClientPicker({
  clients,
  name,
  clientId,
  phone,
  onPick,
  onPhone,
  leading = null,
}: {
  clients: Client[];
  name: string;
  clientId: number | null;
  /** The phone for a client about to be created — see OrderForm's submit. */
  phone: string;
  onPick: (patch: { customer: string; clientId: number | null }) => void;
  onPhone: (phone: string) => void;
  /** Drawn at the start of the "On file" line — the phone's client-card link. */
  leading?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, box, () => setOpen(false));

  const picked = clientId === null ? null : (clients.find((client) => client.id === clientId) ?? null);

  // Live clients only while offering a choice, plus whichever client this
  // order already uses — the rule every picker in the app follows, so an
  // archived client stays visible exactly where it is still in use.
  const matches = useMemo(() => {
    const typed = normalizeClientName(name);
    if (!typed) return [];
    return clients
      .filter((client) => !client.archivedAt || client.id === clientId)
      .filter((client) => {
        const candidate = normalizeClientName(client.name);
        return candidate.includes(typed) || typed.includes(candidate);
      })
      .slice(0, 6);
  }, [clients, name, clientId]);

  const exact = clients.some((client) => normalizeClientName(client.name) === normalizeClientName(name));
  const isNew = name.trim() !== "" && !exact;
  // Someone already on file under a longer or shorter form of this name.
  const nearby = isNew ? clients.filter((client) => looksLikeSameClient(client.name, name)) : [];

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      {/*
        `TextInput`, not a bare input: it carries `.input`, so this fills
        when empty and drops to bare text when filled, exactly like the
        date and location beside it. Only the size differs.
      */}
      <TextInput
        value={name}
        onChange={(e) => {
          // Typing past a linked client unlinks it: the name and the link
          // must never disagree, and re-picking is one click.
          onPick({ customer: e.target.value, clientId: null });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Customer name"
        aria-label="Customer"
        data-private
        // `keeps-size` opts out of the phone's 16px field floor (globals.css):
        // this is the one field already well above it, and the floor would
        // shrink the order's headline to the size of the boxes under it.
        className="keeps-size w-full rounded-xl px-2.5 py-1 font-display text-[28px] leading-tight font-extrabold tracking-tight placeholder:font-semibold placeholder:text-ink-soft"
      />

      <div className="mt-1 flex min-h-[1.25rem] items-center gap-2 text-[11px] max-md:min-h-0 max-md:pl-1.5 max-md:empty:hidden">
        {picked && (
          <>
            {leading}
            <span className="font-semibold text-accent">On file</span>
            {/* On a phone the number is set like the date under it — the
                mark and the value at reading size (v0.84) — and dials when
                tapped, since that is what a number is for there. */}
            {picked.phone && (
              <a
                href={`tel:${dialable(picked.phone)}`}
                className="flex items-center gap-1 text-ink-soft max-md:gap-1.5 max-md:text-base max-md:text-ink max-md:tabular-nums"
              >
                <Phone size={11} className="max-md:h-[15px] max-md:w-[15px] max-md:text-ink-soft" />
                <span data-private>{picked.phone}</span>
              </a>
            )}
            {picked.sumitCustomerId && <span className="text-ink-soft">· linked to SUMIT</span>}
          </>
        )}
        {isNew && (
          <>
            <span className="flex items-center gap-1 font-semibold text-ink-soft">
              <UserPlus size={11} />
              New client
            </span>
            {/* Asked for here because it is the match key from now on:
                SUMIT customers carry no phone today, so this is what makes
                a client findable there rather than by name. */}
            {/* On a phone it is set like the Location field under it — a
                mark inside a filled box — and asks for the phone keypad
                (v0.84.2). */}
            <label className="relative flex items-center">
              <Phone
                size={14}
                aria-hidden
                className="pointer-events-none absolute left-2.5 hidden text-ink-soft max-md:block"
              />
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                data-private
                value={phone}
                onChange={(e) => onPhone(e.target.value)}
                placeholder="Phone"
                aria-label="Client phone"
                className="w-32 rounded-full border border-line bg-transparent px-2 py-0.5 text-[11px] text-ink outline-none focus:border-accent max-md:w-44 max-md:rounded-xl max-md:border-transparent max-md:bg-ink/[0.05] max-md:py-1.5 max-md:pr-2.5 max-md:pl-8 max-md:focus:border-accent max-md:focus:bg-card"
              />
            </label>
            {nearby.length > 0 && (
              <span className="text-ink-soft">
                similar: {nearby.map((client) => client.name).join(", ")}
              </span>
            )}
          </>
        )}
      </div>

      {open && matches.length > 0 && (
        <ul className="motion-drop absolute top-full right-0 left-0 z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-line bg-card py-1 shadow-lg">
          {matches.map((client) => (
            <li key={client.id}>
              <button
                type="button"
                onClick={() => {
                  onPick({ customer: client.name, clientId: client.id });
                  setOpen(false);
                }}
                className="hover-line flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink"
              >
                <span data-private className="truncate font-semibold">{client.name}</span>
                {client.phone && <span data-private className="shrink-0 text-[11px] text-ink-soft">{client.phone}</span>}
                {client.archivedAt && <span className="shrink-0 text-[11px] text-ink-soft">archived</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
