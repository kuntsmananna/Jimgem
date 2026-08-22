"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Mail, Link2, Users, Archive, Clock, Coins, ArrowDownAZ } from "lucide-react";
import type { ClientWithStats } from "@/lib/clients";
import { looksLikeSameClient } from "@/lib/clientName";
import { SERIES_COLORS } from "@/lib/chartPalette";
import { LineChart } from "@/components/charts/LineChart";
import { Modal } from "@/components/Modal";
import { Field, TextInput } from "@/components/Field";
import { PaneHeader } from "@/components/settings/Pane";
import { SearchInput, matchesSearch } from "@/components/SearchInput";
import { EventTypeChip } from "@/components/orders/EventTypeChip";
import { useVatView } from "@/components/VatViewContext";
import { formatOrderDate } from "@/lib/orderTypes";

/** A SUMIT document, flattened for this page. */
export interface ClientDocumentLine {
  documentId: number;
  documentNumber: number | null;
  type: string;
  bucket: string;
  date: string | null;
  clientId: number | null;
  value: number;
  isClosed: boolean;
  downloadUrl: string | null;
  paymentUrl: string | null;
}

/** One of a client's orders, flattened for this page. */
export interface ClientOrderLine {
  key: string;
  clientId: number;
  date: string;
  customer: string;
  customerType: string;
  productionStatus: string;
  booked: boolean;
  balance: number;
}

/**
 * How the list can be ordered. Each carries an icon, because three words
 * in a row of pills say what they sort by but not *that* they sort —
 * the mark is what makes the group read as one control.
 */
