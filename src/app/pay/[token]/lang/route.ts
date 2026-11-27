import { NextRequest, NextResponse } from "next/server";
import { payLang, setPayLangCookie } from "../../copy";


/**
 * The payment pages' language switch: remembers the choice in a cookie and
 * goes back to the page it came from. A cookie rather than a query string
 * because the thank-you page's address is fixed when SUMIT is asked for
 * the payment page, so nothing added to a URL here would survive the trip.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/pay/[token]/lang">) {
  const { token } = await ctx.params;
  const params = request.nextUrl.searchParams;
  const lang = payLang(params.get("to") ?? undefined);
  const back = params.get("back") === "done" ? `/pay/${token}/done` : `/pay/${token}`;
  const response = NextResponse.redirect(new URL(back, request.nextUrl.origin), 303);
  setPayLangCookie(response, lang);
  return response;
}
