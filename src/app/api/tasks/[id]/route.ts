import { NextRequest, NextResponse } from "next/server";
import { deleteTask, restoreTask, updateTask, type TaskInput } from "@/lib/tasks";
import { currentEditor } from "@/lib/editor";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as TaskInput & { restore?: boolean };
  try {
    if (body.restore) {
      await restoreTask(Number(id));
      return NextResponse.json({ id: Number(id), restored: true });
    }
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "A task needs something to say." }, { status: 400 });
    }
    return NextResponse.json(await updateTask(Number(id), body, await currentEditor()));
  } catch (error) {
    console.error(`Failed to update task ${id}:`, error);
    return NextResponse.json({ error: "Failed to save the task." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteTask(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to delete task ${id}:`, error);
    return NextResponse.json({ error: "Failed to delete the task." }, { status: 500 });
  }
}
