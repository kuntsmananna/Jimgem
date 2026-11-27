import { NextRequest, NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { currentEditor } from "@/lib/editor";
import { cancelPaymentLink, checkPaymentLink } from "@/lib/paymentLinks";
import { parseRowId } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/**
 * `{ action: "check" }` asks SUMIT whether the link has been paid (one
 * metered call); `{ action: "cancel" }` stops it being offered — the
 * customer's page then says so instead of showing a Pay button.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/payment-links/[id]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such link.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const action = (raw as { action?: unknown } | null)?.action;

  if (action === "cancel") {
    await cancelPaymentLink(id, await currentEditor());
    return NextResponse.json({ ok: true });
  }
  if (action === "check") {
    try {
      return NextResponse.json({ status: await checkPaymentLink(id) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SUMIT did not answer.";
      return NextResponse.json({ error: `Could not ask SUMIT: ${message}` }, { status: 502 });
    }
  }
  return badRequest("Nothing to do.");
}
