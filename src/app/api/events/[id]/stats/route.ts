import { NextResponse } from "next/server";
import { refuseNonAdmin } from "@/lib/guard";
import { getEvent } from "@/lib/events";
import { getEventStats } from "@/lib/eventStats";
import { getContentPresets, getFlavors, getPackageTypes, getStaff } from "@/lib/settings";
import { presetSummaries } from "@/lib/eventPresets";
import { parseRowId } from "@/lib/validate";
import { badRequest } from "@/lib/requestBody";

export const runtime = "nodejs";

/**
 * Everything the statistics popup draws for one event (v0.103): the event,
 * its boxes with their names and colours, and every paid sale. Admins only
 * — it is all money. Read when the popup opens, so the three pages that
 * open it need not carry every event's sales.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/events/[id]/stats">) {
  const refused = await refuseNonAdmin();
  if (refused) return refused;
  const id = parseRowId((await ctx.params).id);
  if (id === null) return badRequest("No such event.");
  const [event, stats, presets, flavors, packageTypes, staff] = await Promise.all([
    getEvent(id),
    getEventStats(id),
    getContentPresets(),
    getFlavors(true),
    getPackageTypes(true),
    getStaff(),
  ]);
  if (!event) return NextResponse.json({ error: "No such event." }, { status: 404 });
  const summaries = new Map(presetSummaries(presets, flavors, packageTypes).map((p) => [p.id, p]));
  // Every box a sale took, including one since taken off the table.
  const ids = new Set([...event.products.map((p) => p.presetId), ...stats.sales.flatMap((s) => s.items.map((i) => i.presetId))]);
  return NextResponse.json({
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      countStock: event.countStock,
      sellers: staff.filter((s) => event.sellerIds.includes(s.id)).map((s) => s.name),
    },
    products: [...ids].map((presetId) => {
      const summary = summaries.get(presetId);
      return {
        presetId,
        name: summary?.name ?? "A retired box",
        units: summary?.units ?? 0,
        color: summary?.color ?? { g: "#efe6df", b: "#d9cbc1", s: "#b9a89c" },
        brought: event.products.find((p) => p.presetId === presetId)?.brought ?? null,
      };
    }),
    ...stats,
  });
}
