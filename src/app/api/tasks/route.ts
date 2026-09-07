import { NextRequest, NextResponse } from "next/server";
import { createTask, type TaskInput } from "@/lib/tasks";
import { currentEditor } from "@/lib/editor";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as TaskInput;
  // A blank task is a stray Enter, not a record. Refused here as well as
  // in the composer, since the composer is not the only possible caller.
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "A task needs something to say." }, { status: 400 });
  }
  try {
    return NextResponse.json(await createTask(body, await currentEditor()), { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to add the task." }, { status: 500 });
  }
}
