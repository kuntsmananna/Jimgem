import { NextRequest, NextResponse } from "next/server";
import { createExpense, type ExpenseInput } from "@/lib/expenses";
import { currentEditor } from "@/lib/editor";
import { refuseNonAdmin } from "@/lib/guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const body = (await request.json()) as ExpenseInput;
  try {
    const expense = await createExpense(body, await currentEditor());
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("Failed to create expense:", error);
    return NextResponse.json({ error: "Failed to create expense." }, { status: 500 });
  }
}
