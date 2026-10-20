import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/tasks";
import { currentEditor } from "@/lib/editor";
import { refuseSignedOut } from "@/lib/guard";
import { parseTaskInput } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refused = await refuseSignedOut();
  if (refused) return refused;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  // A blank task is a stray Enter, not a record. Refused here as well as
  // in the composer, since the composer is not the only possible caller.
  const parsed = parseTaskInput(body);
  if (!parsed.ok) return badRequest(parsed.error);
  try {
    return NextResponse.json(await createTask(parsed.value, await currentEditor()), { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to add the task." }, { status: 500 });
  }
}
