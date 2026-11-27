import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { getPublicLink } from "@/lib/paymentLinks";
import { PAYMENT_LINK_KIND_HEBREW } from "@/lib/paymentLinkTypes";
import { PayShell, shekels } from "../PayShell";

export const metadata: Metadata = { title: "תשלום — Gems", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The page a customer's payment link opens (v0.99) — public, outside the
 * session gate in `proxy.ts`, and reachable only by its random token.
 *
 * It says what is being paid for and how much, and its button goes
 * through `/pay/<token>/go` to SUMIT. Once paid it says so instead, so the
 * same link sent twice, or opened after the fact, cannot be paid twice.
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

  if (link.status === "paid") {
    return (
      <PayShell>
        <CircleCheck size={44} className="mx-auto text-accent" aria-hidden />
        <h1 className="font-display mt-3 text-2xl font-extrabold">התשלום התקבל</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {shekels(link.paidAmount ?? link.amount)} · {PAYMENT_LINK_KIND_HEBREW[link.kind]} להזמנה לתאריך {link.date}
        </p>
        <p className="mt-4 text-sm">תודה! 🍸</p>
      </PayShell>
    );
  }

  if (link.status === "cancelled") {
    return (
      <PayShell>
        <h1 className="font-display text-xl font-extrabold">הלינק הזה כבר לא פעיל</h1>
        <p className="mt-2 text-sm text-ink-soft">אם צריך לשלם, נשלח לך לינק חדש.</p>
      </PayShell>
    );
  }

  return (
    <PayShell>
      <p className="text-sm font-semibold text-ink-soft">{PAYMENT_LINK_KIND_HEBREW[link.kind]} להזמנה לתאריך {link.date}</p>
      <p data-private className="mt-1 text-sm text-ink-soft">
        {link.customer}
      </p>
      <p className="font-display mt-4 text-5xl leading-none font-extrabold tabular-nums">{shekels(link.amount)}</p>

      {query.cancelled && (
        <p className="mt-5 rounded-xl bg-band px-3 py-2 text-sm">התשלום לא הושלם. אפשר לנסות שוב.</p>
      )}
      {query.unavailable && (
        <p className="mt-5 rounded-xl bg-band px-3 py-2 text-sm">
          לא הצלחנו לפתוח את דף התשלום כרגע. נסו שוב בעוד רגע, או כתבו לנו.
        </p>
      )}

      {/* A plain link, not next/link: nothing may prefetch it, since
          following it can ask SUMIT for a fresh page. */}
      <a
        href={`/pay/${link.token}/go`}
        className="press mt-6 flex h-12 w-full items-center justify-center rounded-full bg-black text-base font-bold text-cream"
      >
        לתשלום מאובטח
      </a>
      <p className="mt-3 text-xs text-ink-soft">
        התשלום מתבצע בדף המאובטח של SUMIT.{link.receiptByEmail ? " הקבלה תישלח אליך למייל." : ""}
      </p>
    </PayShell>
  );
}
