import { NextRequest, NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { currentEditor } from "@/lib/editor";
import { recordSale } from "@/lib/eventSales";
import { PaymentLinkError } from "@/lib/paymentLinks";
import { parseRowId } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/**
 * Rings up a sale: `{ items: [{ presetId, qty }], method: "card" | "cash" }`.
 * Only what was taken is read — the price is the event's, worked out here.
 * Admins only for now (the owner's call: Anna and Aviv sell).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/events/[id]/sales">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const eventId = parseRowId((await ctx.params).id);
  if (eventId === null) return badRequest("No such event.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const body = (raw ?? {}) as { items?: unknown; method?: unknown };
  if (body.method !== "card" && body.method !== "cash") return badRequest("Card or cash?");
  if (!Array.isArray(body.items) || body.items.length > 100) return badRequest("The basket didn't arrive.");
  const items = [];
  for (const entry of body.items) {
    const presetId = Number((entry as { presetId?: unknown })?.presetId);
    const qty = Number((entry as { qty?: unknown })?.qty);
    if (!Number.isInteger(presetId) || presetId < 1 || !Number.isInteger(qty) || qty < 0 || qty > 1000) {
      return badRequest("A line in the basket isn't one.");
    }
    items.push({ presetId, qty });
  }
  try {
    const sale = await recordSale({
      eventId,
      items,
      method: body.method,
      seller: await currentEditor(),
      appUrl: request.nextUrl.origin,
    });
    return NextResponse.json(sale);
  } catch (error) {
    if (error instanceof PaymentLinkError) return badRequest(error.message);
    const message = error instanceof Error ? error.message : "SUMIT did not answer.";
    console.error("Sale failed:", error);
    return NextResponse.json({ error: `Couldn't start the card payment: ${message}` }, { status: 502 });
  }
}
