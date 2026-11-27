import { NextRequest, NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { currentEditor } from "@/lib/editor";
import { createPaymentLink, getLinksForOrder, PaymentLinkError } from "@/lib/paymentLinks";
import { ORDER_LINK_KINDS, paymentPageUrl, type PaymentLinkKind } from "@/lib/paymentLinkTypes";
import { parseRowId } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/** An order's links, newest first. Admin only, like everything about money. */
export async function GET(request: NextRequest) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const orderId = parseRowId(request.nextUrl.searchParams.get("orderId") ?? "");
  if (orderId === null) return badRequest("No such order.");
  const { available, links } = await getLinksForOrder(orderId);
  const origin = request.nextUrl.origin;
  return NextResponse.json({
    available,
    links: links.map((link) => ({ ...link, url: paymentPageUrl(origin, link.token) })),
  });
}

/**
 * Makes a link. The customer's page lives on the address this was asked
 * from, so a link made on a preview opens that preview — which a customer
 * cannot reach while the preview is protected. Make real ones in production.
 */
export async function POST(request: NextRequest) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const body = (raw ?? {}) as { orderId?: unknown; kind?: unknown; amount?: unknown };

  const orderId = parseRowId(String(body.orderId ?? ""));
  if (orderId === null) return badRequest("No such order.");
  if (!(ORDER_LINK_KINDS as readonly string[]).includes(String(body.kind))) return badRequest("Choose what the link is for.");
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return badRequest("The amount has to be more than ₪0.");

  const origin = request.nextUrl.origin;
  try {
    const link = await createPaymentLink({
      orderId,
      kind: body.kind as PaymentLinkKind,
      amount,
      appUrl: origin,
      editor: await currentEditor(),
    });
    return NextResponse.json({ link: { ...link, url: paymentPageUrl(origin, link.token) } });
  } catch (error) {
    if (error instanceof PaymentLinkError) return badRequest(error.message);
    const message = error instanceof Error ? error.message : "SUMIT did not answer.";
    console.error("Payment link failed:", error);
    // SUMIT's own sentence is the useful part (Billing not enabled, the
    // budget spent), so it is passed on rather than replaced.
    return NextResponse.json({ error: `SUMIT refused the link: ${message}` }, { status: 502 });
  }
}
