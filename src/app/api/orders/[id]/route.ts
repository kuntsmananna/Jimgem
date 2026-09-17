import { NextRequest, NextResponse } from "next/server";
import { StaleWriteError, updateOrder, updateOrderFields, getOrderMoney, type OrderInput, type EditableField } from "@/lib/orders";
import { currentEditor } from "@/lib/editor";
import { callerIsAdmin } from "@/lib/guard";
import { MONEY_FIELDS, withStoredMoney } from "@/lib/redact";

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

/**
 * A staff account may save an order — that is how an order gets marked
 * delivered from the kitchen, which is half of why the phone layout
 * exists — but it may not touch the money on one.
 *
 * Both modes are handled, and differently, because they fail differently.
 * A "replace" carries the *whole* order, so a save from a tree that was
 * never shown the amounts would write the redaction's zeros over the real
 * figures: every money column is therefore taken from the stored row
 * instead of from the body, and nothing the caller sends in them is read
 * at all. A "patch" names its fields, so it is simply refused if it names
 * a money one — there is no correct merge for "set the deposit", only a
 * request that should not have been made.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as UpdateBody;
  const editor = await currentEditor();
  const admin = await callerIsAdmin();
  try {
    if (body.mode === "replace") {
      let input: OrderInput = body;
      if (!admin) {
        const stored = await getOrderMoney(Number(id));
        if (!stored) return NextResponse.json({ error: "No such order." }, { status: 404 });
        input = withStoredMoney(body, stored);
      }
      return NextResponse.json(await updateOrder(Number(id), input, body.expectedUpdatedAt, editor));
    }
    if (body.mode === "patch") {
      if (!admin && MONEY_FIELDS.some((field) => field in body)) {
        return NextResponse.json({ error: "Only an admin can change that." }, { status: 403 });
      }
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
