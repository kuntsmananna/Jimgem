import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, Clock, Globe } from "lucide-react";
import { confirmReturn, getPublicLink } from "@/lib/paymentLinks";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, payCopy, SITE_URL } from "../../copy";
import { InstagramMark, PayShell, readPayLang, shekels } from "../../PayShell";

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

      {/* The invitation, in a box of its own under a rule: a thank-you
          first, an ask second. */}
      <div className="motion-stagger mt-6 rounded-2xl bg-cream p-4">
        <p className="font-bold">{t.followTitle}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{t.followText}</p>
        <div className="mt-3 flex flex-col gap-2">
          <a
            href={INSTAGRAM_URL}
            className="press flex h-12 items-center justify-center gap-2 rounded-full bg-black font-bold text-cream"
          >
            <InstagramMark />
            <span dir="ltr">{INSTAGRAM_HANDLE}</span>
          </a>
          <a
            href={SITE_URL}
            className="press flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-card font-bold text-ink"
          >
            <Globe size={17} aria-hidden />
            {t.site}
          </a>
        </div>
      </div>
    </PayShell>
  );
}
