import { NextRequest, NextResponse } from "next/server";
import { deleteTask, restoreTask, updateTask } from "@/lib/tasks";
import { currentEditor } from "@/lib/editor";
import { refuseSignedOut } from "@/lib/guard";
import { parseRowId, parseTaskInput } from "@/lib/validate";
import { badRequest, readJson } from "@/lib/requestBody";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const refused = await refuseSignedOut();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such task.");
  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;
  const body = raw as { restore?: unknown };
  try {
    if (body.restore === true) {
      await restoreTask(id);
      return NextResponse.json({ id, restored: true });
    }
    const parsed = parseTaskInput(body);
    if (!parsed.ok) return badRequest(parsed.error);
    return NextResponse.json(await updateTask(id, parsed.value, await currentEditor()));
  } catch (error) {
    console.error(`Failed to update task ${id}:`, error);
    return NextResponse.json({ error: "Failed to save the task." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const refused = await refuseSignedOut();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such task.");
  try {
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to delete task ${id}:`, error);
    return NextResponse.json({ error: "Failed to delete the task." }, { status: 500 });
  }
}
