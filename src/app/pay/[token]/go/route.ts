import { NextRequest, NextResponse } from "next/server";
import { sumitUrlForCustomer } from "@/lib/paymentLinks";

export const runtime = "nodejs";

/**
 * The Pay button: on to SUMIT's page, made fresh if the one on file has
 * run out. A route rather than a link straight to SUMIT so the customer's
 * address never goes stale, and so nothing is asked of SUMIT until the
 * button is actually pressed (a page can be prefetched; a press cannot).
 * Anything that stops it lands back on the link's own page, which says
 * what the state is.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/pay/[token]/go">) {
  const { token } = await ctx.params;
  const back = new URL(`/pay/${token}`, request.nextUrl.origin);
  try {
    const url = await sumitUrlForCustomer(token, request.nextUrl.origin);
    if (url) return NextResponse.redirect(url, 303);
  } catch (error) {
    console.error("Payment page failed:", error);
    back.searchParams.set("unavailable", "1");
  }
  return NextResponse.redirect(back, 303);
}