const SORTS = [
  { id: "recent", label: "Recent", icon: Clock },
  { id: "spend", label: "Spend", icon: Coins },
  { id: "name", label: "A–Z", icon: ArrowDownAZ },
] as const;

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(Math.round(n))}`;

/**
 * The Clients page: the list on the left with most of the width, every
 * figure and chart stacked in a column beside it.
 *
 * The tiles and the two charts used to sit *above* the list, which meant
 * the thing the page is for started halfway down a laptop screen and the
 * summary took a full-width row to say four numbers. As a right-hand
 * column they are read the way they are actually used — glanced at while
 * working the list — and the list starts at the top of the page.
 */
export function ClientsClient({
  clients,
  lines,
  documents,
  months,
  newOrders,
  returningOrders,
}: {
  clients: ClientWithStats[];
  lines: ClientOrderLine[];
  /** Mirrored SUMIT documents — see sumitSync.ts. */
  documents: ClientDocumentLine[];
  months: string[];
  newOrders: number[];
  returningOrders: number[];
}) {
  const router = useRouter();
  const { label: vatLabel } = useVatView();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [sort, setSort] = useState<"recent" | "spend" | "name">("recent");

  const live = useMemo(() => clients.filter((client) => !client.archivedAt), [clients]);

  const ordersByClient = useMemo(() => {
    const map = new Map<number, ClientOrderLine[]>();
    for (const line of lines) {
      const list = map.get(line.clientId) ?? [];
      list.push(line);
      map.set(line.clientId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [lines]);

  const documentsByClient = useMemo(() => {
    const map = new Map<number, ClientDocumentLine[]>();
    for (const document of documents) {
      if (document.clientId === null) continue;
      const list = map.get(document.clientId) ?? [];
      list.push(document);
      map.set(document.clientId, list);
    }
    for (const list of map.values()) list.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return map;
  }, [documents]);

  const shown = useMemo(() => {
    const filtered = live.filter((client) =>
      matchesSearch(query, [client.name, client.phone, client.email]),
    );
    return [...filtered].sort((a, b) => {
      if (sort === "spend") return b.totalSpent - a.totalSpent;
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.lastOrderDate ?? "").localeCompare(a.lastOrderDate ?? "");
    });
  }, [live, query, sort]);

  // A repeat client is one who has come back at least once. The single
  // number that says whether the business is compounding.
  const repeat = live.filter((client) => client.orderCount > 1).length;
  const withOrders = live.filter((client) => client.orderCount > 0).length;
  const totalSpent = live.reduce((sum, client) => sum + client.totalSpent, 0);
  const owed = lines.reduce((sum, line) => sum + Math.max(0, line.balance), 0);

  const open = openId === null ? null : (clients.find((client) => client.id === openId) ?? null);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)] gap-6">
      <section className="min-w-0 rounded-card border border-line bg-card p-6">
        <PaneHeader
          title={
            <>
              Clients <span className="font-normal opacity-60">({nf.format(shown.length)})</span>
            </>
          }
          action={
            <div className="flex items-center gap-2">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search clients"
                label="Search clients by name, phone or email"
                className="w-48"
              />
              {/* The sort states its colours in the band's own pair, so it
                  follows the lid rather than needing its own black. */}
              {SORTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSort(id)}
                  aria-pressed={sort === id}
                  title={`Sort by ${label.toLowerCase()}`}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    sort === id ? "bg-band-ink text-band" : "text-band-ink/60 hover:text-band-ink"
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          }
        />

        <div className="flex flex-col">
          {shown.map((client) => {
            const theirs = ordersByClient.get(client.id) ?? [];
            const balance = theirs.reduce((sum, line) => sum + Math.max(0, line.balance), 0);
            return (
              <button
                key={client.id}
                onClick={() => setOpenId(client.id)}
                className="hover-line grid grid-cols-[2fr_9rem_5rem_7rem_7rem_6rem] items-center gap-3 rounded-lg px-2 py-2 text-left"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{client.name}</span>
                <span className="truncate text-xs text-ink-soft tabular-nums">{client.phone || "—"}</span>
                <span className="text-xs text-ink-soft tabular-nums">{client.orderCount || "—"}</span>
                <span className="text-sm font-semibold text-ink tabular-nums">
                  {client.orderCount ? currency(client.totalSpent) : "—"}
                </span>
                <span className="text-xs text-ink-soft tabular-nums">
                  {client.lastOrderDate ? formatOrderDate(client.lastOrderDate) : "—"}
                </span>
                <span
                  className={`text-xs font-semibold tabular-nums ${balance > 0 ? "text-ink" : "text-ink-soft"}`}
                >
                  {balance > 0 ? currency(balance) : "—"}
                </span>
              </button>
            );
          })}
          {shown.length === 0 && (
            <p className="py-6 text-sm text-ink-soft">
              {query ? "Nobody matches that." : "No clients yet — they appear as orders are booked."}
            </p>
          )}
        </div>
      </section>

      {/* Everything that describes the list rather than being it. The
          convention the money is in leads, because every figure under it
          depends on which one is set. */}
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-xs font-semibold text-ink-soft">All figures {vatLabel}</p>

        <div className="grid grid-cols-2 gap-3">
          <Tile label="Clients" value={nf.format(live.length)} note={`${withOrders} have ordered`} tile="peach" />
          <Tile
            label="Repeat rate"
            value={withOrders > 0 ? `${Math.round((repeat / withOrders) * 100)}%` : "—"}
            note={`${repeat} came back`}
            tile="mint"
          />
          <Tile
            label="Average client"
            value={withOrders > 0 ? currency(totalSpent / withOrders) : "—"}
            note="of those who ordered"
            tile="lavender"
          />
          <Tile label="Outstanding" value={currency(owed)} note="booked, not yet paid" tile="sage" />
        </div>

        <section className="min-w-0 rounded-card border border-line bg-card p-5">
          <h2 className="font-display text-base font-bold text-ink">New vs returning</h2>
          <p className="mt-0.5 mb-3 text-xs text-ink-soft">
            Orders per month from a client&apos;s first booking against everyone coming back.
          </p>
          <LineChart
            series={[
              { label: "Returning", color: SERIES_COLORS.sage, values: returningOrders },
              { label: "New", color: SERIES_COLORS.berry, values: newOrders },
            ]}
            xLabels={months}
            height={150}
            valueFormat={(v) => `${nf.format(v)} orders`}
          />
        </section>

        <section className="min-w-0 rounded-card border border-line bg-card p-5">
          <h2 className="font-display text-base font-bold text-ink">Top clients</h2>
          <p className="mt-0.5 mb-3 text-xs text-ink-soft">By what they have spent.</p>
          <ul className="flex flex-col">
            {[...live]
              .sort((a, b) => b.totalSpent - a.totalSpent)
              .slice(0, 6)
              .map((client) => (
                <li key={client.id}>
                  <button
                    onClick={() => setOpenId(client.id)}
                    className="hover-line flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{client.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{client.orderCount}×</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      {currency(client.totalSpent)}
                    </span>
                  </button>
                </li>
              ))}
            {live.length === 0 && <p className="text-sm text-ink-soft">No clients yet.</p>}
          </ul>
        </section>
      </div>

      {open && (
        <ClientModal
          client={open}
          orders={ordersByClient.get(open.id) ?? []}
          documents={documentsByClient.get(open.id) ?? []}
          similar={clients.filter((other) => other.id !== open.id && looksLikeSameClient(other.name, open.name))}
          onClose={() => setOpenId(null)}
          onSaved={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tile,
}: {
  label: string;
  value: string;
  note: string;
  tile: "peach" | "mint" | "lavender" | "sage";
}) {
  return (
    <div className="rounded-card p-5" style={{ background: `var(--color-tile-${tile})` }}>
      <p className="text-xs font-semibold text-ink/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink/60">{note}</p>
    </div>
  );
}

/**
 * One client: their details, editable, and every order they have placed.
 *
 * Phone and email are edited here because this is where they are looked
 * at. They are also what links a client to SUMIT — its customers carry an
 * email but no phone, and its API cannot be searched at all, so what is
 * typed here is what makes a match possible later.
 */
function ClientModal({
  client,
  orders,
  documents,
  similar,
  onClose,
  onSaved,
}: {
  client: ClientWithStats;
  orders: ClientOrderLine[];
  documents: ClientDocumentLine[];
  /** Clients whose names look like longer or shorter forms of this one. */
  similar: ClientWithStats[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: client.name,
    phone: client.phone,
    email: client.email,
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
      body: JSON.stringify({ archived: true }),
    });
    setBusy(false);
    onSaved();
  }

  return (
    <Modal title={client.name} onClose={onClose}>
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

        {/*
          Save keeps the bottom-right corner every popup uses. Archiving
          sits at the far left of the same row, as far from Save as the row
          allows: it is the one button here that changes what the page
          shows rather than what the client says.
        */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={archive}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-black/[0.06] hover:text-ink disabled:opacity-60"
          >
            <Archive size={13} />
            Archive
          </button>
          <div className="flex gap-2">
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
      </div>
    </Modal>
  );
}
