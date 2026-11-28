import { NextRequest, NextResponse } from "next/server";
import { getEventByToken } from "@/lib/events";
import { recordSale, shopIsBusy } from "@/lib/eventSales";
import { SELF_SERVICE } from "@/lib/eventTypes";
import { PaymentLinkError } from "@/lib/paymentLinks";
import { parseSaleItems } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/**
 * The self-service shop's checkout (v0.102) — public, like the shop. It
 * takes `{ items }`, prices them on the server exactly as the register
 * does, and answers with the payment page's address. No SUMIT call is
 * made here: the link is created without a SUMIT page, which is asked
 * for only when the customer presses Pay on it.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/shop/[token]/checkout">) {
  const event = await getEventByToken((await ctx.params).token);
  if (!event || event.status !== "ready" || event.payMode === "staff") {
    return NextResponse.json({ error: "This stall isn't taking orders here." }, { status: 404 });
  }
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const items = parseSaleItems((raw as { items?: unknown } | null)?.items);
  if (typeof items === "string") return badRequest(items);
  if (await shopIsBusy(event.id)) {
    return NextResponse.json({ error: "Too many baskets at once — ask at the stall." }, { status: 429 });
  }
  try {
    const sale = await recordSale({
      eventId: event.id,
      items,
      method: "card",
      seller: SELF_SERVICE,
      appUrl: request.nextUrl.origin,
      lazy: true,
    });
    return NextResponse.json({ payUrl: sale.payUrl });
  } catch (error) {
    if (error instanceof PaymentLinkError) return badRequest(error.message);
    console.error("Self-service checkout failed:", error);
    return NextResponse.json({ error: "Something went wrong — ask at the stall." }, { status: 500 });
  }
}
