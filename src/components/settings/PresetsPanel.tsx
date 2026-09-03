"use client";

import { memo, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import {
  evenSplit,
  presetUnits,
  setFlavorUnits,
  toggleFlavorUnits,
  type OrderLineFlavor,
} from "@/lib/orderTypes";
import { packageTypeIconElement } from "@/lib/icons";
import { FlavorRow } from "@/components/orders/PackageLineEditor";
import { TrayPreview } from "@/components/orders/TrayPreview";
import { PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";

/**
 * A preset being edited, held in **units of one package** rather than in
 * the percentages it is stored as.
 *
 * That's what lets this editor be the order form's Content tab in
 * miniature — same picking, same tray preview, same arithmetic — instead
 * of a second, differently-behaved way to describe the same thing. Units
 * are converted back to shares on save, so the stored preset still scales
 * to any quantity (see schema.sql's content_presets).
 */
interface PresetDraft {
  name: string;
  packageTypeId: string;
  flavors: OrderLineFlavor[];
  autoSplit: boolean;
  /**
   * Carried through untouched — the price is set in Settings' Jelly
   * prices pane, not here. It still has to ride along because saving
   * replaces the whole preset, so leaving it out would clear it every
   * time someone adjusted a recipe.
   */
  price: number | null;
}

/** The package a draft is built against — its size drives every number below. */
const packageFor = (packageTypeId: string, packageTypes: PackageType[]) =>
  packageTypes.find((p) => String(p.id) === packageTypeId);

function draftFrom(preset: ContentPreset, packageTypes: PackageType[]): PresetDraft {
  const packed = packageFor(String(preset.packageTypeId), packageTypes)?.unitsPerPackage ?? 0;
  return {
    name: preset.name,
    packageTypeId: String(preset.packageTypeId),
    flavors: presetUnits(preset.flavors, packed),
    autoSplit: false,
    price: preset.price,
  };
}

/**
 * Settings → Presets. A preset is a package type plus a flavour recipe,
 * saved under a name the business already uses out loud ("Mix small") and
 * offered as a one-click chip in the order form.
 *
 * Editing one never touches orders already booked: applying a preset
 * copies it into ordinary order lines rather than linking to it.
 */
export function PresetsPanel({
  presets,
  flavors,
  packageTypes,
}: {
  presets: ContentPreset[];
  flavors: Flavor[];
  packageTypes: PackageType[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [busy, setBusy] = useState(false);

  function startNew() {
    setEditing("new");
    setDraft({
      name: "",
      packageTypeId: String(packageTypes[0]?.id ?? ""),
      flavors: [],
      autoSplit: true,
      price: null,
    });
  }

  function cancel() {
    setEditing(null);
    setDraft(null);
  }

  async function save() {
    if (!draft?.name.trim() || !draft.packageTypeId) return;
    const packed = packageFor(draft.packageTypeId, packageTypes)?.unitsPerPackage ?? 0;
    setBusy(true);
    await fetch(editing === "new" ? "/api/settings/presets" : `/api/settings/presets/${editing}`, {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        packageTypeId: Number(draft.packageTypeId),
        price: draft.price,
        // Back to proportions on the way out, which is what makes one
        // preset work for a tray of 50 and a tray of 150 alike.
        flavors: draft.flavors
          .filter((f) => f.units > 0)
          .map((f) => ({ flavorId: Number(f.flavorId), share: packed > 0 ? (f.units / packed) * 100 : 0 })),
      }),
    });
    setBusy(false);
    cancel();
    router.refresh();
  }

  async function archive(id: number) {
    setBusy(true);
    await fetch(`/api/settings/presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    setBusy(false);
    cancel();
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Presets"
        description={<>
            A package and its mix, saved together. Recipes are proportions, so one preset works for
            any quantity.
          </>}
        action={<button
          onClick={() => (editing === "new" ? cancel() : startNew())}
          disabled={packageTypes.length === 0}
          className={`shrink-0 ${PANE_ACTION_CLASS} disabled:opacity-40`}
        >
          {editing === "new" ? "Cancel" : "+ Add preset"}
        </button>}
      />

      {editing === "new" && draft && (
        <div className="mt-4">
          <PresetEditor
            draft={draft}
            onChange={setDraft}
            flavors={flavors}
            packageTypes={packageTypes}
            busy={busy}
            onSave={save}
            onCancel={cancel}
          />
        </div>
      )}

      {presets.length === 0 && editing !== "new" && (
        <p className="mt-4 text-xs text-ink-soft">
          No presets yet. Add the mixes you order most and they become one click on an order.
        </p>
      )}

      {/* Four across, not three: a card is only as wide as its name, its
          package chip and a tray preview capped at MAX_CUBE per column, so
          a third of the page left most of each one empty.

          Two across on a phone. At four a card is ~72px holding all three,
          which draws the tray's cubes about four pixels each — a smudge
          rather than the recipe the card exists to show. The open editor's
          `col-span-2` then spans the full width, which is what it wants
          there anyway. */}
      {presets.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-3 max-md:grid-cols-2">
          {presets.map((preset) =>
            editing === preset.id && draft ? (
              <div key={preset.id} className="col-span-2">
                <PresetEditor
                  draft={draft}
                  onChange={setDraft}
                  flavors={flavors}
                  packageTypes={packageTypes}
                  busy={busy}
                  onSave={save}
                  onCancel={cancel}
                  onArchive={() => archive(preset.id)}
                />
              </div>
            ) : (
              <PresetCard
                key={preset.id}
                preset={preset}
                flavors={flavors}
                packageTypes={packageTypes}
                onEdit={() => {
                  setEditing(preset.id);
                  setDraft(draftFrom(preset, packageTypes));
                }}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

/**
 * A preset as the thing it produces: the name big enough to pick out at a
 * glance, and the tray it packs drawn the same way the order form draws
 * it. A row of text percentages never told you what came out of the
 * kitchen.
 */
const PresetCard = memo(function PresetCard({
  preset,
  flavors,
  packageTypes,
  onEdit,
}: {
  preset: ContentPreset;
  flavors: Flavor[];
  packageTypes: PackageType[];
  onEdit: () => void;
}) {
  const packageType = packageFor(String(preset.packageTypeId), packageTypes);
  /*
   * Memoized because the panel above owns the editor's draft state: without
   * it, every keystroke in the preset name re-derives and re-renders a
   * 50-150 cube grid for every other card on the page.
   */
  const entries = useMemo(
    () => presetUnits(preset.flavors, packageType?.unitsPerPackage ?? 0),
    [preset.flavors, packageType?.unitsPerPackage],
  );
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-cream/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-bold text-ink">{preset.name}</h3>
          <span className="mt-1 flex w-fit items-center gap-1.5 rounded-full bg-tile-peach px-2 py-0.5 text-[10px] font-bold text-ink">
            {packageTypeIconElement(packageType?.unitsPerPackage ?? 0, 10)}
            {packageType?.name ?? "?"}
          </span>
        </div>
        <button
          onClick={onEdit}
          aria-label={`Edit ${preset.name}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition hover:bg-black hover:text-cream max-md:h-9 max-md:w-9"
        >
          <Pencil size={13} />
        </button>
      </div>

      <div className="rounded-xl bg-card p-2">
        <TrayPreview
          entries={entries}
          unitsPerPackage={packageType?.unitsPerPackage ?? 0}
          quantity={1}
          flavors={flavors}
          packageName={packageType?.name ?? "Package"}
        />
      </div>

      <p className="text-[11px] leading-tight text-ink-soft">
        {preset.flavors.length === 0
          ? "No flavours yet"
          : preset.flavors
              .map((f) => `${Math.round(f.share)}% ${flavors.find((x) => x.id === f.flavorId)?.name ?? "?"}`)
              .join(" · ")}
      </p>
    </div>
  );
});

function PresetEditor({
  draft,
  onChange,
  flavors,
  packageTypes,
  busy,
  onSave,
  onCancel,
  onArchive,
}: {
  draft: PresetDraft;
  onChange: (draft: PresetDraft) => void;
  flavors: Flavor[];
  packageTypes: PackageType[];
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onArchive?: () => void;
}) {
  const packageType = packageFor(draft.packageTypeId, packageTypes);
  const packed = packageType?.unitsPerPackage ?? 0;
  const remaining = packed - draft.flavors.reduce((sum, f) => sum + f.units, 0);

  function setUnits(flavorId: string, units: number) {
    onChange({ ...draft, flavors: setFlavorUnits(draft.flavors, flavorId, units), autoSplit: false });
  }

  function toggleFlavor(flavorId: string) {
    onChange({
      ...draft,
      flavors: toggleFlavorUnits(draft.flavors, flavorId, { autoSplit: draft.autoSplit, packed }),
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-cream/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          placeholder="Preset name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="w-44 rounded-lg border border-line bg-card px-2 py-1 text-sm max-md:py-2 font-semibold text-ink outline-none focus:border-accent"
        />
        <select
          aria-label="Package type"
          value={draft.packageTypeId}
          onChange={(e) => {
            // Re-split to the new tray size while still on auto, so
            // switching Small → Big doesn't leave 50 units in a 150 tray.
            const nextPacked = packageFor(e.target.value, packageTypes)?.unitsPerPackage ?? 0;
            onChange({
              ...draft,
              packageTypeId: e.target.value,
              flavors: draft.autoSplit
                ? evenSplit(draft.flavors.map((f) => f.flavorId), nextPacked)
                : draft.flavors,
            });
          }}
          className="rounded-full border border-line bg-card px-3 py-1 text-sm font-semibold text-ink outline-none focus:border-accent"
        >
          {packageTypes.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>

        <span className="text-xs text-ink-soft">
          = <span className="font-bold tabular-nums text-ink">{packed}</span> units
        </span>

        <span className="flex-1" />

        <span
          className={`text-[11px] font-semibold tabular-nums ${
            remaining === 0 ? "text-accent" : "text-amber-700"
          }`}
        >
          {remaining === 0
            ? "balanced"
            : remaining > 0
              ? `${remaining} unassigned`
              : `${-remaining} over`}
        </span>
      </div>

      {/* Flavours left, tray right — the same split as the order form's
          Content tab, so the two read as one editor in two places. */}
      {/* The flavour list above its preview on a phone, not beside it:
              `FlavorRow`'s own `max-md:` variants make its trailing fixed
              columns ~112px, so in a half-width column the flavour's name
              gets nothing. */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
        <div className="flex flex-col">
          {flavors
            .filter((f) => !f.archivedAt || draft.flavors.some((e) => e.flavorId === String(f.id)))
            .map((flavor) => (
              <FlavorRow
                key={flavor.id}
                flavor={flavor}
                units={draft.flavors.find((f) => f.flavorId === String(flavor.id))?.units ?? 0}
                packed={packed}
                onToggle={() => toggleFlavor(String(flavor.id))}
                onChange={(units) => setUnits(String(flavor.id), units)}
              />
            ))}
        </div>

        <div className="rounded-xl bg-card p-2.5">
          <TrayPreview
            entries={draft.flavors}
            unitsPerPackage={packed}
            quantity={1}
            flavors={flavors}
            packageName={packageType?.name ?? "Package"}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={busy || !draft.name.trim()}
          className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-cream disabled:opacity-40"
        >
          Save preset
        </button>
        <button onClick={onCancel} className="text-xs font-semibold text-ink-soft hover:text-ink">
          Cancel
        </button>
        <span className="flex-1" />
        {onArchive && (
          <button
            onClick={onArchive}
            disabled={busy}
            className="text-xs font-semibold text-ink-soft hover:text-amber-700"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
