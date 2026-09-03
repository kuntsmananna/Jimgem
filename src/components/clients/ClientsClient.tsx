"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Coins, ArrowDownAZ } from "lucide-react";
import { Segmented } from "@/components/orders/OrderSheet";
import type { ClientWithStats } from "@/lib/clients";
import { looksLikeSameClient } from "@/lib/clientName";
import { SERIES_COLORS } from "@/lib/chartPalette";
import { LineChart } from "@/components/charts/LineChart";
import { ClientModal } from "./ClientModal";
import { PaneHeader } from "@/components/Pane";
import { PageSearch, matchesSearch } from "@/components/SearchInput";
import { useVatView } from "@/components/VatViewContext";
import { formatOrderDate } from "@/lib/orderTypes";
import { count, currency } from "@/lib/money";
import { useIsMobile } from "@/components/useMediaQuery";
import { ClientsMobileList } from "./ClientsMobileList";

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
 * How the list can be ordered, as the app's own three-option track.
 *
 * `Segmented` rather than a fourth hand-written pill row: it takes its
 * tones from the surface it sits on, which is exactly what these need
 * inside the header band. Each option carries an icon, because three
 * words in a row say what they sort by but not *that* they sort.
 */
const SORTS = [
  { value: "recent" as const, text: "Recent", icon: <Clock size={13} /> },
  { value: "spend" as const, text: "Spend", icon: <Coins size={13} /> },
  { value: "name" as const, text: "A–Z", icon: <ArrowDownAZ size={13} /> },
];

/**
 * The list's columns, in one place: the header row and every client row
 * lay themselves out with `LIST_COLUMNS`, so a width changed in one is
 * changed in both. Six unlabelled numbers were readable only to whoever
 * built them.
 *
 * Each carries the sentence its figure means. The header shows it on
 * hover, and so does the cell — a number in a row is where the question
 * "what is this?" actually gets asked.
 */
const LIST_COLUMNS = "grid-cols-[2fr_9rem_5rem_7rem_7rem_6rem]";

