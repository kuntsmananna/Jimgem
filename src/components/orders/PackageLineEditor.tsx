"use client";

import { ChevronDown, ChevronRight, Minus, Plus, X } from "lucide-react";
import {
  type OrderLineFlavor,
  type OrderPackageLine,
  lineAssignedUnits,
  linePackedUnits,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { flavorBarGradient, flavorGradient } from "@/lib/flavorStyle";
import { packageTypeIconElement } from "@/lib/icons";
import { TrayPreview } from "./TrayPreview";

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
  /** Collapsed to a one-line summary. Set on the others when a new package is added. */
  folded: boolean;
}

let nextUid = 1;

export function toDraftLines(lines: OrderPackageLine[]): DraftPackageLine[] {
  // Everything arrives folded on an existing order: you are usually
  // opening it to read, not to re-mix every tray.
  return lines.map((line) => ({ ...line, uid: nextUid++, mode: "units", folded: true }));
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
    folded: false,
    flavors,
  };
}

/**
 * The order form's Content section: a list of package lines, one open at
 * a time. Each open line puts every flavour on the left with its
 * percentage and unit count, and a picture of the packed tray on the
 * right (see TrayPreview).
 *
 * The split bar this replaced showed proportions but never the product.
 * FlavorSplitBar still exists — Settings' preset editor uses it, where
 * there is no tray to draw.
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

  /**
   * Only one line is ever open. Adding or unfolding folds the rest, so the
   * form stays one editor tall no matter how many packages an order has.
   */
  function openOnly(uid: number, incoming: DraftPackageLine[] = lines) {
    onChange(incoming.map((line) => ({ ...line, folded: line.uid !== uid })));
  }

  function addLine(line: DraftPackageLine) {
    openOnly(line.uid, [...lines, line]);
  }

  function addBlankLine() {
    const [first] = packageTypes;
    if (!first) return;
    addLine({
      uid: nextUid++,
      packageTypeId: String(first.id),
      quantity: 1,
      mode: "units",
      folded: false,
      flavors: [],
    });
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
              onToggleFold={() =>
                line.folded ? openOnly(line.uid) : updateLine(line.uid, { folded: true })
              }
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addBlankLine}
          className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream transition hover:opacity-85"
        >
          + Add package
        </button>
        {presets.length > 0 && <span className="text-xs text-ink-soft">or start from a preset:</span>}
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => addLine(lineFromPreset(preset, packageTypes))}
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

/**
 * One package line. Collapsed it is a single summary row; expanded it is
 * the editor — the flavour list on the left, the packed tray on the
 * right.
 *
 * Folding exists because an order of three different trays otherwise
 * stacks three full editors, and only the one being worked on matters.
 */
function LineCard({
  line,
  flavors,
  packageTypes,
  unitsPerPackage,
  onPatch,
  onRemove,
  onToggleFold,
}: {
  line: DraftPackageLine;
  flavors: Flavor[];
  packageTypes: PackageType[];
  unitsPerPackage: Map<number, number>;
  onPatch: (patch: Partial<DraftPackageLine>) => void;
  onRemove: () => void;
  onToggleFold: () => void;
}) {
  const packed = linePackedUnits(line, unitsPerPackage);
  const assigned = lineAssignedUnits(line);
  const remaining = packed - assigned;
  const packageType = packageTypes.find((p) => String(p.id) === line.packageTypeId);

  function setUnits(flavorId: string, units: number) {
    const existing = line.flavors.find((f) => f.flavorId === flavorId);
    if (units <= 0) {
      onPatch({ flavors: line.flavors.filter((f) => f.flavorId !== flavorId) });
    } else if (existing) {
      onPatch({ flavors: line.flavors.map((f) => (f.flavorId === flavorId ? { ...f, units } : f)) });
    } else {
      onPatch({ flavors: [...line.flavors, { flavorId, units }] });
    }
  }

  if (line.folded) {
    return (
      <button
        type="button"
        onClick={onToggleFold}
        className="hover-line flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2 text-left"
      >
        <ChevronRight size={14} className="shrink-0 text-ink-soft" />
        <span className="keeps-color flex shrink-0 items-center gap-1.5 rounded-full bg-tile-peach px-2.5 py-0.5 text-[11px] font-bold text-ink">
          {packageTypeIconElement(packageType?.name ?? "", 12)}
          {line.quantity}× {packageType?.name ?? "?"}
        </span>
        <FoldedMix line={line} flavors={flavors} packed={packed} />
        <span className="flex-1" />
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-soft">
          {nf.format(packed)}u
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleFold}
          aria-label="Fold this package"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-black hover:text-cream"
        >
          <ChevronDown size={14} />
        </button>

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

        <NumberStepper
          label="packages"
          value={line.quantity}
          min={1}
          onChange={(quantity) => onPatch({ quantity })}
        />

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

      {/* Flavours left, tray right — the numbers and the picture of the
          same thing, side by side. */}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div className="flex flex-col">
          {flavors
            .filter((f) => !f.archivedAt || line.flavors.some((e) => e.flavorId === String(f.id)))
            .map((flavor) => (
              <FlavorRow
                key={flavor.id}
                flavor={flavor}
                units={line.flavors.find((f) => f.flavorId === String(flavor.id))?.units ?? 0}
                packed={packed}
                mode={line.mode}
                remaining={remaining}
                onChange={(units) => setUnits(String(flavor.id), units)}
              />
            ))}
        </div>

        <div className="rounded-xl bg-cream/60 p-2.5">
          <TrayPreview
            entries={line.flavors}
            unitsPerPackage={unitsPerPackage.get(Number(line.packageTypeId)) ?? 0}
            quantity={line.quantity}
            flavors={flavors}
            packageName={packageType?.name ?? "Package"}
          />
        </div>
      </div>
    </div>
  );
}

