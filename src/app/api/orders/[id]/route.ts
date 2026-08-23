import { NextRequest, NextResponse } from "next/server";
import { StaleWriteError, updateOrder, updateOrderFields, type OrderInput, type EditableField } from "@/lib/orders";
import { currentEditor } from "@/lib/editor";

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
/**
 * Both carry an optional `expectedUpdatedAt`: the version the caller's
 * copy was built from. With it, a write over a row someone else has since
 * changed is refused with 409 rather than applied — see StaleWriteError.
 */
type UpdateBody = { expectedUpdatedAt?: string } & (
  | ({ mode: "replace" } & OrderInput)
  | ({ mode: "patch" } & Partial<Record<EditableField, string | number | boolean | null>>)
);

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as UpdateBody;
  const editor = await currentEditor();
  try {
    if (body.mode === "replace") {
      return NextResponse.json(await updateOrder(Number(id), body, body.expectedUpdatedAt, editor));
    }
    if (body.mode === "patch") {
      await updateOrderFields(Number(id), body, body.expectedUpdatedAt, editor);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Body needs a "mode" of "replace" or "patch".' }, { status: 400 });
  } catch (error) {
    // 409, not 500: nothing failed. The row moved on, and the caller's
    // copy is the stale one — which is a sentence the UI can show.
    if (error instanceof StaleWriteError) {
      return NextResponse.json(
        { error: `${error.message} Reload to see their version, then make your change again.` },
        { status: 409 },
      );
    }
    console.error(`Failed to update order ${id}:`, error);
    return NextResponse.json({ error: "Failed to update order." }, { status: 500 });
  }
}
