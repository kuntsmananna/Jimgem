"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Copy, ExternalLink, Mail, MessageCircle, RefreshCw, Link2, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { JellyHop } from "@/components/JellyLoader";
import { whenText } from "@/components/LastEdited";
import { sendWrite } from "@/components/saveError";
import { notify } from "@/components/Notices";
import { currency } from "@/lib/money";
import { formatOrderDate, orderTotal, stillDue, PAYMENT_STATUS_LABEL, type Order, type PaymentStatus } from "@/lib/orderTypes";
import type { Client } from "@/lib/clients";
import {
  DEFAULT_DEPOSIT_PERCENT,
  PAYMENT_LINK_KIND_LABEL,
  paymentMessage,
  suggestedAmount,
  whatsappNumber,
  type PaymentLink,
  type PaymentLinkKind,
} from "@/lib/paymentLinkTypes";

type LinkWithUrl = PaymentLink & { url: string };

/**
 * Making and sending a SUMIT payment link for one order (v0.99).
 *
 * The amount is worked out from the order **as saved** — the deposit at
 * the owner's usual half, the balance from what is still due, or the whole
 * thing — and can be typed over. Making a link is one SUMIT call; the link
 * is then sent by WhatsApp or email with a ready message, copied, or shown
 * as a QR code for a customer standing in front of you. Every link the
 * order has had is listed under it, with Check (asks SUMIT whether it was
 * paid, for a customer who paid and never came back to the page) and
 * Cancel.
 */
