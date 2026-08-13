"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { flavorGradient } from "@/lib/flavorStyle";
import { packageTypeIconElement } from "@/lib/icons";
import { FlavorSplitBar, type SplitEntry } from "@/components/FlavorSplitBar";
import { PresetSwatch } from "@/components/orders/PackageLineEditor";

/**
 * A preset being edited. Shares are held as SplitEntry so the same
 * draggable bar the order form uses can edit them — there the total is a
 * package's units, here it is a flat 100, so a "unit" is a percentage
 * point (see FlavorSplitBar).
 */
interface PresetDraft {
  name: string;
  packageTypeId: string;
  flavors: SplitEntry[];
}

const TOTAL_SHARE = 100;

function draftFrom(preset: ContentPreset): PresetDraft {
  return {
    name: preset.name,
    packageTypeId: String(preset.packageTypeId),
    flavors: preset.flavors.map((f) => ({ flavorId: String(f.flavorId), units: f.share })),
  };
}

/**
 * Settings → Presets. A preset is a package type plus a flavour recipe,
 * saved under a name the business already uses out loud ("Mix small") and
 * offered as a one-click chip in the order form.
 *
 * Editing one never touches orders already booked: applying a preset
 * copies it into ordinary order lines rather than linking to it (see
 * schema.sql's content_presets).
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
    setDraft({ name: "", packageTypeId: String(packageTypes[0]?.id ?? ""), flavors: [] });
  }

  function startEdit(preset: ContentPreset) {
    setEditing(preset.id);
    setDraft(draftFrom(preset));
  }

  function cancel() {
    setEditing(null);
    setDraft(null);
  }

  async function save() {
    if (!draft || !draft.name.trim() || !draft.packageTypeId) return;
    setBusy(true);
    const body = {
      name: draft.name.trim(),
      packageTypeId: Number(draft.packageTypeId),
      flavors: draft.flavors
        .filter((f) => f.units > 0)
        .map((f) => ({ flavorId: Number(f.flavorId), share: f.units })),
    };
    await fetch(editing === "new" ? "/api/settings/presets" : `/api/settings/presets/${editing}`, {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Presets</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            A package and its mix, saved together. Recipes are proportions, so one preset works for
            any quantity.
          </p>
        </div>
        <button
          onClick={() => (editing === "new" ? cancel() : startNew())}
          disabled={packageTypes.length === 0}
          className="shrink-0 rounded-full bg-black px-3 py-1 text-xs font-semibold text-cream disabled:opacity-40"
        >
          {editing === "new" ? "Cancel" : "+ Add preset"}
        </button>
      </div>

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

      <ul className="mt-4 flex flex-col gap-1.5">
        {presets.length === 0 && editing !== "new" && (
          <li className="text-xs text-ink-soft">
            No presets yet. Add the mixes you order most and they become one click on an order.
          </li>
        )}
        {presets.map((preset) =>
          editing === preset.id && draft ? (
            <li key={preset.id}>
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
            </li>
          ) : (
            <li key={preset.id}>
              <button
                onClick={() => startEdit(preset)}
                className="hover-line flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left"
              >
                <span className="w-32 shrink-0 truncate text-sm font-bold text-ink">{preset.name}</span>
                <PackageChip
                  packageType={packageTypes.find((p) => p.id === preset.packageTypeId)}
                />
                <PresetSwatch preset={preset} flavors={flavors} className="h-4 w-28" />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                  {preset.flavors.length === 0
                    ? "No flavours yet"
                    : preset.flavors
                        .map(
                          (f) =>
                            `${Math.round(f.share)}% ${
                              flavors.find((x) => x.id === f.flavorId)?.name ?? "?"
                            }`,
                        )
                        .join(" · ")}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function PackageChip({ packageType }: { packageType?: PackageType }) {
  return (
    <span className="keeps-color flex shrink-0 items-center gap-1.5 rounded-full bg-tile-peach px-2.5 py-1 text-[11px] font-bold text-ink">
      {packageTypeIconElement(packageType?.name ?? "", 12)}
      {packageType?.name ?? "?"}
    </span>
  );
}

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
  const assigned = draft.flavors.reduce((sum, f) => sum + f.units, 0);
  const leftover = TOTAL_SHARE - assigned;
  const unusedFlavors = flavors.filter(
    (f) => !f.archivedAt && !draft.flavors.some((entry) => entry.flavorId === String(f.id)),
  );

  return (
    <div className="rounded-xl border border-line bg-cream/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          placeholder="Preset name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="w-40 rounded-lg border border-line bg-card px-2 py-1 text-sm font-semibold text-ink outline-none focus:border-accent"
        />
        <select
          aria-label="Package type"
          value={draft.packageTypeId}
          onChange={(e) => onChange({ ...draft, packageTypeId: e.target.value })}
          className="rounded-full border border-line bg-card px-3 py-1 text-sm font-semibold text-ink outline-none focus:border-accent"
        >
          {packageTypes.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <span
          className={`text-[11px] font-semibold tabular-nums ${
            leftover === 0 ? "text-accent" : "text-amber-700"
          }`}
        >
          {leftover === 0 ? "100%" : `${assigned}% of 100%`}
        </span>
      </div>

      <div className="mt-2">
        <FlavorSplitBar
          entries={draft.flavors}
          total={TOTAL_SHARE}
          flavors={flavors}
          onChange={(entries) => onChange({ ...draft, flavors: entries })}
          leftoverLabel="unassigned"
          formatValue={(value) => `${value}%`}
        />
      </div>

      <div className="mt-1 flex flex-col">
        {draft.flavors.map((entry, index) => {
          const flavor = flavors.find((f) => String(f.id) === entry.flavorId);
          return (
            <div
              key={entry.flavorId}
              className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-card"
            >
              <span
                className="h-5 w-5 shrink-0 rounded-md shadow-sm"
                style={{ background: flavor ? flavorGradient(flavor) : "var(--color-ink-soft)" }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                {flavor?.name ?? "Unknown flavour"}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label={`${flavor?.name ?? "Flavour"} share`}
                value={entry.units}
                onChange={(e) => {
                  const share = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  onChange({
                    ...draft,
                    flavors: draft.flavors.map((f, i) => (i === index ? { ...f, units: share } : f)),
                  });
                }}
                className="w-14 rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-right text-xs font-bold tabular-nums text-ink outline-none hover:border-line hover:bg-card focus:border-accent focus:bg-card"
              />
              <span className="w-4 shrink-0 text-[10px] text-ink-soft">%</span>
              <button
                type="button"
                aria-label={`Remove ${flavor?.name ?? "flavour"}`}
                onClick={() =>
                  onChange({ ...draft, flavors: draft.flavors.filter((_, i) => i !== index) })
                }
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-soft opacity-0 transition group-hover:opacity-100 hover:bg-black hover:text-cream"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {unusedFlavors.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {unusedFlavors.map((flavor) => (
            <button
              key={flavor.id}
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  flavors: [
                    ...draft.flavors,
                    { flavorId: String(flavor.id), units: Math.max(0, leftover) },
                  ],
                })
              }
              className="flex items-center gap-1.5 rounded-full border border-line bg-card px-2 py-1 text-[11px] font-semibold text-ink transition hover:border-ink"
            >
              <span
                className="h-3.5 w-3.5 rounded shadow-sm"
                style={{ background: flavorGradient(flavor) }}
                aria-hidden
              />
              {flavor.name}
            </button>
          ))}
        </div>
      )}

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
