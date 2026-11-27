"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Lock, Minus, Plus } from "lucide-react";
import { JellyHop } from "@/components/JellyLoader";
import { payCopy, type PayLang } from "@/app/pay/copy";
import { dealLabel, priceBasket, type EventDeal } from "@/lib/eventTypes";

export interface ShopProduct {
  presetId: number;
  name: string;
  units: number;
  price: number;
  color: { g: string; b: string; s: string };
  /** Boxes still on the table, where stock is counted; null where it isn't. */
  left: number | null;
}

const shekels = (n: number) =>
  `₪${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

const storageKey = (token: string) => `gems:shop:${token}`;

function readBasket(token: string): Record<number, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(token)) ?? "{}") as Record<string, unknown>;
    const out: Record<number, number> = {};
    for (const [id, qty] of Object.entries(raw)) {
      if (/^\d+$/.test(id) && Number.isInteger(qty) && (qty as number) > 0) out[Number(id)] = Math.min(99, qty as number);
    }
    return out;
  } catch {
    return {};
  }
}

function writeBasket(token: string, counts: Record<number, number>) {
  try {
    localStorage.setItem(storageKey(token), JSON.stringify(counts));
  } catch {
    // A private window: the basket simply lasts as long as the page.
  }
}

/**
 * The customer's basket at a stall (v0.102), as the canvas drew it. It is
 * kept on the phone (`localStorage`, per event) so scanning the next box's
 * QR — a fresh page load — adds to the same basket. A product QR arrives
 * as `?add=<preset>`: one box goes in, a banner says so, and the query is
 * dropped from the address so a reload cannot add it twice.
 *
 * The total is worked out here with the same `priceBasket` the server
 * charges by, so what the button says is what the payment page asks.
 */
export function ShopClient({
  token,
  lang,
  eventName,
  products,
  deals,
}: {
  token: string;
  lang: PayLang;
  eventName: string;
  products: ShopProduct[];
  deals: EventDeal[];
}) {
  const t = payCopy(lang);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // The basket is on the phone, so it can only be read once the page is
  // in the browser; the server renders it empty.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const basket = readBasket(token);
    const url = new URL(window.location.href);
    const add = Number(url.searchParams.get("add"));
    const product = products.find((p) => p.presetId === add);
    if (product && (product.left === null || (basket[add] ?? 0) < product.left)) {
      basket[add] = (basket[add] ?? 0) + 1;
      writeBasket(token, basket);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAdded(product.name);
    }
    if (url.searchParams.has("add")) {
      url.searchParams.delete("add");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    setCounts(basket);
  }, [token, products]);

  const change = (product: ShopProduct, by: number) => {
    setCounts((c) => {
      const cap = product.left ?? 99;
      const qty = Math.max(0, Math.min(cap, (c[product.presetId] ?? 0) + by));
      const next = { ...c, [product.presetId]: qty };
      if (qty === 0) delete next[product.presetId];
      writeBasket(token, next);
      return next;
    });
    setError(null);
  };

  const lines = products
    .filter((p) => (counts[p.presetId] ?? 0) > 0)
    .map((p) => ({ presetId: p.presetId, qty: counts[p.presetId], unitPrice: p.price }));
  const priced = priceBasket(lines, deals);
  const deal = priced.deal === null ? null : dealLabel(deals[priced.deal], lang);

  const pay = async () => {
    if (lines.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/shop/${token}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines.map((l) => ({ presetId: l.presetId, qty: l.qty })) }),
      });
      const body = (await response.json().catch(() => ({}))) as { payUrl?: string; error?: string };
      if (!response.ok || !body.payUrl) throw new Error(body.error ?? "");
      writeBasket(token, {});
      window.location.assign(body.payUrl);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.unavailable);
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        className="grid transition-[grid-template-rows,opacity,margin] duration-300 ease-(--ease-entrance)"
        style={{ gridTemplateRows: added ? "1fr" : "0fr", opacity: added ? 1 : 0, marginBottom: added ? 16 : 0 }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`flex items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-cream ${added ? "motion-pop" : ""}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream/20">
              <Check size={18} strokeWidth={2.5} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-bold">{added ? t.addedTitle(added) : ""}</p>
              <p className="text-sm opacity-85">{t.addedSub}</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm font-semibold text-ink-soft">{eventName}</p>
      <h1 className="font-display mt-0.5 text-[26px] leading-tight font-extrabold">{t.basket}</h1>
      <p className="mt-1 text-sm text-ink-soft">{t.shopIntro}</p>

      {deals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t.deals}>
          {deals.map((d, i) => (
            <span key={i} className="rounded-full bg-band px-3 py-1 text-xs font-bold" dir="auto">
              {dealLabel(d, lang)}
            </span>
          ))}
        </div>
      )}

      <ul className="motion-stagger mt-4 flex flex-col gap-2">
        {products.map((p) => {
          const qty = counts[p.presetId] ?? 0;
          const soldOut = p.left !== null && p.left <= 0;
          const full = p.left !== null && qty >= p.left;
          return (
            <li
              key={p.presetId}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                qty > 0 ? "border-ink/25 bg-card" : "border-line bg-cream/60"
              } ${soldOut && qty === 0 ? "opacity-60" : ""}`}
            >
              <span
                className="jelly-cube h-10 w-10 shrink-0 rounded-[6px]"
                style={{ "--g": p.color.g, "--b": p.color.b, "--s": p.color.s } as CSSProperties}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{p.name}</span>
                <span className="block text-sm text-ink-soft">
                  <span dir="ltr">{shekels(p.price)}</span>
                  {p.left !== null && <> · {soldOut ? t.soldOut : t.left(p.left)}</>}
                </span>
              </span>
              {qty === 0 ? (
                <button
                  type="button"
                  disabled={soldOut}
                  onClick={() => change(p, 1)}
                  className="press flex h-10 items-center gap-1 rounded-full bg-black px-4 text-sm font-bold text-cream disabled:bg-ink/30"
                >
                  <Plus size={15} strokeWidth={2.5} aria-hidden />
                  {t.add}
                </button>
              ) : (
                <span className="flex items-center gap-1" dir="ltr">
                  <button
                    type="button"
                    onClick={() => change(p, -1)}
                    aria-label={`${t.less} — ${p.name}`}
                    className="press flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card"
                  >
                    <Minus size={16} strokeWidth={2.5} aria-hidden />
                  </button>
                  <span className="w-7 text-center text-lg font-extrabold tabular-nums">{qty}</span>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => change(p, 1)}
                    aria-label={`${t.more} — ${p.name}`}
                    className="press flex h-10 w-10 items-center justify-center rounded-full bg-black text-cream disabled:bg-ink/30"
                  >
                    <Plus size={16} strokeWidth={2.5} aria-hidden />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-(--ease-entrance)"
        style={{ gridTemplateRows: deal ? "1fr" : "0fr", opacity: deal ? 1 : 0 }}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="mt-4 flex items-center justify-between rounded-2xl bg-band px-4 py-2.5 text-sm font-bold">
            <span>
              {t.dealApplied} · <span dir="auto">{deal ?? ""}</span>
            </span>
            <span dir="ltr">−{shekels(priced.discount)}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        {lines.length === 0 ? (
          <p className="text-center text-sm text-ink-soft">{t.emptyBasket}</p>
        ) : (
          <p className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-ink-soft">{t.total}</span>
            <span className="font-display text-3xl font-extrabold tabular-nums" dir="ltr">
              {shekels(priced.total)}
            </span>
          </p>
        )}
        {error && <p className="mt-3 rounded-2xl bg-band px-4 py-3 text-sm">{error}</p>}
        <button
          type="button"
          onClick={pay}
          disabled={lines.length === 0 || busy}
          className="press mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black text-[17px] font-bold text-cream disabled:bg-ink/30"
        >
          {busy ? (
            <JellyHop />
          ) : (
            <>
              <Lock size={17} aria-hidden />
              {t.payTotal}
              {lines.length > 0 && <span dir="ltr">{shekels(priced.total)}</span>}
            </>
          )}
        </button>
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-soft">{t.afterPay}</p>
      </div>
    </div>
  );
}
