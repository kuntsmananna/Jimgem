import { NextRequest, NextResponse } from "next/server";
import { archiveClient, updateClient } from "@/lib/clients";

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
    if (typeof body.archived === "boolean") {
      await archiveClient(id, body.archived);
      return NextResponse.json({ id, archived: body.archived });
    }
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "A client needs a name." }, { status: 400 });
    }
    return NextResponse.json(
      await updateClient(id, {
        name,
        phone: String(body.phone ?? ""),
        email: String(body.email ?? ""),
        notes: String(body.notes ?? ""),
      }),
    );
  } catch (error) {
    console.error("Failed to update client:", error);
    return NextResponse.json({ error: "Failed to update the client." }, { status: 500 });
  }
}
