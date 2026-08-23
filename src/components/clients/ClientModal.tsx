"use client";

import { useState } from "react";
import { Phone, Mail, Link2, Users, Archive, UserRound } from "lucide-react";
import type { Client } from "@/lib/clients";
import { Modal } from "@/components/Modal";
import { currency } from "@/lib/money";
import { Field, TextInput } from "@/components/Field";
import { LastEdited } from "@/components/LastEdited";
import { EventTypeChip } from "@/components/orders/EventTypeChip";
import { formatOrderDate } from "@/lib/orderTypes";
import type { ClientDocumentLine, ClientOrderLine } from "./ClientsClient";



/**
 * One client: their details, editable, and every order they have placed.
 *
 * Phone and email are edited here because this is where they are looked
 * at. They are also what links a client to SUMIT — its customers carry an
 * email but no phone, and its API cannot be searched at all, so what is
 * typed here is what makes a match possible later.
 */
export function ClientModal({
  client,
  orders,
  documents,
  similar,
  onClose,
  onSaved,
}: {
  client: Client;
  orders: ClientOrderLine[];
  /**
   * Omit where they are not loaded — the Orders page opens this card
   * without a SUMIT read. The section then disappears rather than
   * reporting "nothing synced yet", which would be a different claim.
   */
  documents?: ClientDocumentLine[];
  /** Clients whose names look like longer or shorter forms of this one. */
  similar: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: client.name,
    phone: client.phone,
    email: client.email,
    source: client.source,
    notes: client.notes,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft.name.trim()) return;
    setBusy(true);
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    onSaved();
  }

  /**
   * Archive, never delete — the rule every owner-managed list follows.
   * Orders point at their client, so a hard delete would either orphan
   * them or cascade and take real history with it. Archiving takes the
   * client off this list and out of the order form's picker, and leaves
   * every order they placed exactly as recorded; Settings → Data →
   * Archived is where they come back from.
   */
  async function archive() {
    if (
      !confirm(
        `Archive "${client.name}"?\n\nThey leave the client list and the order form's picker. Their orders keep them exactly as recorded, and Settings → Data → Archived is where they come back from.`,
      )
    ) {
      return;
    }
    setBusy(true);
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // `archive`, the key the settings routes already use for the other
      // eight lists — one convention rather than two.
      body: JSON.stringify({ archive: true }),
    });
    setBusy(false);
    onSaved();
  }

  return (
    // The mark says which kind of popup this is — a client card can open
    // on top of an order form, and both are a band with a name on it.
    <Modal title={client.name} icon={<UserRound size={17} />} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name">
            <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <TextInput
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="050…"
            />
          </Field>
          <Field label="Email">
            <TextInput
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="name@example.com"
            />
          </Field>
        </div>
        {/* Free text, not a list of channels: the useful answer is usually
            a sentence ("saw us at Noa's wedding"), and a fixed list would
            file it under whichever bucket is nearest and lose it. */}
        <Field label="Where they came from">
          <TextInput
            value={draft.source}
            onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            placeholder="Instagram, Google, a friend…"
          />
        </Field>
        <Field label="Notes">
          <TextInput value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>

        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          <span className="flex items-center gap-1">
            <Users size={12} />
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </span>
          {client.phone && (
            <span className="flex items-center gap-1">
              <Phone size={12} />
              {client.phone}
            </span>
          )}
          {client.email && (
            <span className="flex items-center gap-1">
              <Mail size={12} />
              {client.email}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Link2 size={12} />
            {client.sumitCustomerId ? `SUMIT #${client.sumitCustomerId}` : "not linked to SUMIT yet"}
          </span>
        </div>

        {similar.length > 0 && (
          <p className="rounded-lg bg-tile-peach px-3 py-2 text-xs font-medium text-ink">
            Possibly the same client as {similar.map((other) => other.name).join(", ")} — if so, rename one to
            match and their orders can be pointed at it.
          </p>
        )}

        <div className="max-h-56 overflow-auto rounded-xl border border-line">
          {orders.map((line) => (
            <div key={line.key} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
              <span className="w-16 shrink-0 text-xs text-ink-soft tabular-nums">
                {formatOrderDate(line.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{line.customer}</span>
              {line.customerType && <EventTypeChip value={line.customerType} />}
              {line.balance > 0 && (
                <span className="shrink-0 text-xs font-semibold text-ink tabular-nums">
                  {currency(line.balance)} due
                </span>
              )}
            </div>
          ))}
          {orders.length === 0 && <p className="px-3 py-4 text-sm text-ink-soft">No orders yet.</p>}
        </div>

        {/*
          What SUMIT holds for them. Read from the local mirror, so this
          shows whatever the last sync saw rather than costing a call every
          time a client is opened. A payment link is offered on anything
          still open — it is the fastest way to chase money, and SUMIT puts
          one on every document it issues.
        */}
        {documents !== undefined && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">SUMIT documents</span>
          <div className="max-h-40 overflow-auto rounded-xl border border-line">
            {documents.map((document) => (
              <div
                key={document.documentId}
                className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
              >
                <span className="w-16 shrink-0 text-xs text-ink-soft tabular-nums">
                  {document.date ? formatOrderDate(document.date) : "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {document.type}
                  {document.documentNumber !== null && (
                    <span className="text-ink-soft"> #{document.documentNumber}</span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
                  {currency(document.value)}
                </span>
                {document.bucket !== "revenue" && document.isClosed && (
                  <span className="shrink-0 text-[11px] font-semibold text-accent">paid</span>
                )}
                {document.paymentUrl && !document.isClosed && (
                  <a
                    href={document.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[11px] font-semibold text-accent hover:underline"
                  >
                    pay link
                  </a>
                )}
                {document.downloadUrl && (
                  <a
                    href={document.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[11px] font-semibold text-ink-soft hover:text-ink"
                  >
                    PDF
                  </a>
                )}
              </div>
            ))}
            {documents.length === 0 && (
              <p className="px-3 py-4 text-sm text-ink-soft">
                {client.sumitCustomerId
                  ? "Nothing synced for them yet."
                  : "Not linked to SUMIT — they link themselves when a document is issued under this exact name, or on the next sync."}
              </p>
            )}
          </div>
        </div>
        )}

        {/*
          Save keeps the bottom-right corner every popup uses. Archiving
          sits at the far left of the same row, as far from Save as the row
          allows: it is the one button here that changes what the page
          shows rather than what the client says.
        */}
        <div className="flex items-center justify-end gap-2">
          {/* Left end of the save row, costing no height of its own. */}
          <LastEdited at={client.updatedAt} by={client.updatedBy} />
          <button
            onClick={archive}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-black/[0.06] hover:text-ink disabled:opacity-60"
          >
            <Archive size={13} />
            Archive
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !draft.name.trim()}
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