const COLUMN_HELP = {
  name: "The client, as they are stored. Renaming one renames them everywhere.",
  phone: "Their phone number — also what the search box matches on.",
  orders: "How many orders they have placed, offers included.",
  spent: "What those orders come to, in the VAT convention set in the nav.",
  last: "The date of their most recent order.",
  due: "Still owed across their booked orders — the total less any deposit. Quotes are not counted.",
} as const;



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
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  /*
   * `?client=<id>` opens that card directly — the Orders table's customer
   * name and the order popup both link here. Read once, at mount: arriving
   * from one of those links is a navigation, so the component mounts
   * fresh; reading it on every render would fight anyone who then closed
   * the card. The same rule the Orders page's `?order=` follows.
   */
  const [openId, setOpenId] = useState<number | null>(() => {
    const wanted = Number(searchParams.get("client"));
    return Number.isInteger(wanted) && wanted > 0 ? wanted : null;
  });
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

  /*
    On a phone the page is the list and nothing else. The tiles and the two
    charts are not *rendered* rather than hidden: unlike the Orders
    summary, which describes the filtered list and moves as you narrow it,
    these four describe the whole client base and do not change with the
    search or the sort — static figures above a list you came to search are
    the "the page's subject starts halfway down" problem this column layout
    was introduced to fix.
  */
  const mobile = useIsMobile();

  /** What a client still owes across their booked orders. */
  const balanceOf = (client: ClientWithStats) =>
    (ordersByClient.get(client.id) ?? []).reduce((sum, line) => sum + Math.max(0, line.balance), 0);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)] gap-6 max-md:grid-cols-1">
      {/* No card on a phone: the client cards are the content, and a card
          of cards is one border too many — the same call Expenses makes. */}
      <section className="min-w-0 rounded-card border border-line bg-card p-6 max-md:border-0 max-md:bg-transparent max-md:p-0">
        {/*
          The phone's toolbar. `PaneHeader` is desktop-only here: its band
          pulls itself out by the 24px of padding this section no longer
          has below the breakpoint, so it would bleed off both edges. The
          count and the sort track are what it was carrying that a phone
          still needs — search is up in the header (see `PageSearch`).
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 md:hidden">
          {/* The count alone: the bottom bar already says which page this
              is, so repeating "Clients" spends width on a word that is on
              screen twice. */}
          <span className="font-display text-base font-bold text-ink">
            {count(shown.length)} <span className="font-normal opacity-60">clients</span>
          </span>
          {/*
            Without the icons here. They earn their place on a laptop,
            where the track sits inside a band among other controls and
            three bare words say what they sort by but not *that* they
            sort — but they cost 57px of a 328px row, which is the
            difference between this fitting on one line at 360px and not.
            The pill shape says "pick one" on its own.
          */}
          <Segmented
            label="Sort clients"
            value={sort}
            options={SORTS.map((option) => ({ value: option.value, text: option.text }))}
            onChange={setSort}
            size="md"
          />
        </div>

        <div className="max-md:hidden">
        <PaneHeader
          title={
            <>
              Clients <span className="font-normal opacity-60">({count(shown.length)})</span>
            </>
          }
          action={
            <div className="flex items-center gap-2">
              <PageSearch
                value={query}
                onChange={setQuery}
                placeholder="Search clients"
                label="Search clients by name, phone or email"
                className="w-48"
              />
              <Segmented label="Sort clients" value={sort} options={SORTS} onChange={setSort} size="md" />
            </div>
          }
        />
        </div>

        {mobile ? (
          <div className="mt-3">
            <ClientsMobileList
              clients={shown}
              balanceOf={balanceOf}
              onOpen={setOpenId}
              emptyNote={
                query ? "Nobody matches that." : "No clients yet — they appear as orders are booked."
              }
            />
          </div>
        ) : (
        <div className="flex flex-col">
          {/* Titles, at the quietest weight the app has: they name the
              columns without competing with the rows they head. */}
          <div
            className={`grid ${LIST_COLUMNS} items-center gap-3 border-b border-line px-2 pb-1.5 text-[10px] font-bold tracking-[0.08em] text-ink-soft/70 uppercase`}
          >
            <span title={COLUMN_HELP.name}>Client</span>
            <span title={COLUMN_HELP.phone}>Phone</span>
            <span title={COLUMN_HELP.orders}>Orders</span>
            <span title={COLUMN_HELP.spent}>Spent</span>
            <span title={COLUMN_HELP.last}>Last order</span>
            <span title={COLUMN_HELP.due}>Due</span>
          </div>
          {shown.map((client) => {
            const balance = balanceOf(client);
            return (
              <button
                key={client.id}
                onClick={() => setOpenId(client.id)}
                className={`hover-line grid ${LIST_COLUMNS} items-center gap-3 rounded-lg px-2 py-2 text-left`}
              >
                <span className="min-w-0 truncate text-sm font-semibold text-ink" title={COLUMN_HELP.name}>
                  {client.name}
                </span>
                <span className="truncate text-xs text-ink-soft tabular-nums" title={COLUMN_HELP.phone}>
                  {client.phone || "—"}
                </span>
                <span className="text-xs text-ink-soft tabular-nums" title={COLUMN_HELP.orders}>
                  {client.orderCount || "—"}
                </span>
                <span className="text-sm font-semibold text-ink tabular-nums" title={COLUMN_HELP.spent}>
                  {client.orderCount ? currency(client.totalSpent) : "—"}
                </span>
                <span className="text-xs text-ink-soft tabular-nums" title={COLUMN_HELP.last}>
                  {client.lastOrderDate ? formatOrderDate(client.lastOrderDate) : "—"}
                </span>
                <span
                  title={COLUMN_HELP.due}
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
        )}
      </section>

      {/* Everything that describes the list rather than being it. The
          convention the money is in leads, because every figure under it
          depends on which one is set. */}
      {!mobile && (
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-xs font-semibold text-ink-soft">All figures {vatLabel}</p>

        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="Clients"
            value={count(live.length)}
            note={`${withOrders} have ordered`}
            help="Everyone on the list who hasn't been archived — including those who have never ordered."
            tile="peach"
          />
          <Tile
            label="Repeat rate"
            value={withOrders > 0 ? `${Math.round((repeat / withOrders) * 100)}%` : "—"}
            note={`${repeat} came back`}
            help="The share of clients who have ordered more than once — whether the business is compounding."
            tile="mint"
          />
          <Tile
            label="Average client"
            value={withOrders > 0 ? currency(totalSpent / withOrders) : "—"}
            note="of those who ordered"
            help="Total spend divided by the clients who have actually ordered — the ones who never did would drag it down without meaning anything."
            tile="lavender"
          />
          <Tile
            label="Outstanding"
            value={currency(owed)}
            note="booked, not yet paid"
            help="What is still owed across every booked order — the total less any deposit. Quotes are not counted."
            tile="sage"
          />
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
            valueFormat={(v) => `${count(v)} orders`}
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
      )}

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
  help,
  tile,
}: {
  label: string;
  value: string;
  note: string;
  /** The sentence behind the number, on hover — see COLUMN_HELP. */
  help: string;
  tile: "peach" | "mint" | "lavender" | "sage";
}) {
  return (
    <div title={help} className="rounded-card p-5" style={{ background: `var(--color-tile-${tile})` }}>
      <p className="text-xs font-semibold text-ink/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink/60">{note}</p>
    </div>
  );
}
