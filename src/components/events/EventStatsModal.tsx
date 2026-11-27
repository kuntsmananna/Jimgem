"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { BarChart3, Download } from "lucide-react";
import { Modal } from "@/components/Modal";
import { JellyPile } from "@/components/JellyLoader";
import { useVatView } from "@/components/VatViewContext";
import { count, currency, currencyExact } from "@/lib/money";
import { formatOrderDate, orderWeekday } from "@/lib/orderTypes";
import type { StatsSale } from "@/lib/eventStats";

type CubeColor = { g: string; b: string; s: string };

interface StatsData {
  event: {
    id: number;
    name: string;
    date: string;
    startsAt: string | null;
    endsAt: string | null;
    location: string;
    countStock: boolean;
    sellers: string[];
  };
  products: { presetId: number; name: string; units: number; color: CubeColor; brought: number | null }[];
  sales: StatsSale[];
  vatRate: number;
}

const HOW: Record<StatsSale["how"], string> = { card: "Card", cash: "Cash", self: "Self-scan" };
const SLOT = 15;

const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const toMinute = (hhmm: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
/**
 * Minutes on the event's own clock: anything before 06:00 is the night
 * running on past midnight, not that morning, so an event from 20:00 to
 * 01:00 draws as one evening rather than a whole day.
 */
const NIGHT_ENDS = 6 * 60;
const onEventClock = (minute: number | null) => (minute !== null && minute < NIGHT_ENDS ? minute + 1440 : minute);

/**
 * One event's statistics (v0.103, the owner's ask; drawn on the canvas's
 * Stats board): who came, what it took, when the rush was, what sold, and
 * every sale, with a CSV of them to download. Paid sales only.
 *
 * Read from `/api/events/<id>/stats` when it opens, so the Events page,
 * the Dashboard and the Biz Plan can each open it from a row without
 * carrying every event's sales. Money follows the VAT switch like every
 * other figure: takings are VAT-included at a stall, and the net side
 * takes the business's rate back out.
 */
export function EventStatsModal({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const [data, setData] = useState<StatsData | null>(null);
  const [failed, setFailed] = useState(false);
  const { view, label: vatLabel } = useVatView();

  useEffect(() => {
    let live = true;
    fetch(`/api/events/${eventId}/stats`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: StatsData) => live && setData(body))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [eventId]);

  return (
    <Modal title={data?.event.name ?? "Event statistics"} icon={<BarChart3 size={18} aria-hidden />} onClose={onClose} wide>
      {failed ? (
        <p className="p-6 text-sm text-ink-soft">Couldn&rsquo;t load the statistics. Check the connection and open it again.</p>
      ) : !data ? (
        <div className="flex justify-center py-16">
          <JellyPile />
        </div>
      ) : (
        <StatsBody data={data} net={view === "net"} vatLabel={vatLabel} />
      )}
    </Modal>
  );
}

function StatsBody({ data, net, vatLabel }: { data: StatsData; net: boolean; vatLabel: string }) {
  const { event, products, sales } = data;
  const money = (gross: number) => (net ? gross / (1 + data.vatRate / 100) : gross);
  const productById = new Map(products.map((p) => [p.presetId, p]));
  const name = (id: number) => productById.get(id)?.name ?? "A retired box";

  const takings = sales.reduce((sum, s) => sum + s.total, 0);
  const boxesPerSale = sales.map((s) => s.items.reduce((n, i) => n + i.qty, 0));
  const boxes = boxesPerSale.reduce((a, b) => a + b, 0);
  const withDeal = sales.filter((s) => s.discount > 0).length;
  const brought = event.countStock
    ? products.reduce<number | null>((sum, p) => (p.brought === null ? sum : (sum ?? 0) + p.brought), null)
    : null;

  const sold = new Map<number, number>();
  for (const s of sales) for (const i of s.items) sold.set(i.presetId, (sold.get(i.presetId) ?? 0) + i.qty);
  const ranked = products
    .map((p) => ({ ...p, sold: sold.get(p.presetId) ?? 0 }))
    .filter((p) => p.sold > 0 || p.brought !== null)
    .sort((a, b) => b.sold - a.sold);
  const topSold = Math.max(1, ...ranked.map((p) => p.sold));

  // The timeline runs over the event's own hours, widened to take in any
  // sale outside them; without hours, from the first sale's hour to the last.
  const minutes = sales.map((s) => onEventClock(s.minute)!);
  const first = minutes.length ? Math.min(...minutes) : null;
  const last = minutes.length ? Math.max(...minutes) : null;
  const startAt = Math.min(onEventClock(toMinute(event.startsAt)) ?? Infinity, first ?? Infinity);
  const endAt = Math.max(onEventClock(toMinute(event.endsAt)) ?? -Infinity, last !== null ? last + 1 : -Infinity);
  const slots: number[] = [];
  let from = 0;
  if (Number.isFinite(startAt) && Number.isFinite(endAt)) {
    from = Math.floor(startAt / 60) * 60;
    const to = Math.ceil(endAt / SLOT) * SLOT;
    for (let m = from; m < to; m += SLOT) slots.push(0);
    for (const m of minutes) slots[Math.floor((m - from) / SLOT)] += 1;
  }
  const peak = Math.max(0, ...slots);
  const peakAt = slots.indexOf(peak);

  const meta = [
    `${orderWeekday(event.date)} ${formatOrderDate(event.date)}`,
    event.startsAt ? `${event.startsAt}${event.endsAt ? ` – ${event.endsAt}` : ""}` : "",
    event.location,
    event.sellers.length ? `sold by ${event.sellers.join(", ")}` : "",
  ].filter(Boolean);

  const download = () => {
    const rows = [
      ["Sale", "Time", "Items", "Deal", "Paid by", "Discount", "Total"],
      ...sales.map((s) => [
        String(s.id),
        s.time,
        s.items.map((i) => `${i.qty} x ${name(i.presetId)}`).join(", "),
        s.deal,
        HOW[s.how],
        String(s.discount),
        String(s.total),
      ]),
    ];
    // A cell starting with = + - @ would run as a formula in Excel.
    const cell = (c: string) => `"${(/^[=+\-@]/.test(c) ? `'${c}` : c).replaceAll('"', '""')}"`;
    const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
    // A byte-order mark so Excel reads the Hebrew names as Hebrew.
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "event"} sales.csv`;
    // In the document, and the URL kept a moment: Safari reads the blob
    // after the click returns, and an older Firefox ignores a detached link.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{meta.join(" · ")}</p>
        <button
          type="button"
          onClick={download}
          disabled={sales.length === 0}
          className="press flex h-9 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-bold disabled:opacity-50"
        >
          <Download size={15} aria-hidden />
          Download sales
        </button>
      </div>

      <div className="motion-stagger grid grid-cols-5 gap-3 max-md:grid-cols-2">
        <Tile label="Customers" value={count(sales.length)} note="paid sales" tile="peach" />
        <Tile label="Takings" value={currency(money(takings))} note={vatLabel} tile="mint" />
        <Tile
          label="Average basket"
          value={sales.length ? currency(money(takings / sales.length)) : "—"}
          note={sales.length ? `${(boxes / sales.length).toFixed(1)} boxes` : "no sales yet"}
          tile="lavender"
        />
        <Tile
          label="Boxes sold"
          value={count(boxes)}
          note={brought !== null ? `of ${count(brought)} brought` : "stock not counted"}
          tile="sage"
        />
        <Tile
          wide
          label="Bought a deal"
          value={sales.length ? `${Math.round((withDeal / sales.length) * 100)}%` : "—"}
          note={`${withDeal} of ${sales.length} sales`}
          tile="peach"
        />
      </div>

      {sales.length === 0 ? (
        <p className="rounded-card border border-line bg-card px-6 py-10 text-center text-sm text-ink-soft">
          No paid sales yet. They appear here as the register and the shop take them.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[3fr_2fr] gap-4 max-md:grid-cols-1">
            <section className="rounded-card border border-line bg-card p-5">
              <h2 className="text-sm font-extrabold">Sales through the {from >= 17 * 60 ? "evening" : "day"} · every 15 minutes</h2>
              <div className="mt-4 flex h-40 items-end gap-[3px]" aria-hidden>
                {slots.map((n, i) => (
                  <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                    {n > 0 && <span className="mb-0.5 text-[10px] font-bold text-ink-soft tabular-nums">{n}</span>}
                    <span
                      className="motion-column w-full rounded-t-[3px]"
                      style={{
                        height: `${peak ? (n / peak) * 100 : 0}%`,
                        minHeight: n ? 3 : 0,
                        background: i === peakAt ? "var(--color-accent)" : "#a9bfa9",
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* Each hour's label under its own bar, and the closing hour
                  at the right edge. */}
              <div className="relative mt-1.5 h-4 text-[11px] font-semibold text-ink-soft tabular-nums" aria-hidden>
                {[...slots.map((_, i) => from + i * SLOT), from + slots.length * SLOT]
                  .filter((m) => m % 60 === 0)
                  .map((m) => {
                    const at = (m - from) / (slots.length * SLOT);
                    return (
                      <span
                        key={m}
                        className="absolute top-0"
                        style={{ left: `${at * 100}%`, transform: at === 0 ? "none" : at === 1 ? "translateX(-100%)" : "translateX(-50%)" }}
                      >
                        {clock(m)}
                      </span>
                    );
                  })}
              </div>
              <p className="mt-3 text-sm">
                Busiest: <b>{clock(from + peakAt * SLOT)}–{clock(from + (peakAt + 1) * SLOT)}</b>, {peak} sale
                {peak === 1 ? "" : "s"}
              </p>
            </section>

            <section className="rounded-card border border-line bg-card p-5">
              <h2 className="text-sm font-extrabold">Boxes by product</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {ranked.map((p) => (
                  <li key={p.presetId}>
                    <p className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-bold" dir="auto">
                        {p.name}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">
                        {p.sold}
                        {p.brought !== null && event.countStock && (
                          <span className="font-semibold text-ink-soft"> / {p.brought}</span>
                        )}
                      </span>
                    </p>
                    <span className="mt-1 block h-2.5 rounded-full bg-line/60">
                      <span
                        className="motion-bar block h-full rounded-full"
                        style={{
                          width: `${(p.sold / topSold) * 100}%`,
                          background: `linear-gradient(90deg, ${p.color.g}, ${p.color.b})`,
                        } as CSSProperties}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              {brought !== null && (
                <p className="mt-4 text-sm text-ink-soft">
                  Brought {count(brought)} · sold {count(boxes)} · {count(Math.max(0, brought - boxes))} left
                </p>
              )}
            </section>
          </div>

          <section className="rounded-card border border-line bg-card p-5">
            <h2 className="text-sm font-extrabold">Every sale</h2>
            <ul className="mt-2 divide-y divide-line">
              {[...sales].reverse().map((s) => (
                <li
                  key={s.id}
                  className="grid grid-cols-[48px_48px_minmax(0,1fr)_auto_72px_80px] items-center gap-3 py-2 text-sm max-md:grid-cols-[44px_minmax(0,1fr)_auto] max-md:gap-x-2"
                >
                  <span className="font-semibold tabular-nums">{s.time}</span>
                  <span className="text-ink-soft tabular-nums max-md:hidden">#{s.id}</span>
                  <span className="truncate">
                    {s.items.map((i, k) => (
                      <span key={i.presetId}>
                        {k > 0 && ", "}
                        {i.qty} × <bdi>{name(i.presetId)}</bdi>
                      </span>
                    ))}
                  </span>
                  <span className="text-xs font-semibold text-ink-soft max-md:hidden" dir="auto">
                    {s.deal || "—"}
                  </span>
                  <span className="text-xs font-bold max-md:hidden">{HOW[s.how]}</span>
                  <span className="text-end font-bold tabular-nums">{currencyExact(money(s.total))}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, note, tile, wide = false }: { label: string; value: string; note: string; tile: string; wide?: boolean }) {
  return (
    // `wide`: the fifth of five, across the whole row on a phone rather than alone in half of it.
    <div className={`rounded-card p-4 ${wide ? "max-md:col-span-2" : ""}`} style={{ background: `var(--color-tile-${tile})` }}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="font-display mt-1 text-2xl font-extrabold">{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
    </div>
  );
}
