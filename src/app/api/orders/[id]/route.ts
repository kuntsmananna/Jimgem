import { NextRequest, NextResponse } from "next/server";
import { updateOrder, updateOrderFields, type OrderInput, type EditableField } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * Two kinds of write share this route, told apart by an explicit `mode`
 * rather than by which keys happen to be present:
 *
 *   "replace" — the whole order, from the order form. Every column is set
 *               from the body, and content lines are rewritten.
 *   "patch"   — named fields only, from an inline table cell. Anything
 *               not mentioned is left alone.
 *
 * The distinction is worth stating rather than inferring: a "replace"
 * that arrives missing a field silently blanks it, so a caller must not
 * be able to trigger one by accident.
 */
type UpdateBody =
  | ({ mode: "replace" } & OrderInput)
  | ({ mode: "patch" } & Partial<Record<EditableField, string | number | null>>);

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as UpdateBody;
  try {
    if (body.mode === "replace") {
      return NextResponse.json(await updateOrder(Number(id), body));
    }
    if (body.mode === "patch") {
      await updateOrderFields(Number(id), body);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Body needs a "mode" of "replace" or "patch".' }, { status: 400 });
  } catch (error) {
    console.error(`Failed to update order ${id}:`, error);
    return NextResponse.json({ error: "Failed to update order." }, { status: 500 });
  }
}
