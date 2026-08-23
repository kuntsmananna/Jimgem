import { NextRequest, NextResponse } from "next/server";
import { createClient, getClients } from "@/lib/clients";
import { currentEditor } from "@/lib/editor";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getClients(true));
}

/**
 * Creates a client. Called from the order form when a name is typed that
 * matches nobody — at save time, not as it is typed, so abandoning a
 * half-filled order doesn't leave a client behind.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "A client needs a name." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await createClient(
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
    console.error("Failed to create client:", error);
    return NextResponse.json({ error: "Failed to create the client." }, { status: 500 });
  }
}
