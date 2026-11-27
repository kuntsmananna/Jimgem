import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/guard";
import { getEvent } from "@/lib/events";
import { getContentPresets, getFlavors, getPackageTypes, getStaff } from "@/lib/settings";
import { presetSummaries } from "@/lib/eventPresets";
import { emptyEvent } from "@/lib/eventTypes";
import { todayIso } from "@/lib/orderTypes";
import { EventSetupForm } from "@/components/events/EventSetupForm";

export const dynamic = "force-dynamic";

/** `/events/new` sets one up; `/events/<id>` edits it. Admins only. */
export default async function EventSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const isNew = raw === "new";
  const id = isNew ? null : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(id)) notFound();

  const [, event, presets, flavors, packageTypes, staff] = await Promise.all([
    requireAdminPage(),
    id === null ? Promise.resolve(null) : getEvent(id),
    getContentPresets(),
    // Archived included: a colour or a size still worn by a live preset.
    getFlavors(true),
    getPackageTypes(true),
    getStaff(),
  ]);
  if (id !== null && !event) notFound();

  return (
    <EventSetupForm
      eventId={id}
      initial={event ?? emptyEvent(todayIso())}
      updatedAt={event?.updatedAt ?? null}
      updatedBy={event?.updatedBy ?? ""}
      presets={presetSummaries(presets, flavors, packageTypes)}
      staff={staff.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
