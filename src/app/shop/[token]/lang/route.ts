import { NextRequest, NextResponse } from "next/server";
import { payLang, setPayLangCookie } from "@/app/pay/copy";

/** The shop's language switch: the payment pages' cookie, then back to the shop (v0.102). */
export async function GET(request: NextRequest, ctx: RouteContext<"/shop/[token]/lang">) {
  const { token } = await ctx.params;
  const lang = payLang(request.nextUrl.searchParams.get("to") ?? undefined);
  const response = NextResponse.redirect(new URL(`/shop/${token}`, request.nextUrl.origin), 303);
  setPayLangCookie(response, lang);
  return response;
}
