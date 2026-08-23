import { NextRequest, NextResponse } from "next/server";
import { archiveClient, updateClient } from "@/lib/clients";
import { currentEditor } from "@/lib/editor";

export const runtime = "nodejs";

/**
 * Edits a client, or archives one. Archiving rather than deleting: orders
 * point at their client, so a hard delete would either orphan them or
 * cascade and take real history with it.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/clients/[id]">) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Unknown client." }, { status: 400 });
  }
  const body = await request.json();

  try {
    // `archive`, the same key /api/settings/[resource]/[id] takes for the
    // other eight lists, so archiving speaks one convention app-wide.
    if (typeof body.archive === "boolean") {
      await archiveClient(id, body.archive);
      return NextResponse.json({ id, archived: body.archive });
    }
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "A client needs a name." }, { status: 400 });
    }
    return NextResponse.json(
      await updateClient(
        id,
        {
          name,
          phone: String(body.phone ?? ""),
          email: String(body.email ?? ""),
          source: String(body.source ?? ""),
          notes: String(body.notes ?? ""),
        },
        await currentEditor(),
      ),
    );
  } catch (error) {
    console.error("Failed to update client:", error);
    return NextResponse.json({ error: "Failed to update the client." }, { status: 500 });
  }
}
