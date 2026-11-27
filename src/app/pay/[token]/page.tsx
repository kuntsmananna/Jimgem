import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, Lock } from "lucide-react";
import { getPublicLink } from "@/lib/paymentLinks";
import { payCopy } from "../copy";
import { PayRow, PayShell, readPayLang, shekels } from "../PayShell";

export const metadata: Metadata = { title: "Gems — תשלום / Payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The page a customer's payment link opens (v0.99) — public, outside the
 * session gate in `proxy.ts`, and reachable only by its random token.
 *
 * It says what is being paid for and how much, and its button goes
 * through `/pay/<token>/go` to SUMIT. Once paid it says so instead, so the
 * same link sent twice, or opened after the fact, cannot be paid twice.
 * Hebrew or English, by the switch in `PayShell`.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const link = await getPublicLink(token);
  if (!link) notFound();
  const lang = await readPayLang();
  const t = payCopy(lang);

  if (link.status === "paid") {
    return (
      <PayShell lang={lang} token={token} back="page">
        <div className="flex flex-col items-center text-center">
          <CircleCheck size={48} strokeWidth={1.75} className="text-accent" aria-hidden />
          <h1 className="font-display mt-3 text-2xl font-extrabold">{t.paidTitle}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t.kind(link.kind)} · {shekels(link.paidAmount ?? link.amount)} · {link.date}
          </p>
        </div>
      </PayShell>
    );
  }

  if (link.status === "cancelled") {
    return (
      <PayShell lang={lang} token={token} back="page">
        <h1 className="font-display text-xl font-extrabold">{t.linkClosedTitle}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t.linkClosedText}</p>
      </PayShell>
    );
  }

  return (
    <PayShell lang={lang} token={token} back="page">
      <p className="text-sm font-semibold text-ink-soft">
        {t.kind(link.kind)} {t.forOrder}
      </p>
      <p className="font-display mt-1 text-[52px] leading-none font-extrabold tabular-nums">
        <span dir="ltr">{shekels(link.amount)}</span>
      </p>

      <dl className="motion-stagger mt-5 divide-y divide-line border-y border-line">
        <PayRow label={t.name}>
          <span data-private>{link.customer}</span>
        </PayRow>
        <PayRow label={t.eventDate}>{link.date}</PayRow>
        <PayRow label={t.amount}>
          <span dir="ltr">{shekels(link.amount)}</span>
        </PayRow>
      </dl>

      {query.cancelled && <p className="mt-5 rounded-2xl bg-band px-4 py-3 text-sm">{t.cancelledTry}</p>}
      {query.unavailable && <p className="mt-5 rounded-2xl bg-band px-4 py-3 text-sm">{t.unavailable}</p>}

      {/* A plain link, not next/link: nothing may prefetch it, since
          following it can ask SUMIT for a fresh page. */}
      <a
        href={`/pay/${link.token}/go`}
        className="press mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black text-[17px] font-bold text-cream"
      >
        <Lock size={17} aria-hidden />
        {t.pay}
      </a>
      <p className="mt-3 text-center text-xs leading-relaxed text-ink-soft">
        {t.secure}
        {link.receiptByEmail ? ` · ${t.receipt}` : ""}
      </p>
    </PayShell>
  );
}
