import { NextRequest, NextResponse } from "next/server";
import { setIngredientStock } from "@/lib/ingredients";
import { currentEditor } from "@/lib/editor";
import { refuseSignedOut } from "@/lib/guard";
import { parseRowId, parseStockInput } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/**
 * Records how many packs of an ingredient are on the shelf.
 *
 * Any signed-in login, staff included — the kitchen is who counts. Under
 * `/api/prep` because that is a segment a staff account already reaches,
 * and because this route can change nothing but the count: a price never
 * travels with it.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/prep/stock/[id]">) {
  const refused = await refuseSignedOut();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such ingredient.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const parsed = parseStockInput(raw);
  if (!parsed.ok) return badRequest(parsed.error);
  try {
    await setIngredientStock(id, parsed.value.onHand, await currentEditor());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to record the count for ingredient ${id}:`, error);
    return NextResponse.json({ error: "Failed to save the count." }, { status: 500 });
  }
}