export function PaymentLinkModal({
  order,
  client,
  onClose,
}: {
  order: Order;
  client: Client | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const total = orderTotal(order);
  const due = stillDue(order);
  const nothingPaid = order.deposit <= 0 && order.paymentStatus !== "paid";

  const [kind, setKind] = useState<PaymentLinkKind>(nothingPaid ? "deposit" : "balance");
  const [percent, setPercent] = useState(DEFAULT_DEPOSIT_PERCENT);
  const [amount, setAmount] = useState(() => suggestedAmount(order, nothingPaid ? "deposit" : "balance"));
  const [busy, setBusy] = useState(false);
  const paidShare = total > 0 ? Math.min(100, Math.max(0, (order.deposit / total) * 100)) : 0;
  const [error, setError] = useState<string | null>(null);

  const [links, setLinks] = useState<LinkWithUrl[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [shown, setShown] = useState<LinkWithUrl | null>(null);

  const fetchLinks = useCallback(
    () =>
      fetch(`/api/payment-links?orderId=${order.key}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((body: { available: boolean; links: LinkWithUrl[] }) => body)
        .catch(() => ({ available: true, links: [] as LinkWithUrl[] })),
    [order.key],
  );
  const load = useCallback(
    () =>
      fetchLinks().then((body) => {
        setAvailable(body.available);
        setLinks(body.links);
      }),
    [fetchLinks],
  );

  useEffect(() => {
    let live = true;
    fetchLinks().then((body) => {
      if (!live) return;
      setAvailable(body.available);
      setLinks(body.links);
    });
    return () => {
      live = false;
    };
  }, [fetchLinks]);

  const choose = (next: PaymentLinkKind) => {
    setKind(next);
    setError(null);
    if (next !== "custom") setAmount(suggestedAmount(order, next, percent));
  };

  /** What the chosen tab means, under the figure, in words. */
  const hint =
    kind === "deposit"
      ? `${percent}% of the order total, in whole shekels`
      : kind === "balance"
        ? "Everything still due on the order"
        : kind === "full"
          ? "The whole order, regardless of what was paid"
          : "Type any amount, incl. VAT";

  const create = async () => {
    setError(null);
    if (!(amount > 0)) {
      setError("The amount has to be more than ₪0.");
      return;
    }
    setBusy(true);
    const { response, error: refused } = await sendWrite("payment link", "/api/payment-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: Number(order.key), kind, amount }),
    });
    setBusy(false);
    if (refused || !response) {
      setError(refused?.replace(/^Couldn't save this payment link: /, "") ?? "Something went wrong.");
      return;
    }
    const { link } = (await response.json()) as { link: LinkWithUrl };
    setShown(link);
    void load();
  };

  const act = async (link: LinkWithUrl, action: "check" | "cancel") => {
    const { response, error: refused } = await sendWrite("payment link", `/api/payment-links/${link.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (refused || !response) {
      notify(refused ?? "Something went wrong.");
      return;
    }
    if (action === "check") {
      const { status } = (await response.json()) as { status: string | null };
      if (status === "paid") {
        notify("Paid — the order is updated. Reopen it before editing it.");
        router.refresh();
      } else {
        notify("SUMIT has no payment for this link yet.");
      }
    }
    if (shown?.id === link.id && action === "cancel") setShown(null);
    void load();
  };

  return (
    <Modal title="Payment link" icon={<Link2 size={17} />} onClose={onClose}>
      <div className="fields-lit flex flex-col gap-4 text-sm">
        {!available && (
          <p className="rounded-xl bg-tile-peach px-3 py-2 text-xs font-semibold">
            Run scripts/migrate-039-payment-links.sql in the database first.
          </p>
        )}

        {/*
          Where the order stands, read-only: a tinted box of three figures
          and a bar of how much is paid, apart from the part that asks.
        */}
        <section aria-label="Payment so far" className="rounded-2xl bg-cream px-4 py-3">
          <p className="text-[11px] font-extrabold tracking-[0.14em] text-ink uppercase">Payment so far</p>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <Figure label="Order total" value={currency(total)} />
            <Figure label="Paid" value={currency(order.deposit)} tone="text-accent" />
            <Figure label="Still due" value={currency(due)} tone={due > 0 ? "text-due" : "text-accent"} />
          </dl>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-band" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${paidShare}%` }} />
          </div>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            {PAYMENT_STATUS_LABEL[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
            {total > 0 ? ` · ${Math.round(paidShare)}% paid` : ""}
          </p>
        </section>

        {/*
          What to ask for: the four choices are tabs on the amount's own
          box, so the choice and the figure it produces read as one thing.
        */}
        <section aria-labelledby="ask-heading">
          <h3 id="ask-heading" className="text-[11px] font-extrabold tracking-[0.14em] text-ink uppercase">
            Amount to ask
          </h3>
          <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-card">
            <div role="tablist" aria-label="What the link is for" className="grid grid-cols-4 bg-band/60 p-1">
              {(["full", "deposit", "balance", "custom"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={kind === value}
                  onClick={() => kind !== value && choose(value)}
                  className={`h-9 rounded-xl text-[13px] font-semibold transition max-md:h-11 ${
                    kind === value ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {PAYMENT_LINK_KIND_LABEL[value]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <label className="flex min-w-0 flex-1 items-baseline gap-1">
                <span className="sr-only">Amount, incl. VAT</span>
                <span className="font-display text-2xl font-extrabold text-ink-soft">₪</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  data-money
                  value={amount || ""}
                  placeholder="0"
                  autoFocus={kind === "custom"}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className="keeps-size w-full min-w-0 border-0 bg-transparent p-0 font-display text-[34px] leading-none font-extrabold tabular-nums text-ink outline-none"
                />
              </label>
              {kind === "deposit" && (
                <label className="flex shrink-0 items-center gap-1 rounded-full bg-cream px-3 py-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={percent}
                    aria-label="Deposit percent"
                    onChange={(e) => {
                      const next = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setPercent(next);
                      setAmount(suggestedAmount(order, "deposit", next));
                    }}
                    className="w-10 border-0 bg-transparent p-0 text-right text-base font-bold tabular-nums outline-none"
                  />
                  <span className="font-bold">%</span>
                </label>
              )}
            </div>
            <p className="border-t border-line/60 px-4 py-2 text-xs font-semibold text-ink-soft">{hint}</p>
          </div>
        </section>

        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="press flex h-11 w-full items-center justify-center gap-2 rounded-full bg-black font-semibold text-cream max-md:h-12"
        >
          {busy ? <JellyHop /> : amount > 0 ? `Create link for ${currency(amount)}` : "Create link"}
        </button>
        {error && <p className="text-xs font-semibold text-red-700">{error}</p>}

        {shown && <SharePanel link={shown} order={order} client={client} onDone={() => setShown(null)} />}

        {links && links.length > 0 && (
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-ink uppercase">Links on this order</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {links.map((link) => (
                <li key={link.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {PAYMENT_LINK_KIND_LABEL[link.kind]} · {currency(link.amount)}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {link.status === "paid"
                        ? `Paid ${link.paidAt ? whenText(link.paidAt) : ""}`
                        : link.status === "cancelled"
                          ? "Cancelled"
                          : `Sent ${whenText(link.createdAt)}${link.createdBy ? ` by ${link.createdBy}` : ""}`}
                    </p>
                  </div>
                  <StatusChip status={link.status} />
                  {link.status === "open" && (
                    <>
                      <IconButton label="Share" onClick={() => setShown(link)}>
                        <MessageCircle size={15} />
                      </IconButton>
                      <IconButton label="Ask SUMIT whether it was paid" onClick={() => act(link, "check")}>
                        <RefreshCw size={15} />
                      </IconButton>
                      <IconButton label="Cancel this link" onClick={() => act(link, "cancel")}>
                        <X size={15} />
                      </IconButton>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The link, its QR code, and the three ways to send it. */
function SharePanel({
  link,
  order,
  client,
  onDone,
}: {
  link: LinkWithUrl;
  order: Order;
  client: Client | undefined;
  onDone: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link.url, { margin: 1, width: 440, color: { dark: "#2A2520", light: "#FFFFFF" } })
      .then((data) => live && setQr(data))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [link.url]);

  const message = paymentMessage({
    customer: client?.name || order.customer,
    kind: link.kind,
    amount: link.amount,
    date: formatOrderDate(order.date),
    url: link.url,
  });
  const phone = client?.phone ? whatsappNumber(client.phone) : null;
  const whatsapp = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(message)}`;
  const email = `mailto:${client?.email ?? ""}?subject=${encodeURIComponent("לינק לתשלום — Gems")}&body=${encodeURIComponent(message)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      notify("Link copied.");
    } catch {
      notify("Couldn't copy — select the link and copy it by hand.");
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-cream/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">
          {PAYMENT_LINK_KIND_LABEL[link.kind]} · {currency(link.amount)}
        </p>
        <IconButton label="Close" onClick={onDone}>
          <X size={15} />
        </IconButton>
      </div>
      {/* Big enough to scan off a phone held out across a table. */}
      {qr && (
        // A data URL, so there is nothing for next/image to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code for the payment link" className="mx-auto mt-2 w-56 rounded-xl max-md:w-64" />
      )}
      <p className="mt-2 truncate text-center text-xs text-ink-soft select-all">{link.url}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={whatsapp} target="_blank" rel="noreferrer" className="press flex h-10 items-center justify-center gap-2 rounded-full bg-black font-semibold text-cream">
          <MessageCircle size={15} /> WhatsApp
        </a>
        <a href={email} className="press flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-card font-semibold">
          <Mail size={15} /> Email
        </a>
        <button type="button" onClick={copy} className="press flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-card font-semibold">
          <Copy size={15} /> Copy link
        </button>
        <a href={link.url} target="_blank" rel="noreferrer" className="press flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-card font-semibold">
          <ExternalLink size={15} /> Open
        </a>
      </div>
      {!phone && <p className="mt-2 text-xs text-ink-soft">No phone on the client card — WhatsApp will ask who to send it to.</p>}
    </div>
  );
}

function StatusChip({ status }: { status: PaymentLink["status"] }) {
  const style =
    status === "paid"
      ? "bg-accent text-cream"
      : status === "cancelled"
        ? "bg-band text-ink-soft"
        : "bg-tile-peach text-ink";
  const text = status === "paid" ? "Paid" : status === "cancelled" ? "Cancelled" : "Open";
  return <span className={`keeps-color shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>{text}</span>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-band hover:text-ink max-md:h-9 max-md:w-9"
    >
      {children}
    </button>
  );
}

/** One read-only figure in the "Payment so far" box. */
function Figure({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className={`font-display text-xl leading-tight font-extrabold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
