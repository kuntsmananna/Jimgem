import { NextRequest, NextResponse } from "next/server";
import { createExpense, type ExpenseInput } from "@/lib/expenses";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ExpenseInput;
  try {
    const expense = await createExpense(body);
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("Failed to create expense:", error);
    return NextResponse.json({ error: "Failed to create expense." }, { status: 500 });
  }
}
