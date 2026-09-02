"use client";

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
}: {
  clients: Client[];
  name: string;
  clientId: number | null;
  /** The phone for a client about to be created — see OrderForm's submit. */
  phone: string;
  onPick: (patch: { customer: string; clientId: number | null }) => void;
  onPhone: (phone: string) => void;
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
        // `keeps-size` opts out of the phone's 16px field floor (globals.css):
        // this is the one field already well above it, and the floor would
        // shrink the order's headline to the size of the boxes under it.
        className="keeps-size w-full rounded-xl px-2.5 py-1 font-display text-[28px] leading-tight font-extrabold tracking-tight placeholder:text-ink-soft/35"
      />

      <div className="mt-1 flex min-h-[1.25rem] items-center gap-2 text-[11px]">
        {picked && (
          <>
            <span className="font-semibold text-accent">On file</span>
            {picked.phone && (
              <span className="flex items-center gap-1 text-ink-soft">
                <Phone size={11} />
                {picked.phone}
              </span>
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
            <input
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
              placeholder="Phone"
              aria-label="Client phone"
              className="w-32 rounded-full border border-line bg-transparent px-2 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
            />
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
                <span className="truncate font-semibold">{client.name}</span>
                {client.phone && <span className="shrink-0 text-[11px] text-ink-soft">{client.phone}</span>}
                {client.archivedAt && <span className="shrink-0 text-[11px] text-ink-soft">archived</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
