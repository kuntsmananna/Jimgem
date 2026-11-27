import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, Clock } from "lucide-react";
import { confirmReturn, getPublicLink } from "@/lib/paymentLinks";
import { payCopy } from "../../copy";
import { FollowUs, PayShell, readPayLang, shekels } from "../../PayShell";
import { SaleProof } from "../../SaleProof";

export const metadata: Metadata = { title: "Gems — תודה / Thank you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where SUMIT sends the customer after paying, with `OG-PaymentID` in the
 * query. The id is only a claim — anyone can type this URL — so
 * `confirmReturn` asks SUMIT about it, and checks it is valid and carries
 * this link's token, before the link and the order are marked paid.
 *
 * The thank-you ends on an invitation to follow on Instagram and visit the
 * website (v0.99.4, the owner's ask): the one moment a customer is glad to
 * hear from the business is the moment after paying it.
 */
export default async function PayDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const raw = query["OG-PaymentID"];
  const paymentId = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;

  let status: Awaited<ReturnType<typeof confirmReturn>> = null;
  try {
    status = await confirmReturn(token, paymentId);
  } catch (error) {
    // SUMIT not answering is not the customer's problem: the nightly check
    // will find the payment. They are told it is being confirmed.
    console.error("Confirming a payment failed:", error);
  }
  const link = await getPublicLink(token);
  if (!link) notFound();
  const lang = await readPayLang();
  const t = payCopy(lang);

  if (status !== "paid" && link.status !== "paid") {
    return (
      <PayShell lang={lang} token={token} back="done">
        <div className="flex flex-col items-center text-center">
          <Clock size={40} strokeWidth={1.75} className="text-ink-soft" aria-hidden />
          <h1 className="font-display mt-3 text-xl font-extrabold">{t.pendingTitle}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.pendingText}</p>
        </div>
      </PayShell>
    );
  }

  if (link.kind === "sale") {
    return (
      <PayShell lang={lang} token={token} back="done">
        <SaleProof token={token} lang={lang} amount={link.paidAmount ?? link.amount} />
        <FollowUs lang={lang} title={t.thanksBuy} />
      </PayShell>
    );
  }

  return (
    <PayShell lang={lang} token={token} back="done">
      <div className="flex flex-col items-center text-center">
        <span className="motion-pop flex h-16 w-16 items-center justify-center rounded-full bg-accent text-cream">
          <CircleCheck size={34} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="font-display mt-4 text-[26px] leading-tight font-extrabold">{t.paidTitle}</h1>
        <p className="font-display mt-2 text-4xl leading-none font-extrabold tabular-nums" dir="ltr">
          {shekels(link.paidAmount ?? link.amount)}
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {t.kind(link.kind)} · {link.date}
        </p>
        {link.receiptByEmail && <p className="mt-3 text-sm">{t.receiptOnWay}</p>}
        <p className="mt-4 text-base font-semibold">{t.thanks}</p>
      </div>

      <FollowUs lang={lang} />
    </PayShell>
  );
}
