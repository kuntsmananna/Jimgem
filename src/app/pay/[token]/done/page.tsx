import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, Clock } from "lucide-react";
import { confirmReturn, getPublicLink } from "@/lib/paymentLinks";
import { PAYMENT_LINK_KIND_HEBREW } from "@/lib/paymentLinkTypes";
import { PayShell, shekels } from "../../PayShell";

export const metadata: Metadata = { title: "תודה — Gems", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where SUMIT sends the customer after paying, with `OG-PaymentID` in the
 * query. The id is only a claim — anyone can type this URL — so
 * `confirmReturn` asks SUMIT about it, and checks it is valid and carries
 * this link's token, before the link and the order are marked paid.
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

  if (status === "paid" || link.status === "paid") {
    return (
      <PayShell>
        <CircleCheck size={48} className="mx-auto text-accent" aria-hidden />
        <h1 className="font-display mt-3 text-2xl font-extrabold">תודה, התשלום התקבל!</h1>
        <p className="font-display mt-4 text-4xl leading-none font-extrabold tabular-nums">
          {shekels(link.paidAmount ?? link.amount)}
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {PAYMENT_LINK_KIND_HEBREW[link.kind]} להזמנה לתאריך {link.date}
        </p>
        {link.receiptByEmail && <p className="mt-4 text-sm">הקבלה בדרך אליך למייל.</p>}
        <p className="mt-4 text-sm">נתראה באירוע 🍸</p>
      </PayShell>
    );
  }

  return (
    <PayShell>
      <Clock size={40} className="mx-auto text-ink-soft" aria-hidden />
      <h1 className="font-display mt-3 text-xl font-extrabold">מאשרים את התשלום</h1>
      <p className="mt-2 text-sm text-ink-soft">
        עדיין לא קיבלנו אישור מ-SUMIT. אם חויבת, נראה את זה אצלנו בקרוב ואין צורך לשלם שוב.
      </p>
    </PayShell>
  );
}
