"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, Plus, Trash2, X } from "lucide-react";
import { JellyHop } from "@/components/JellyLoader";
import { LastEdited } from "@/components/LastEdited";
import { Tip } from "@/components/Tip";
import { notify } from "@/components/Notices";
import { sendWrite } from "@/components/saveError";
import { currency } from "@/lib/money";
import type { PresetSummary } from "@/lib/eventPresets";
import {
  DEAL_KINDS,
  dealLabel,
  type DealKind,
  type EventDeal,
  type EventInput,
  type PayMode,
  type QrMode,
} from "@/lib/eventTypes";

/**
 * Setting an event up at the desk (v0.100 event register, stage 1): the
 * event itself, how customers pay, what is on the table at what price and
 * how many are brought, and the deals. Four numbered cards, a side column
 * that ticks itself off as the event becomes sellable, and Save draft /
 * Save — ready to sell at the top, the way the design canvas laid it out.
 *
 * The whole event saves at once, guarded against a save somebody else
 * made in the meantime (409), like the order form.
 */
export function EventSetupForm({
  eventId,
  initial,
  updatedAt,
  updatedBy,
  presets,
  staff,
}: {
  eventId: number | null;
  initial: EventInput;
  updatedAt: string | null;
  updatedBy: string;
  presets: PresetSummary[];
  staff: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<EventInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<EventInput>) => setDraft((d) => ({ ...d, ...patch }));
  const presetById = new Map(presets.map((p) => [p.id, p]));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = async (status: EventInput["status"]) => {
    setError(null);
    if (!draft.name.trim()) {
      setError("Give the event a name first.");
      return;
    }
    setBusy(true);
    const body = { ...draft, status, expectedUpdatedAt: updatedAt ?? undefined };
    const { response, error: refused } = await sendWrite(
      "event",
      eventId === null ? "/api/events" : `/api/events/${eventId}`,
      { method: eventId === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    setBusy(false);
    if (refused || !response) {
      setError(refused ?? "Something went wrong.");
      return;
    }
    if (eventId === null) {
      const { id } = (await response.json()) as { id: number };
      router.replace(`/events/${id}`);
    } else {
      router.refresh();
    }
    notify(status === "ready" ? "Saved — ready to sell." : "Draft saved.");
  };

  const remove = async () => {
    if (eventId === null) return;
    if (!confirm("Delete this event?")) return;
    const { error: refused } = await sendWrite("event", `/api/events/${eventId}`, { method: "DELETE" });
    if (refused) {
      notify(refused);
      return;
    }
    router.push("/events");
  };

  // ---- products
  const unused = presets.filter((p) => !draft.products.some((x) => x.presetId === p.id));
  const addProduct = (presetId: number) => {
    const preset = presetById.get(presetId);
    set({ products: [...draft.products, { presetId, price: preset?.usualPrice ?? 0, brought: null }] });
  };
  const setProduct = (index: number, patch: Partial<EventInput["products"][number]>) =>
    set({ products: draft.products.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  const removeProduct = (index: number) => {
    const gone = draft.products[index].presetId;
    set({
      products: draft.products.filter((_, i) => i !== index),
      // A deal naming a product that is no longer on the table forgets it.
      deals: draft.deals.map((d) => ({ ...d, presetIds: d.presetIds.filter((id) => id !== gone) })),
    });
  };

  // ---- deals
  const addDeal = (kind: DealKind) =>
    set({
      deals: [
        ...draft.deals,
        {
          kind,
          minQty: kind === "price" ? 1 : kind === "free" ? 4 : kind === "percent" ? 5 : 3,
          price: kind === "bundle" || kind === "price" ? 0 : null,
          percent: kind === "percent" ? 10 : null,
          presetIds: [],
        },
      ],
    });
  const setDeal = (index: number, patch: Partial<EventDeal>) =>
    set({ deals: draft.deals.map((d, i) => (i === index ? { ...d, ...patch } : d)) });

  // ---- readiness
  const priced = draft.products.filter((p) => p.price > 0).length;
  const needsSigns = draft.payMode !== "staff";
  const broughtTotal = draft.products.reduce((sum, p) => sum + (p.brought ?? 0), 0);
  const checks = [
    { label: "Name and date", ok: draft.name.trim() !== "" && draft.date !== "" },
    { label: draft.sellerIds.length ? "Who sells" : "Pick who sells", ok: draft.sellerIds.length > 0 },
    {
      label: draft.products.length ? `${priced} of ${draft.products.length} products priced` : "Add products",
      ok: draft.products.length > 0 && priced === draft.products.length,
    },
    {
      label: draft.countStock ? `Stock to bring: ${broughtTotal} boxes` : "Stock not counted",
      ok: !draft.countStock || draft.products.every((p) => p.brought !== null),
    },
    { label: needsSigns ? `Signs to print: ${draft.qrMode === "product" ? draft.products.length : 1}` : "No signs needed", ok: true },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/events" className="text-sm font-bold text-accent">
          ← Events
        </Link>
        <h1 className="font-display flex-1 text-3xl font-extrabold">{eventId === null ? "New event" : "Edit event"}</h1>
        {updatedAt && <LastEdited at={updatedAt} by={updatedBy} />}
        {eventId !== null && (
          <Tip label="Delete this event — it can be restored from the change log">
            <button
              type="button"
              onClick={remove}
              aria-label="Delete event"
              className="press flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-band hover:text-ink"
            >
              <Trash2 size={17} />
            </button>
          </Tip>
        )}
        <Tip label="Save without marking it ready — you can come back to it">
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={busy}
            className="press h-10 rounded-full border border-line bg-card px-4 text-sm font-bold"
          >
            Save draft
          </button>
        </Tip>
        <Tip label="Save and mark it ready — the register can open it on the day">
          <button
            type="button"
            onClick={() => save("ready")}
            disabled={busy}
            className="press flex h-10 items-center gap-2 rounded-full bg-black px-5 text-sm font-extrabold text-cream"
          >
            {busy ? <JellyHop /> : "Save — ready to sell"}
          </button>
        </Tip>
      </div>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      {dirty && !error && <p className="text-xs font-semibold text-ink-soft">Unsaved changes</p>}

      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6 max-lg:grid-cols-1">
        <div className="motion-stagger flex flex-col gap-4">
          {/* 1 · The event */}
          <Card n={1} title="The event">
            <div className="grid grid-cols-[minmax(0,1fr)_170px_120px_120px] items-end gap-3 max-md:grid-cols-2">
              <Field label="Name" className="max-md:col-span-2">
                <input
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Christmas market, Sarona"
                  className={INPUT}
                />
              </Field>
              <Field label="Date" className="max-md:col-span-2">
                <span className={`${BOX} gap-2 px-3`}>
                  <CalendarDays size={16} className="shrink-0 text-ink-soft" aria-hidden />
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => set({ date: e.target.value })}
                    className="w-full min-w-0 bg-transparent text-[15px] font-semibold outline-none"
                  />
                </span>
              </Field>
              <TimeSelect label="From" value={draft.startsAt} onChange={(startsAt) => set({ startsAt })} />
              <TimeSelect label="Until" value={draft.endsAt} onChange={(endsAt) => set({ endsAt })} />
            </div>
            <Field label="Place" className="mt-3">
              <input
                value={draft.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Where it is"
                className={INPUT}
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ink-soft">Who sells</span>
              {staff.map((person) => {
                const on = draft.sellerIds.includes(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({ sellerIds: on ? draft.sellerIds.filter((id) => id !== person.id) : [...draft.sellerIds, person.id] })
                    }
                    className={`press h-9 rounded-full border px-4 text-sm font-bold transition-colors ${
                      on ? "border-black bg-black text-cream" : "border-line bg-card text-ink"
                    }`}
                  >
                    {person.name}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* 2 · How customers pay */}
          <Card n={2} title="How customers pay">
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              {(
                [
                  ["staff", "Staff rings it up", "The seller taps what they took and shows a QR to pay."],
                  ["self", "Customers self-scan", "Printed QR codes; they pay and show a confirmation."],
                  ["both", "Both", "Either way — handy when the stall gets busy."],
                ] as [PayMode, string, string][]
              ).map(([value, label, note]) => (
                <Choice key={value} on={draft.payMode === value} onClick={() => set({ payMode: value })} label={label} note={note} />
              ))}
            </div>
            {/* Folds shut for staff-only, rather than vanishing. */}
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
              style={{ gridTemplateRows: draft.payMode === "staff" ? "0fr" : "1fr", opacity: draft.payMode === "staff" ? 0 : 1 }}
              inert={draft.payMode === "staff"}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="mt-4 border-t border-line pt-4 text-sm font-extrabold">QR codes for self-service</p>
                <div className="mt-2 grid grid-cols-2 gap-3 max-md:grid-cols-1">
                  {(
                    [
                      ["product", "One QR per product", "A sign beside each box; every scan adds to one basket."],
                      ["stall", "One QR for the stall", "Opens a small shop with everything on the table."],
                    ] as [QrMode, string, string][]
                  ).map(([value, label, note]) => (
                    <Choice key={value} on={draft.qrMode === value} onClick={() => set({ qrMode: value })} label={label} note={note} />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* 3 · What's for sale */}
          <Card
            n={3}
            title="What's for sale"
            action={
              <Tip label="Count how many boxes of each you bring, and see what is left as you sell">
                <button
                  type="button"
                  aria-pressed={draft.countStock}
                  onClick={() => set({ countStock: !draft.countStock })}
                  className="flex items-center gap-2 text-sm font-bold"
                >
                  Count stock <Switch on={draft.countStock} />
                </button>
              </Tip>
            }
          >
            {draft.products.length > 0 && (
              <div className="grid grid-cols-[28px_minmax(0,1fr)_110px_100px_40px] gap-3 border-b border-line px-1 pb-2 text-xs font-bold text-ink-soft max-md:hidden">
                <span />
                <span>Product (preset)</span>
                <span>Price here</span>
                <span className="transition-opacity" style={{ opacity: draft.countStock ? 1 : 0 }}>
                  Bringing
                </span>
                <span />
              </div>
            )}
            <ul className="flex flex-col">
              {draft.products.map((product, index) => {
                const preset = presetById.get(product.presetId);
                return (
                  <li
                    key={product.presetId}
                    className="motion-row grid grid-cols-[28px_minmax(0,1fr)_110px_100px_40px] items-center gap-3 border-b border-line/60 px-1 py-2.5 max-md:grid-cols-[28px_minmax(0,1fr)_40px]"
                  >
                    <Cube color={preset?.color} />
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{preset?.name ?? "A retired preset"}</span>
                      <span className="block text-xs text-ink-soft">
                        {preset ? `${preset.units} units` : ""}
                        {preset?.usualPrice ? ` · usual ${currency(preset.usualPrice)}` : ""}
                      </span>
                    </span>
                    <label className="max-md:col-span-2 max-md:col-start-2 max-md:row-start-2">
                      <span className="sr-only">Price here</span>
                      <span className={`${BOX} px-2.5`}>
                        <span className="text-ink-soft">₪</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          data-money
                          value={product.price || ""}
                          placeholder="0"
                          onChange={(e) => setProduct(index, { price: Number(e.target.value) || 0 })}
                          className="w-full min-w-0 bg-transparent text-[15px] font-bold outline-none"
                        />
                      </span>
                    </label>
                    <label
                      className="transition-opacity max-md:col-start-2 max-md:row-start-3"
                      style={{ opacity: draft.countStock ? 1 : 0 }}
                      inert={!draft.countStock}
                    >
                      <span className="sr-only">Boxes brought</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={product.brought ?? ""}
                        placeholder="Boxes"
                        onChange={(e) => setProduct(index, { brought: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })}
                        className={INPUT}
                      />
                    </label>
                    <Tip label="Take it off the table">
                      <button
                        type="button"
                        onClick={() => removeProduct(index)}
                        aria-label={`Remove ${preset?.name ?? "product"}`}
                        className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-band hover:text-ink max-md:col-start-3 max-md:row-start-1"
                      >
                        <X size={16} />
                      </button>
                    </Tip>
                  </li>
                );
              })}
            </ul>
            {unused.length > 0 ? (
              <label className="mt-3 flex min-w-0 items-center gap-2">
                <Plus size={16} className="shrink-0 text-accent" aria-hidden />
                <select
                  value=""
                  onChange={(e) => e.target.value && addProduct(Number(e.target.value))}
                  className="h-10 w-full max-w-md min-w-0 rounded-xl border border-line bg-card px-3 text-sm font-bold text-accent"
                >
                  <option value="">Add a product from your presets…</option>
                  {unused.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.units} units{p.usualPrice ? ` · ${currency(p.usualPrice)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              presets.length === 0 && (
                <p className="mt-2 text-sm text-ink-soft">
                  No presets yet — make the boxes you sell in Settings → Flavors → Presets first.
                </p>
              )
            )}
          </Card>

          {/* 4 · Deals */}
          <Card n={4} title="Deals">
            <ul className="flex flex-col gap-2">
              {draft.deals.map((deal, index) => (
                <li key={index} className="motion-row rounded-2xl bg-tile-peach p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 font-extrabold">{dealLabel(deal)}</span>
                    <Tip label="Remove this deal">
                      <button
                        type="button"
                        onClick={() => set({ deals: draft.deals.filter((_, i) => i !== index) })}
                        aria-label="Remove deal"
                        className="press flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10"
                      >
                        <X size={15} />
                      </button>
                    </Tip>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {deal.kind !== "price" && (
                      <NumberField
                        label={deal.kind === "free" ? "Buy" : deal.kind === "bundle" ? "Boxes" : "From boxes"}
                        value={deal.minQty}
                        onChange={(minQty) => setDeal(index, { minQty: Math.max(1, Math.round(minQty)) })}
                      />
                    )}
                    {(deal.kind === "bundle" || deal.kind === "price") && (
                      <NumberField
                        label={deal.kind === "bundle" ? "For ₪" : "Price ₪"}
                        value={deal.price ?? 0}
                        onChange={(price) => setDeal(index, { price })}
                        money
                      />
                    )}
                    {deal.kind === "percent" && (
                      <NumberField label="% off" value={deal.percent ?? 0} onChange={(percent) => setDeal(index, { percent })} />
                    )}
                  </div>
                  {draft.products.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-ink/70">Counts:</span>
                      <DealChip on={deal.presetIds.length === 0} onClick={() => setDeal(index, { presetIds: [] })}>
                        Everything
                      </DealChip>
                      {draft.products.map((p) => {
                        const on = deal.presetIds.includes(p.presetId);
                        return (
                          <DealChip
                            key={p.presetId}
                            on={on}
                            onClick={() =>
                              setDeal(index, {
                                presetIds: on ? deal.presetIds.filter((id) => id !== p.presetId) : [...deal.presetIds, p.presetId],
                              })
                            }
                          >
                            {presetById.get(p.presetId)?.name ?? "Retired"}
                          </DealChip>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line bg-cream/60 px-3.5 py-3">
              <span className="text-sm font-extrabold">New deal:</span>
              {DEAL_KINDS.map((kind) => (
                <Tip key={kind} label={DEAL_HELP[kind]}>
                  <button
                    type="button"
                    onClick={() => addDeal(kind)}
                    className="press h-9 rounded-full border border-line bg-card px-3.5 text-sm font-bold"
                  >
                    {DEAL_NAMES[kind]}
                  </button>
                </Tip>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              When more than one deal fits a basket, the one that saves the customer most applies — never two at once.
            </p>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="rounded-card border border-line bg-card p-5">
            <p className="text-xs font-extrabold tracking-[0.12em] uppercase">Ready to sell?</p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2.5 text-sm font-semibold">
                  <span
                    className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-white transition-colors ${
                      check.ok ? "bg-accent" : "bg-[#cdbfb5]"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  {check.label}
                </li>
              ))}
            </ul>
          </div>
          <OnTheDay eventId={eventId} />
        </aside>
      </div>
    </div>
  );
}

const BOX = "flex h-11 items-center rounded-xl border border-line bg-[#FBF7F4] focus-within:border-accent";
const INPUT =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-[#FBF7F4] px-3 text-[15px] font-semibold outline-none focus:border-accent";

const DEAL_NAMES: Record<DealKind, string> = {
  bundle: "N for ₪X",
  percent: "% off from N",
  free: "Buy N, get 1 free",
  price: "Special price",
};

const DEAL_HELP: Record<DealKind, string> = {
  bundle: "A number of boxes for one price — e.g. any 3 boxes for ₪100",
  percent: "A percent off once the basket has enough boxes — e.g. 10% off from 5",
  free: "Buy a number, the next is free — e.g. 4 + 1; the cheapest box is the free one",
  price: "A fixed price for chosen products today, without changing their usual price",
};

function Card({ n, title, action, children }: { n: number; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-card p-6 max-md:p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">
          <span className="mr-2 text-ink-soft">{n}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

/** Half-hour steps from 06:00 to 23:30, behind a clock — the owner's ask. */
const HOURS = Array.from({ length: 36 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function TimeSelect({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const options = value && !HOURS.includes(value) ? [value, ...HOURS] : HOURS;
  return (
    <Field label={label}>
      <span className={`${BOX} relative`}>
        <Clock size={16} className="pointer-events-none absolute left-3 text-ink-soft" aria-hidden />
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-full w-full cursor-pointer appearance-none bg-transparent pr-3 pl-9 text-[15px] font-semibold outline-none"
        >
          <option value="">—</option>
          {options.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </span>
    </Field>
  );
}

function Choice({ on, onClick, label, note }: { on: boolean; onClick: () => void; label: string; note: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      // No grow-on-hover here: a card this wide grows past the folding
      // box around it, which clips its edge. It answers by its border.
      className={`rounded-2xl border-2 px-4 py-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${
        on ? "border-black bg-card" : "border-line bg-[#FBF7F4] hover:border-ink/40"
      }`}
    >
      <span className="block font-extrabold">{label}</span>
      <span className="mt-1 block text-sm text-ink-soft">{note}</span>
    </button>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block h-[22px] w-[38px] rounded-full transition-colors ${on ? "bg-accent" : "bg-[#cdbfb5]"}`}>
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-[left] duration-200 ease-out"
        style={{ left: on ? 19 : 3 }}
      />
    </span>
  );
}

function Cube({ color }: { color?: { g: string; b: string; s: string } }) {
  return (
    <span
      aria-hidden
      className="jelly-cube block h-6 w-6 rounded-[5px]"
      style={{ ["--g" as string]: color?.g ?? "#efe6df", ["--b" as string]: color?.b ?? "#d9cbc1", ["--s" as string]: color?.s ?? "#b9a89c" }}
    />
  );
}

function NumberField({ label, value, onChange, money = false }: { label: string; value: number; onChange: (v: number) => void; money?: boolean }) {
  return (
    <label className="flex items-center gap-1.5">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={value || ""}
        placeholder="0"
        data-money={money || undefined}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-9 w-20 rounded-lg border border-black/15 bg-white/70 px-2 font-bold outline-none focus:border-accent"
      />
    </label>
  );
}

function DealChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-7 rounded-full px-2.5 text-xs font-bold transition-colors ${on ? "bg-ink text-cream" : "bg-white/60 text-ink"}`}
    >
      {children}
    </button>
  );
}

/**
 * The register's way in: a button, and a QR of the register's address for
 * the seller to scan with their phone — the canvas's "On the day" card.
 * Only once the event is saved, since the register needs its id.
 */
function OnTheDay({ eventId }: { eventId: number | null }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (eventId === null) return;
    let live = true;
    QRCode.toDataURL(`${window.location.origin}/events/${eventId}/register`, {
      margin: 1,
      width: 300,
      color: { dark: "#2A2520", light: "#FFFFFF" },
    }).then((data) => live && setQr(data));
    return () => {
      live = false;
    };
  }, [eventId]);
  return (
    <div className="rounded-card bg-black p-5 text-cream">
      <p className="font-extrabold">On the day</p>
      {eventId === null ? (
        <p className="mt-1.5 text-sm leading-relaxed text-cream/75">Save the event first — then the register opens from here.</p>
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-cream/75">
            The seller scans this with their phone to open the register for this event.
          </p>
          {qr && (
            // A data URL, so there is nothing for next/image to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code that opens the register" className="mx-auto mt-3 h-36 w-36 rounded-xl bg-white p-2" />
          )}
          <Link
            href={`/events/${eventId}/register`}
            className="press mt-3 flex h-11 items-center justify-center rounded-full bg-cream font-extrabold text-black"
          >
            Open the register
          </Link>
        </>
      )}
    </div>
  );
}
