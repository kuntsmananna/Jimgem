import { NextRequest, NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { getSaleStatus, settleOpenSale } from "@/lib/eventSales";
import { parseRowId } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/** A sale's state — what the register polls while a card payment is awaited. No SUMIT call. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/event-sales/[id]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such sale.");
  const sale = await getSaleStatus(id);
  if (!sale) return NextResponse.json({ error: "No such sale." }, { status: 404 });
  return NextResponse.json(sale);
}

/** `{ action: "cancel" | "cash" }` on a sale still awaiting its card payment. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/event-sales/[id]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such sale.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const action = (raw as { action?: unknown } | null)?.action;
  if (action !== "cancel" && action !== "cash") return badRequest("Nothing to do.");
  return NextResponse.json({ status: await settleOpenSale(id, action) });
}
