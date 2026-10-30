import { NextRequest, NextResponse } from "next/server";
import { saveRecipe } from "@/lib/ingredients";
import { currentEditor } from "@/lib/editor";
import { refuseNonAdmin } from "@/lib/guard";
import { parseRecipeInput, parseRowId } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

/**
 * Replaces one flavour's recipe. Admin only: a recipe is what a jelly's
 * cost is worked out from, and that is money.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/settings/recipes/[flavorId]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const flavorId = parseRowId((await ctx.params).flavorId);
  if (flavorId === null) return badRequest("No such flavour.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const parsed = parseRecipeInput(raw);
  if (!parsed.ok) return badRequest(parsed.error);
  try {
    await saveRecipe(flavorId, parsed.value.batchUnits, parsed.value.items, await currentEditor());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to save the recipe for flavour ${flavorId}:`, error);
    return NextResponse.json({ error: "Failed to save the recipe." }, { status: 500 });
  }
}
