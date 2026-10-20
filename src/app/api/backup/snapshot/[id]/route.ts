import { NextResponse } from "next/server";
import { getSnapshotDocument } from "@/lib/backup";
import { refuseNonAdmin } from "@/lib/guard";

/**
 * One snapshot, as a file to keep somewhere else.
 *
 * The point of a download is that a copy exists outside this database —
 * so it is served as an attachment with the date in its name, and
 * `scripts/restore-snapshot.mjs` takes exactly this file back.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const { id } = await context.params;
  const document = await getSnapshotDocument(Number(id));
  if (document === null) {
    return NextResponse.json({ error: "No such snapshot." }, { status: 404 });
  }

  return new NextResponse(document, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="jimgem-backup-${id}.json"`,
    },
  });
}
