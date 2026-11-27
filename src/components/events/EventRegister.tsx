"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, Minus } from "lucide-react";
import { JellyHop } from "@/components/JellyLoader";
import { notify } from "@/components/Notices";
import { sendWrite } from "@/components/saveError";
import type { PresetSummary } from "@/lib/eventPresets";
import { dealLabel, priceBasket, type SaleEvent } from "@/lib/eventTypes";

type Tally = { available: boolean; sales: number; takings: number; sold: Record<number, number> };
type Lang = "en" | "he";

/**
 * The register (v0.101): the seller's phone at the stall, laid out as the
 * canvas drew it. A tile per box on the table — a tap adds one, the small
 * minus takes one off — and a black bar with the basket, the deal that
 * applies (`priceBasket`, the same arithmetic the server uses to charge)
 * and the total, over Cash and Charge.
 *
 * **Charge** asks the server to ring the sale up and make a payment link,
 * then turns the phone to the customer: the amount and a big QR of the
 * link. It polls the sale's state in our own database every couple of
 * seconds — no SUMIT call — and turns green the moment the customer's
 * payment is confirmed. **Cash** records the sale paid on the spot.
 *
 * Hebrew or English, by the switch at the top — remembered on this phone.
 */
export function EventRegister({ event, tally, presets }: { event: SaleEvent; tally: Tally; presets: PresetSummary[] }) {
  const router = useRouter();
  const lang = useLang();
  const t = COPY[lang];
  const presetById = new Map(presets.map((p) => [p.id, p]));
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<"card" | "cash" | null>(null);
  const [charging, setCharging] = useState<{ id: number; total: number; payUrl: string } | null>(null);
  const [paid, setPaid] = useState<{ total: number; method: "card" | "cash"; lines: string[]; deal: string } | null>(null);

  const lines = event.products
    .filter((p) => (counts[p.presetId] ?? 0) > 0)
    .map((p) => ({ presetId: p.presetId, qty: counts[p.presetId], unitPrice: p.price }));
  const priced = priceBasket(lines, event.deals);
  const deal = priced.deal === null ? "" : dealLabel(event.deals[priced.deal]);
  const name = (presetId: number) => presetById.get(presetId)?.name ?? "—";
  const summary = lines.map((l) => `${l.qty} × ${name(l.presetId)}`);

  const add = (presetId: number, by: number) =>
    setCounts((c) => ({ ...c, [presetId]: Math.max(0, (c[presetId] ?? 0) + by) }));

  const ring = async (method: "card" | "cash") => {
    if (lines.length === 0) return;
    setBusy(method);
    const { response, error } = await sendWrite("sale", `/api/events/${event.id}/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, items: lines.map((l) => ({ presetId: l.presetId, qty: l.qty })) }),
    });
    setBusy(null);
    if (error || !response) {
      notify(error?.replace(/^Couldn't save this sale: /, "") ?? "Something went wrong.");
      return;
    }
    const sale = (await response.json()) as { id: number; total: number; status: string; payUrl: string | null };
    if (method === "cash" || !sale.payUrl) {
      setPaid({ total: sale.total, method: "cash", lines: summary, deal });
    } else {
      setCharging({ id: sale.id, total: sale.total, payUrl: sale.payUrl });
    }
  };

  const next = () => {
    setPaid(null);
    setCounts({});
    router.refresh();
  };

  if (paid) {
    return <PaidScreen t={t} paid={paid} saleNo={tally.sales + 1} onNext={next} />;
  }
  if (charging) {
    return (
      <ChargeScreen
        t={t}
        charging={charging}
        summary={summary}
        deal={deal}
        onPaid={(method) => {
          setCharging(null);
          setPaid({ total: charging.total, method, lines: summary, deal });
        }}
        onBack={() => setCharging(null)}
      />
    );
  }

  return (
    <div dir={lang === "he" ? "rtl" : "ltr"} className="motion-rise mx-auto flex min-h-[calc(100dvh-9rem)] max-w-md flex-col">
      <div dir="ltr" className="flex items-center justify-between gap-3">
        <Link href={`/events/${event.id}`} className="text-sm font-bold text-accent">
          ← {lang === "he" ? "הגדרות" : "Setup"}
        </Link>
        <LangSwitch lang={lang} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink-soft">{event.name}</p>
          <h1 className="font-display text-[26px] leading-tight font-extrabold">
            {t.sale}
            {tally.sales + 1}
          </h1>
        </div>
        <div className="text-end">
          <p className="text-xs font-bold text-ink-soft">{t.tonight}</p>
          <p className="font-display text-[22px] font-extrabold" dir="ltr">
            ₪{tally.takings.toLocaleString("en-US")}
          </p>
        </div>
      </div>

      {!tally.available && (
        <p className="mt-3 rounded-xl bg-tile-peach px-3 py-2 text-xs font-semibold">
          Run scripts/migrate-041-event-sales.sql in the database first.
        </p>
      )}
      {event.products.length === 0 && (
        <p className="mt-6 rounded-card border border-line bg-card p-6 text-center text-sm text-ink-soft">{t.noProducts}</p>
      )}

      <div className="motion-stagger mt-4 grid grid-cols-2 gap-3">
        {event.products.map((product) => {
          const preset = presetById.get(product.presetId);
          const count = counts[product.presetId] ?? 0;
          const left = product.brought === null ? null : product.brought - (tally.sold[product.presetId] ?? 0) - count;
          return (
            <div key={product.presetId} className="relative">
              <button
                type="button"
                onClick={() => add(product.presetId, 1)}
                aria-label={`${t.add} ${preset?.name ?? ""}`}
                className={`tap flex h-36 w-full flex-col justify-between rounded-[20px] border-2 bg-card p-3.5 text-start transition-[border-color,transform] duration-150 active:scale-[0.96] ${
                  count > 0 ? "border-black" : "border-line"
                }`}
              >
                <span className="grid w-fit grid-cols-3 gap-[3px]" aria-hidden>
                  {Array.from({ length: 6 }, (_, i) => (
                    <span
                      key={i}
                      className="jelly-cube block h-[11px] w-[11px] rounded-[2px]"
                      style={{ ["--g" as string]: preset?.color.g, ["--b" as string]: preset?.color.b, ["--s" as string]: preset?.color.s }}
                    />
                  ))}
                </span>
                <span className="block">
                  <span className="block truncate text-base font-extrabold">{preset?.name ?? "—"}</span>
                  <span className="mt-0.5 flex justify-between text-[13px] font-semibold text-ink-soft">
                    <span dir="ltr">₪{product.price.toLocaleString("en-US")}</span>
                    {left !== null && (
                      <span className={left <= 0 ? "text-due" : ""}>
                        {left} {t.left}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <span
                aria-hidden
                className="pointer-events-none absolute top-2.5 end-2.5 flex h-8 min-w-8 items-center justify-center rounded-full bg-black px-2 text-base font-extrabold text-cream transition-[transform,opacity] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]"
                style={{ transform: count > 0 ? "scale(1)" : "scale(0.3)", opacity: count > 0 ? 1 : 0 }}
              >
                {count || 1}
              </span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => add(product.presetId, -1)}
                  aria-label={`${t.less} ${preset?.name ?? ""}`}
                  className="motion-pop absolute top-2 end-12 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-cream text-ink"
                >
                  <Minus size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="sticky bottom-24 mt-5 rounded-[24px] bg-black p-4.5 text-cream md:bottom-4">
        <div className="flex justify-between gap-3 text-sm font-semibold text-cream/75">
          <span className="min-w-0 truncate">{summary.length ? summary.join(" · ") : t.empty}</span>
          <span dir="ltr">₪{priced.subtotal.toLocaleString("en-US")}</span>
        </div>
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{ gridTemplateRows: priced.discount > 0 ? "1fr" : "0fr", opacity: priced.discount > 0 ? 1 : 0 }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center justify-between pt-2 text-sm font-bold">
              <span className="rounded-full bg-tile-peach px-2.5 py-0.5 text-xs text-ink">{deal}</span>
              <span dir="ltr">−₪{priced.discount.toLocaleString("en-US")}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-cream/20 pt-3">
          <span className="text-[15px] font-bold">{t.toPay}</span>
          <span className="font-display text-4xl font-extrabold" dir="ltr">
            ₪{priced.total.toLocaleString("en-US")}
          </span>
        </div>
        <div className="mt-3.5 grid grid-cols-[1fr_2fr] gap-2">
          <button
            type="button"
            disabled={lines.length === 0 || busy !== null}
            onClick={() => ring("cash")}
            className="press h-13 rounded-full border border-cream/35 font-bold disabled:opacity-40"
          >
            {busy === "cash" ? <JellyHop /> : t.cash}
          </button>
          <button
            type="button"
            disabled={lines.length === 0 || busy !== null}
            onClick={() => ring("card")}
            className="press flex h-13 items-center justify-center gap-1.5 rounded-full bg-cream font-extrabold text-black disabled:opacity-40"
          >
            {busy === "card" ? (
              <JellyHop />
            ) : (
              <>
                {t.charge} <span dir="ltr">₪{priced.total.toLocaleString("en-US")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChargeScreen({
  t,
  charging,
  summary,
  deal,
  onPaid,
  onBack,
}: {
  t: (typeof COPY)[Lang];
  charging: { id: number; total: number; payUrl: string };
  summary: string[];
  deal: string;
  onPaid: (method: "card" | "cash") => void;
  onBack: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(charging.payUrl, { margin: 1, width: 560, color: { dark: "#2A2520", light: "#FFFFFF" } }).then(
      (data) => live && setQr(data),
    );
    return () => {
      live = false;
    };
  }, [charging.payUrl]);

  // Our own database, every 2.5s — the return page and the checks write it.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/event-sales/${charging.id}`);
        if (!response.ok) return;
        const { status } = (await response.json()) as { status: string };
        if (status === "paid") onPaid("card");
      } catch {
        // A dropped connection at a market is ordinary; the next tick retries.
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [charging.id, onPaid]);

  const settle = async (action: "cancel" | "cash") => {
    const { response, error } = await sendWrite("sale", `/api/event-sales/${charging.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (error || !response) {
      notify(error ?? "Something went wrong.");
      return;
    }
    const { status } = (await response.json()) as { status: string };
    if (status === "paid") onPaid(action === "cash" ? "cash" : "card");
    else onBack();
  };

  return (
    <div className="motion-rise fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-black px-6 pt-10 pb-8 text-cream">
      <p className="text-[17px] font-bold text-cream/80">{t.scan}</p>
      <p className="font-display mt-2 text-6xl leading-none font-extrabold" dir="ltr">
        ₪{charging.total.toLocaleString("en-US")}
      </p>
      <p className="mt-2 text-center text-[13px] font-semibold text-cream/65">
        {summary.join(" · ")}
        {deal ? ` · ${deal}` : ""}
      </p>
      <div className="mt-6 rounded-[28px] bg-white p-4">
        {qr ? (
          // A data URL, so there is nothing for next/image to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code to pay" className="h-64 w-64" />
        ) : (
          <div className="flex h-64 w-64 items-center justify-center text-ink">
            <JellyHop />
          </div>
        )}
      </div>
      <p className="mt-5 flex items-center gap-2.5 text-[15px] font-bold">
        <span className="text-tile-peach">
          <JellyHop size={7} label={t.waiting} />
        </span>
        {t.waiting}
      </p>
      <p className="mt-1 text-xs font-semibold text-cream/60">{t.auto}</p>
      <div className="flex-1" />
      <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-2">
        <button type="button" onClick={() => settle("cash")} className="press h-12 rounded-full border border-cream/30 font-bold">
          {t.cashInstead}
        </button>
        <button type="button" onClick={() => settle("cancel")} className="press h-12 rounded-full border border-cream/30 font-bold">
          {t.cancel}
        </button>
      </div>
    </div>
  );
}

function PaidScreen({
  t,
  paid,
  saleNo,
  onNext,
}: {
  t: (typeof COPY)[Lang];
  paid: { total: number; method: "card" | "cash"; lines: string[]; deal: string };
  saleNo: number;
  onNext: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-accent px-6 pt-14 pb-8 text-white">
      <span className="motion-pop flex h-24 w-24 items-center justify-center rounded-full bg-white text-accent">
        <Check size={52} strokeWidth={2.6} aria-hidden />
      </span>
      <h1 className="font-display motion-rise mt-6 text-4xl font-extrabold">
        {t.paid} <span dir="ltr">₪{paid.total.toLocaleString("en-US")}</span>
      </h1>
      <p className="mt-2 text-[15px] font-semibold text-white/85">
        {t.sale}
        {saleNo} · {paid.method === "cash" ? t.cash : t.card}
      </p>
      <div className="motion-stagger mt-8 w-full max-w-sm rounded-[20px] bg-white/12 p-4 text-[15px] font-semibold">
        {paid.lines.map((line) => (
          <p key={line} className="py-1">
            {line}
          </p>
        ))}
        {paid.deal && <p className="py-1 text-white/85">{paid.deal}</p>}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onNext}
        className="press mt-8 h-14 w-full max-w-sm rounded-full bg-white text-[17px] font-extrabold text-ink"
      >
        {t.next}
      </button>
    </div>
  );
}

function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div role="group" aria-label="Language" className="relative flex rounded-full bg-band p-[3px]">
      <span
        aria-hidden
        className="absolute top-[3px] bottom-[3px] w-11 rounded-full bg-card shadow-sm transition-[left] duration-200 ease-out"
        style={{ left: lang === "he" ? 3 : 47 }}
      />
      {(["he", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className="relative h-8 w-11 rounded-full text-sm font-bold"
        >
          {code === "he" ? "עב" : "EN"}
        </button>
      ))}
    </div>
  );
}

/* The register's language, remembered on this phone (a per-viewer convenience). */
const LANG_KEY = "jimgem:register-lang";
const listeners = new Set<() => void>();
function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "he" ? "he" : "en";
  } catch {
    return "en";
  }
}
function setLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Private mode: the switch still works for this visit.
  }
  memo = lang;
  listeners.forEach((l) => l());
}
let memo: Lang | null = null;
function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => memo ?? (memo = readLang()),
    () => "en",
  );
}

const COPY = {
  en: {
    sale: "Sale #",
    tonight: "Tonight so far",
    noProducts: "Nothing on the table yet — add products in the event's setup.",
    add: "Add one",
    less: "One less",
    left: "left",
    empty: "Tap a box to add it",
    toPay: "To pay",
    cash: "Cash",
    card: "Card",
    charge: "Charge",
    scan: "Scan with your camera to pay",
    waiting: "Waiting for the payment…",
    auto: "Turns green by itself once SUMIT confirms",
    cashInstead: "Paid cash instead",
    cancel: "Cancel",
    paid: "Paid",
    next: "Next customer",
  },
  he: {
    sale: "עסקה #",
    tonight: "הערב עד עכשיו",
    noProducts: "עוד אין מוצרים על השולחן — מוסיפים אותם בהגדרות האירוע.",
    add: "להוסיף",
    less: "אחד פחות",
    left: "נשארו",
    empty: "לחיצה על קופסה מוסיפה אותה",
    toPay: "לתשלום",
    cash: "מזומן",
    card: "אשראי",
    charge: "לחיוב",
    scan: "סרקו עם המצלמה כדי לשלם",
    waiting: "מחכים לתשלום…",
    auto: "המסך יהפוך לירוק לבד כש-SUMIT תאשר",
    cashInstead: "שולם במזומן",
    cancel: "ביטול",
    paid: "שולם",
    next: "ללקוח הבא",
  },
} as const;
