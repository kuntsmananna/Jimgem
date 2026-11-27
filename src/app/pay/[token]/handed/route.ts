import { NextResponse } from "next/server";
import { handOver } from "@/lib/eventSales";

export const runtime = "nodejs";

/**
 * "Handed over", tapped by staff on a customer's proof screen (v0.102).
 * Public, as the screen is: it is the customer's phone being tapped, and
 * the only thing it can do is stamp a paid sale as collected, once.
 */
export async function POST(_request: Request, ctx: RouteContext<"/pay/[token]/handed">) {
  const { token } = await ctx.params;
  try {
    const at = await handOver(token);
    if (!at) return NextResponse.json({ error: "Not a paid purchase." }, { status: 404 });
    return NextResponse.json({ handedAt: at });
  } catch (error) {
    console.error("Hand-over failed:", error);
    return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  }
}
