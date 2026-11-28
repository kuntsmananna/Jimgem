import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/guard";
import { getEvent } from "@/lib/events";
import { getEventTally } from "@/lib/eventSales";
import { getContentPresets, getFlavors, getPackageTypes } from "@/lib/settings";
import { presetSummaries } from "@/lib/eventPresets";
import { EventRegister } from "@/components/events/EventRegister";

export const dynamic = "force-dynamic";

/** The register for one event, on the seller's phone (v0.101). Admins only for now. */
export default async function EventRegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) notFound();
  const id = Number(raw);
  const [, event, tally, presets, flavors, packageTypes] = await Promise.all([
    requireAdminPage(),
    getEvent(id),
    getEventTally(id),
    // Archived included: a preset retired after the event was set up still sells.
    getContentPresets(true),
    getFlavors(true),
    getPackageTypes(true),
  ]);
  if (!event) notFound();
  return <EventRegister event={event} tally={tally} presets={presetSummaries(presets, flavors, packageTypes)} />;
}
