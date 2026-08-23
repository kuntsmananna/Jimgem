import { NextRequest, NextResponse } from "next/server";
import { updateExpense, deleteExpense, restoreExpense, type ExpenseInput } from "@/lib/expenses";
import { StaleWriteError } from "@/lib/orders";
import { currentEditor } from "@/lib/editor";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/expenses/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as ExpenseInput & {
    expectedUpdatedAt?: string;
    /** The other half of DELETE — see migration 024. */
    restore?: boolean;
  };
  try {
    if (body.restore) {
      await restoreExpense(Number(id));
      return NextResponse.json({ id: Number(id), restored: true });
    }
    const expense = await updateExpense(Number(id), body, body.expectedUpdatedAt, await currentEditor());
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
  const { id } = await ctx.params;
  try {
    await deleteExpense(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to delete expense ${id}:`, error);
    return NextResponse.json({ error: "Failed to delete expense." }, { status: 500 });
  }
}
