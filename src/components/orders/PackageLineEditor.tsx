"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import {
  type OrderLineFlavor,
  type OrderPackageLine,
  lineAssignedUnits,
  linePackedUnits,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { flavorBarGradient, flavorGradient } from "@/lib/flavorStyle";
import { packageTypeIconElement } from "@/lib/icons";
import { FlavorSplitBar } from "@/components/FlavorSplitBar";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * A package line plus the two things only the editor cares about: a
 * stable identity, so removing a line doesn't shift the one below it
 * under the cursor, and whether its numbers are being typed as units or
 * as percentages.
 *
 * The mode is deliberately not persisted. Units are what the order
 * means — a percentage is only how it was entered, and resolving it at
 * entry time keeps a saved order fixed if a package type's size is
 * edited later (see schema.sql's order_package_lines).
 */
export interface DraftPackageLine extends OrderPackageLine {
  uid: number;
  mode: "units" | "percent";
}

let nextUid = 1;

export function toDraftLines(lines: OrderPackageLine[]): DraftPackageLine[] {
  return lines.map((line) => ({ ...line, uid: nextUid++, mode: "units" }));
}

export function toPackageLines(draft: DraftPackageLine[]): OrderPackageLine[] {
  return draft.map(({ packageTypeId, quantity, flavors }) => ({
    packageTypeId,
    quantity,
    // A flavour dragged to nothing is a removal the user hasn't committed
    // yet: keep the row on screen, but don't save an empty allocation.
    flavors: flavors.filter((entry) => entry.units > 0),
  }));
}

/**
 * Turns a preset's proportions into a concrete one-package line. Rounding
 * drift lands on the largest share, so a preset always totals exactly one
 * package rather than leaving a stray unit unassigned.
 */
export function lineFromPreset(preset: ContentPreset, packageTypes: PackageType[]): DraftPackageLine {
  const packed = packageTypes.find((p) => p.id === preset.packageTypeId)?.unitsPerPackage ?? 0;
  const flavors: OrderLineFlavor[] = preset.flavors.map((entry) => ({
    flavorId: String(entry.flavorId),
    units: Math.round((entry.share / 100) * packed),
  }));
  const drift = packed - flavors.reduce((sum, f) => sum + f.units, 0);
  if (drift !== 0 && flavors.length > 0) {
    const biggest = flavors.reduce((a, b) => (b.units > a.units ? b : a));
    biggest.units += drift;
  }
  return {
    uid: nextUid++,
    packageTypeId: String(preset.packageTypeId),
    quantity: 1,
    mode: "units",
    flavors,
  };
}

/**
 * The order form's Content section: a list of package lines, each with
 * its own flavour split shown as a draggable bar and as numbers.
 *
 * The bar and the numbers are one control in two notations, not two
 * controls — both write the same units, so a drag updates the numbers and
 * a typed number moves the bar.
 */
export function PackageLineEditor({
  lines,
  onChange,
  flavors,
  packageTypes,
  presets,
}: {
  lines: DraftPackageLine[];
  onChange: (lines: DraftPackageLine[]) => void;
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
}) {
  const unitsPerPackage = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));

  function updateLine(uid: number, patch: Partial<DraftPackageLine>) {
    onChange(lines.map((line) => (line.uid === uid ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const [first] = packageTypes;
    if (!first) return;
    onChange([
      ...lines,
      { uid: nextUid++, packageTypeId: String(first.id), quantity: 1, mode: "units", flavors: [] },
    ]);
  }

  return (
    <div className="rounded-card bg-cream/60 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-sm font-bold text-ink">Content</h3>
        <p className="text-xs font-semibold text-ink-soft">
          {nf.format(lines.reduce((sum, line) => sum + linePackedUnits(line, unitsPerPackage), 0))} units
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="mt-2 text-xs text-ink-soft">
          Nothing yet — add a tray below, or start from a preset.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {lines.map((line) => (
            <LineCard
              key={line.uid}
              line={line}
              flavors={flavors}
              packageTypes={packageTypes}
              unitsPerPackage={unitsPerPackage}
              onPatch={(patch) => updateLine(line.uid, patch)}
              onRemove={() => onChange(lines.filter((l) => l.uid !== line.uid))}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addLine}
          className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream transition hover:opacity-85"
        >
          + Add package
        </button>
        {presets.length > 0 && <span className="text-xs text-ink-soft">or start from a preset:</span>}
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange([...lines, lineFromPreset(preset, packageTypes)])}
            className="flex items-center gap-2 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-ink"
          >
            <PresetSwatch preset={preset} flavors={flavors} />
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A preset's recipe as a miniature of the bar it will produce. */
export function PresetSwatch({
  preset,
  flavors,
  className = "h-3.5 w-9",
}: {
  preset: ContentPreset;
  flavors: Pick<Flavor, "id" | "colorGlow" | "colorBase" | "colorShadow">[];
  className?: string;
}) {
  return (
    <span className={`flex shrink-0 overflow-hidden rounded ${className}`} aria-hidden>
      {preset.flavors.map((entry, i) => {
        const flavor = flavors.find((f) => f.id === entry.flavorId);
        return (
          <span
            key={i}
            style={{
              flex: `0 0 ${entry.share}%`,
              background: flavor ? flavorBarGradient(flavor) : "var(--color-ink-soft)",
            }}
          />
        );
      })}
    </span>
  );
}

function LineCard({
  line,
  flavors,
  packageTypes,
  unitsPerPackage,
  onPatch,
  onRemove,
}: {
  line: DraftPackageLine;
  flavors: Flavor[];
  packageTypes: PackageType[];
  unitsPerPackage: Map<number, number>;
  onPatch: (patch: Partial<DraftPackageLine>) => void;
  onRemove: () => void;
}) {
  const packed = linePackedUnits(line, unitsPerPackage);
  const remaining = packed - lineAssignedUnits(line);
  const packageType = packageTypes.find((p) => String(p.id) === line.packageTypeId);

  // Archived flavours are excluded from the picker but still render on a
  // line that already uses one — an old order keeps its original mix.
  const unusedFlavors = flavors.filter(
    (f) => !f.archivedAt && !line.flavors.some((entry) => entry.flavorId === String(f.id)),
  );

  function setFlavors(next: OrderLineFlavor[]) {
    onPatch({ flavors: next });
  }

  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/[0.06] text-ink">
          {packageTypeIconElement(packageType?.name ?? "", 16)}
        </span>

        <select
          aria-label="Package type"
          value={line.packageTypeId}
          onChange={(e) => onPatch({ packageTypeId: e.target.value })}
          className="rounded-full border border-line bg-cream px-3 py-1 text-sm font-semibold text-ink outline-none focus:border-accent"
        >
          {packageTypes.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>

        <span className="flex shrink-0 items-center gap-1">
          <StepButton
            label="One less package"
            disabled={line.quantity <= 1}
            onClick={() => onPatch({ quantity: Math.max(1, line.quantity - 1) })}
          >
            <Minus size={13} />
          </StepButton>
          <input
            type="number"
            min={1}
            aria-label="Number of packages"
            value={line.quantity}
            onChange={(e) => onPatch({ quantity: Math.max(1, Number(e.target.value) || 1) })}
            className="w-14 rounded-lg border border-line bg-cream px-2 py-1 text-center text-sm font-semibold text-ink outline-none focus:border-accent"
          />
          <StepButton label="One more package" onClick={() => onPatch({ quantity: line.quantity + 1 })}>
            <Plus size={13} />
          </StepButton>
        </span>

        <span className="text-xs text-ink-soft">
          = <span className="font-bold tabular-nums text-ink">{nf.format(packed)}</span> units
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
              ? `${nf.format(remaining)} unassigned`
              : `${nf.format(-remaining)} over`}
        </span>

        <ModeSwitch mode={line.mode} onChange={(mode) => onPatch({ mode })} />

        <button
          type="button"
          aria-label="Remove this package"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-black hover:text-cream"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-2">
        <FlavorSplitBar entries={line.flavors} total={packed} flavors={flavors} onChange={setFlavors} />
      </div>

      {line.flavors.length > 0 && (
        <div className="mt-1 flex flex-col">
          {line.flavors.map((entry, index) => (
            <FlavorRow
              key={entry.flavorId}
              entry={entry}
              flavor={flavors.find((f) => String(f.id) === entry.flavorId)}
              packed={packed}
              mode={line.mode}
              onChangeUnits={(units) =>
                setFlavors(line.flavors.map((e, i) => (i === index ? { ...e, units } : e)))
              }
              onRemove={() => setFlavors(line.flavors.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      )}

      {unusedFlavors.length > 0 && (
        <AddFlavorButton
          flavors={unusedFlavors}
          onPick={(flavorId) =>
            setFlavors([...line.flavors, { flavorId: String(flavorId), units: Math.max(0, remaining) }])
          }
        />
      )}
    </div>
  );
}

function FlavorRow({
  entry,
  flavor,
  packed,
  mode,
  onChangeUnits,
  onRemove,
}: {
  entry: OrderLineFlavor;
  flavor?: Flavor;
  packed: number;
  mode: DraftPackageLine["mode"];
  onChangeUnits: (units: number) => void;
  onRemove: () => void;
}) {
  const percent = packed > 0 ? Math.round((entry.units / packed) * 100) : 0;

  return (
    <div className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-cream/70">
      <span
        className="h-5 w-5 shrink-0 rounded-md shadow-sm"
        style={{ background: flavor ? flavorGradient(flavor) : "var(--color-ink-soft)" }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
        {flavor?.name ?? "Unknown flavour"}
      </span>

      {/* In percent mode the resolved units stay on screen — the saved
          order is in units, so hiding them would hide what's being saved. */}
      {mode === "percent" && (
        <span className="text-[11px] tabular-nums text-ink-soft">{nf.format(entry.units)} units</span>
      )}

      <input
        type="number"
        min={0}
        aria-label={`${flavor?.name ?? "Flavour"} amount`}
        value={mode === "percent" ? percent : entry.units}
        onChange={(e) => {
          const raw = Math.max(0, Number(e.target.value) || 0);
          onChangeUnits(mode === "percent" ? Math.round((raw / 100) * packed) : raw);
        }}
        className="w-16 rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-right text-xs font-bold tabular-nums text-ink outline-none hover:border-line hover:bg-card focus:border-accent focus:bg-card"
      />
      <span className="w-14 shrink-0 text-[10px] text-ink-soft">
        {mode === "percent" ? "% of pack" : "units"}
      </span>

      <button
        type="button"
        aria-label={`Remove ${flavor?.name ?? "flavour"}`}
        onClick={onRemove}
        className="flex h-6 w-6 items-center justify-center rounded-full text-ink-soft opacity-0 transition group-hover:opacity-100 hover:bg-black hover:text-cream"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * Adding a flavour is a picker rather than the old always-visible list of
 * every flavour: that list is now repeated per package line, so showing
 * all of them would bury a two-flavour order in empty rows.
 */
function AddFlavorButton({
  flavors,
  onPick,
}: {
  flavors: Flavor[];
  onPick: (flavorId: number) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 rounded-full border border-dashed border-line px-3 py-1 text-[11px] font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
      >
        + Add flavour
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {flavors.map((flavor) => (
        <button
          key={flavor.id}
          type="button"
          onClick={() => {
            onPick(flavor.id);
            setOpen(false);
          }}
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
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-soft hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}

/**
 * Units or percent, per line rather than per form: an order can hold one
 * tray sized by a customer's headcount and another quoted as "a third
 * mix", and forcing both into one notation is what made the old single
 * flavour list awkward.
 *
 * The bar is identical in either mode — only the numbers beside it change
 * what they read as.
 */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: DraftPackageLine["mode"];
  onChange: (mode: DraftPackageLine["mode"]) => void;
}) {
  return (
    <div className="flex shrink-0 gap-0.5 rounded-full bg-cream p-0.5">
      {(["units", "percent"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
            mode === option ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {option === "units" ? "units" : "%"}
        </button>
      ))}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-line text-ink transition hover:bg-black hover:text-cream disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink"
    >
      {children}
    </button>
  );
}
