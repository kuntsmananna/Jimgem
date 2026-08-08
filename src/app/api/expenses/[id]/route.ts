import { NextRequest, NextResponse } from "next/server";
import { updateExpense, deleteExpense, type ExpenseInput } from "@/lib/expenses";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/expenses/[id]">) {
  const { id } = await ctx.params;
  if (id.startsWith("sheet-expense:")) {
    return NextResponse.json({ error: "Sheet-derived expense entries can't be edited." }, { status: 400 });
  }
  const body = (await request.json()) as ExpenseInput;
  try {
    const expense = await updateExpense(Number(id), body);
    return NextResponse.json(expense);
  } catch (error) {
    console.error(`Failed to update expense ${id}:`, error);
    return NextResponse.json({ error: "Failed to update expense." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/expenses/[id]">) {
  const { id } = await ctx.params;
  if (id.startsWith("sheet-expense:")) {
    return NextResponse.json({ error: "Sheet-derived expense entries can't be deleted." }, { status: 400 });
  }
  try {
    await deleteExpense(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to delete expense ${id}:`, error);
    return NextResponse.json({ error: "Failed to delete expense." }, { status: 500 });
  }
}