/** The mix as colour proportions, for a folded line. */
function FoldedMix({
  line,
  flavors,
  packed,
}: {
  line: DraftPackageLine;
  flavors: Flavor[];
  packed: number;
}) {
  if (line.flavors.length === 0) {
    return <span className="text-[11px] text-ink-soft">No flavours yet</span>;
  }
  return (
    <>
      <span className="flex h-3.5 w-20 shrink-0 overflow-hidden rounded" aria-hidden>
        {line.flavors.map((entry, i) => {
          const flavor = flavors.find((f) => String(f.id) === entry.flavorId);
          return (
            <span
              key={i}
              style={{
                flex: `0 0 ${packed > 0 ? (entry.units / packed) * 100 : 0}%`,
                background: flavor ? flavorBarGradient(flavor) : "var(--color-ink-soft)",
              }}
            />
          );
        })}
      </span>
      <span className="min-w-0 truncate text-[11px] text-ink-soft">
        {line.flavors
          .map((entry) => {
            const name = flavors.find((f) => String(f.id) === entry.flavorId)?.name ?? "?";
            return `${packed > 0 ? Math.round((entry.units / packed) * 100) : 0}% ${name}`;
          })
          .join(" · ")}
      </span>
    </>
  );
}

/**
 * Every flavour is listed, whether or not it's in the mix — the old
 * "add flavour" picker meant two clicks and a menu to do what typing a
 * number should. A flavour at zero is simply dim.
 *
 * Both the percentage and the unit count are always visible: percent is
 * how the mix is usually described, units are what actually gets saved.
 */
function FlavorRow({
  flavor,
  units,
  packed,
  mode,
  remaining,
  onChange,
}: {
  flavor: Flavor;
  units: number;
  packed: number;
  mode: DraftPackageLine["mode"];
  remaining: number;
  onChange: (units: number) => void;
}) {
  const active = units > 0;
  const percent = packed > 0 ? Math.round((units / packed) * 100) : 0;

  return (
    <div
      className={`group flex items-center gap-2 rounded-lg px-1 py-1 transition ${
        active ? "" : "opacity-45 hover:opacity-90"
      } hover:bg-cream/70`}
    >
      {/* Clicking the name adds the flavour at whatever is unassigned, so
          a one-flavour tray is a single click. */}
      <button
        type="button"
        onClick={() => onChange(active ? 0 : Math.max(0, remaining))}
        title={active ? `Remove ${flavor.name}` : `Fill the rest with ${flavor.name}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className="h-5 w-5 shrink-0 rounded-md shadow-sm"
          style={{ background: flavorGradient(flavor) }}
          aria-hidden
        />
        <span className="min-w-0 truncate text-xs font-semibold text-ink">{flavor.name}</span>
      </button>

      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
        {active ? `${percent}%` : ""}
      </span>

      <input
        type="number"
        min={0}
        aria-label={`${flavor.name} ${mode === "percent" ? "percent" : "units"}`}
        value={mode === "percent" ? (active ? percent : "") : active ? units : ""}
        placeholder="0"
        onChange={(e) => {
          const raw = Math.max(0, Number(e.target.value) || 0);
          /*
           * Floor, not round: a tray rarely divides evenly — 25% of a
           * 50-cube tray is 12.5 — and rounding each share up made four
           * equal quarters total 52, reporting the line "2 over" a tray
           * that physically cannot hold them. Flooring leaves the
           * remainder unassigned instead, which is both true and
           * fixable by nudging one flavour up.
           */
          onChange(mode === "percent" ? Math.floor((raw / 100) * packed) : raw);
        }}
        className="w-14 rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-right text-xs font-bold tabular-nums text-ink outline-none hover:border-line hover:bg-card focus:border-accent focus:bg-card"
      />
      <span className="w-8 shrink-0 text-[10px] text-ink-soft">{mode === "percent" ? "%" : "u"}</span>
    </div>
  );
}

/** A number field with the +/- buttons beside it. Shared by quantity, guests and mirrors. */
export function NumberStepper({
  label,
  value,
  min = 0,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: number | null;
  min?: number;
  onChange: (value: number) => void;
  allowEmpty?: boolean;
}) {
  const current = value ?? min;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <StepButton
        label={`One less ${label}`}
        disabled={current <= min}
        onClick={() => onChange(Math.max(min, current - 1))}
      >
        <Minus size={13} />
      </StepButton>
      <input
        type="number"
        min={min}
        aria-label={`Number of ${label}`}
        value={allowEmpty && value === null ? "" : current}
        placeholder={allowEmpty ? "—" : undefined}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        className="w-14 rounded-lg border border-line bg-cream px-2 py-1 text-center text-sm font-semibold text-ink outline-none focus:border-accent"
      />
      <StepButton label={`One more ${label}`} onClick={() => onChange(current + 1)}>
        <Plus size={13} />
      </StepButton>
    </span>
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
