import { NextRequest, NextResponse } from "next/server";
import { createExpense } from "@/lib/expenses";
import { parseExpenseInput } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";
import { currentEditor } from "@/lib/editor";
import { refuseNonAdmin } from "@/lib/guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const parsed = parseExpenseInput(body);
  if (!parsed.ok) return badRequest(parsed.error);
  try {
    const expense = await createExpense(parsed.value, await currentEditor());
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("Failed to create expense:", error);
    return NextResponse.json({ error: "Failed to create expense." }, { status: 500 });
  }
}
