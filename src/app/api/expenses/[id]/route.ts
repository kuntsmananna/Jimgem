import { NextRequest, NextResponse } from "next/server";
import { updateExpense, deleteExpense, restoreExpense } from "@/lib/expenses";
import { StaleWriteError } from "@/lib/orders";
import { currentEditor } from "@/lib/editor";
import { refuseNonAdmin } from "@/lib/guard";
import { parseExpenseInput, parseRowId } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/expenses/[id]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const { id: rawId } = await ctx.params;
  const id = parseRowId(rawId);
  if (id === null) return badRequest("No such expense.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const body = raw as {
    expectedUpdatedAt?: unknown;
    /** The other half of DELETE — see migration 024. */
    restore?: unknown;
  };
  try {
    if (body.restore === true) {
      await restoreExpense(id);
      return NextResponse.json({ id, restored: true });
    }
    const parsed = parseExpenseInput(body);
    if (!parsed.ok) return badRequest(parsed.error);
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined;
    const expense = await updateExpense(id, parsed.value, expectedUpdatedAt, await currentEditor());
    return NextResponse.json(expense);
  } catch (error) {
    // 409, not 500: the write was refused because the row moved on — see
    // the orders route for the same handling.
    if (error instanceof StaleWriteError) {
      return NextResponse.json(
        { error: `${error.message} Reload to see their version, then make your change again.` },
        { status: 409 },
      );
    }
    console.error(`Failed to update expense ${id}:`, error);
    return NextResponse.json({ error: "Failed to update expense." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/expenses/[id]">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such expense.");
  try {
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to delete expense ${id}:`, error);
    return NextResponse.json({ error: "Failed to delete expense." }, { status: 500 });
  }
}
