"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Plus, Search, Trash2 } from "lucide-react";
import {
  type OrderPackageLine,
  evenSplit,
  lineAssignedUnits,
  linePackedUnits,
  matchingPreset,
  presetUnits,
  setFlavorUnits,
  toggleFlavorUnits,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { flavorBarGradient, flavorGradient } from "@/lib/flavorStyle";
import { packageTypeIconElement } from "@/lib/icons";
import { TextInput } from "@/components/Field";
import { usePopoverDismiss } from "@/components/useOverlayDismiss";
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
  /**
   * While true, picking flavours re-splits the tray evenly between them —
   * three flavours means thirds. Typing a number or dragging a slider is
   * a deliberate ratio, so it turns this off and later picks stop
   * disturbing what was set by hand.
   */
  autoSplit: boolean;
  /**
   * The preset this line is currently *being* — the id of one of the
   * owner's saved mixes, or null for a line built by hand.
   *
   * A preset is quick setup, not something the order stores (see
   * `matchingPreset`): it is copied into an ordinary line. This only says
   * how the line is being *edited* — locked to a quantity while it still
   * matches the saved mix, or opened up and edited freely once broken.
   */
  presetId: number | null;
}

let nextUid = 1;

export function toDraftLines(
  lines: OrderPackageLine[],
  presets: ContentPreset[],
  unitsPerPackage: Map<number, number>,
): DraftPackageLine[] {
  // Everything arrives folded on an existing order: you are usually
  // opening it to read, not to re-mix every tray.
  return lines.map((line) => ({
    ...line,
    uid: nextUid++,
    mode: "units",
    folded: true,
    // Recognised by contents, so a line booked from a saved mix comes
    // back as that mix rather than as a flavour list to re-read.
    presetId: matchingPreset(line, presets, unitsPerPackage)?.id ?? null,
    // Off once the line already carries a split, because those ratios were
    // decided before and re-splitting them the moment a flavour is added
    // would overwrite them. A line with no flavours yet has nothing to
    // protect, so it behaves like a fresh one and spreads evenly.
    autoSplit: line.flavors.length === 0,
  }));
}

export function toPackageLines(draft: DraftPackageLine[]): OrderPackageLine[] {
  return draft.map(({ packageTypeId, quantity, flavors, packagePrice }) => ({
    packageTypeId,
    quantity,
    packagePrice: packagePrice ?? null,
    // A flavour dragged to nothing is a removal the user hasn't committed
    // yet: keep the row on screen, but don't save an empty allocation.
    flavors: flavors.filter((entry) => entry.units > 0),
  }));
}

/**
 * Turns a preset's proportions into a concrete one-package line.
 *
 * The preset's **price is copied onto the line**, not linked: repricing a
 * preset must never change an order already booked, which is the same
 * rule its recipe follows (see CLAUDE.md on content_presets). A preset
 * with no price leaves the line null, and it falls back to per-unit tier
 * pricing like any hand-built package.
 */
export function lineFromPreset(preset: ContentPreset, packageTypes: PackageType[]): DraftPackageLine {
  const packed = packageTypes.find((p) => p.id === preset.packageTypeId)?.unitsPerPackage ?? 0;
  const flavors = presetUnits(preset.flavors, packed);
  return {
    uid: nextUid++,
    packageTypeId: String(preset.packageTypeId),
    packagePrice: preset.price,
    presetId: preset.id,
    quantity: 1,
    mode: "units",
    // Closed on arrival: a preset is a decision already made, so there is
    // nothing to edit but how many of them. Breaking it opens the editor.
    folded: true,
    // A preset is a deliberate recipe, so picking another flavour after
    // applying one must not re-split it into equal shares.
    autoSplit: false,
    flavors,
  };
}

/**
 * The order form's Content section: a list of package lines, one open at
 * a time. Each open line puts every flavour on the left with its
 * percentage and unit count, and a picture of the packed tray on the
 * right (see TrayPreview).
 *
 * The draggable split bar this replaced showed proportions but never the
 * product. Settings' preset editor now draws the same tray, so the bar
 * had no remaining caller and is gone.
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
    // A locked preset has no editor to open, so adding one folds the rest
    // without unfolding it.
    const next = [...lines, line];
    if (line.presetId !== null) onChange(next.map((l) => ({ ...l, folded: true })));
    else openOnly(line.uid, next);
  }

  function addBlankLine() {
    /*
     * The smallest live package, not simply the first one in the list.
     *
     * `packageTypes` arrives with archived rows included so existing lines
     * can still resolve their size, so the first entry can easily be one
     * that was retired — which is how a new package started out as a
     * retired 100-unit box. Smallest because a new line should commit to
     * as little as possible: scaling up is a keystroke, and noticing that
     * a blank line already said 100 units is not.
     */
    const smallest = packageTypes
      .filter((type) => !type.archivedAt)
      .reduce<PackageType | null>(
        (best, type) => (best === null || type.unitsPerPackage < best.unitsPerPackage ? type : best),
        null,
      );
    if (!smallest) return;
    addLine({
      uid: nextUid++,
      packageTypeId: String(smallest.id),
      quantity: 1,
      mode: "units",
      folded: false,
      autoSplit: true,
      presetId: null,
      flavors: [],
    });
  }

  return (
    /*
      No heading and no unit total: the tab this sits in is already called
      Content and already carries the count. An empty order is then exactly
      its two ways in — add a package, or start from a preset — with nothing
      else to read first.
    */
    <div className="rounded-card bg-cream/60 p-4">
      {lines.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {lines.map((line) => (
            <LineCard
              key={line.uid}
              line={line}
              flavors={flavors}
              packageTypes={packageTypes}
              preset={presets.find((p) => p.id === line.presetId)}
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addBlankLine}
          className="shrink-0 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream transition hover:opacity-85"
        >
          + Add package
        </button>
        <PresetRow
          presets={presets}
          flavors={flavors}
          onApply={(preset) => addLine(lineFromPreset(preset, packageTypes))}
        />
      </div>
    </div>
  );
}

/**
 * The preset catalog as one non-wrapping row, with whatever doesn't fit
 * behind a searchable overflow list.
 *
 * There are fifteen saved mixes and the list only grows. Wrapped, they
 * were four rows of pills that pushed "Add package" and the packages
 * themselves down the panel, and gave every preset the same weight as
 * every other — which is the opposite of what a shortcut is for. One row
 * keeps the shortcuts to hand and the search covers the rest, including
 * the ones that did fit: hunting for "9 Mix" shouldn't depend on whether
 * it happened to land inside the fold.
 *
 * How many fit is measured rather than guessed. A hidden copy of the full
 * row is what gets measured, because a chip removed from the visible row
 * is `display: none` and reports no width at all — so the widths have to
 * come from somewhere that always draws all of them.
 */
function PresetRow({
  presets,
  flavors,
  onApply,
}: {
  presets: ContentPreset[];
  flavors: Flavor[];
  onApply: (preset: ContentPreset) => void;
}) {
  const [fits, setFits] = useState(presets.length);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;

    const recompute = () => {
      const widths = Array.from(measure.children).map((chip) => (chip as HTMLElement).offsetWidth);
      const available = row.clientWidth;
      let used = 0;
      let count = 0;
      for (const width of widths) {
        const next = used + (count > 0 ? CHIP_GAP : 0) + width;
        // Anything still to come has to leave room for the control that
        // will hold it, or the last chip fits and the "+3" it needs
        // doesn't.
        const spare = count + 1 < widths.length ? CHIP_GAP + OVERFLOW_WIDTH : 0;
        if (next + spare > available) break;
        used = next;
        count += 1;
      }
      setFits(count);
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(row);
    return () => observer.disconnect();
  }, [presets]);

  if (presets.length === 0) return null;
  const hidden = presets.length - fits;

  return (
    /*
      `min-w-0` is load-bearing: without it a non-wrapping flex child sizes
      to its content and pushes the whole panel wider instead of being the
      thing that overflows, and `overflow-hidden` alone will not stop it.
    */
    <div ref={rowRef} className="flex min-w-0 flex-1 items-center gap-2">
      {/*
        Only the chips are clipped. The overflow control sits outside that
        box on purpose: inside it, `overflow-hidden` cut off the popover it
        opens, which appeared as a shadow with nothing in it.
      */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {presets.slice(0, fits).map((preset) => (
          <PresetChip key={preset.id} preset={preset} flavors={flavors} onApply={onApply} />
        ))}
      </div>
      {hidden > 0 && <PresetOverflow presets={presets} flavors={flavors} hidden={hidden} onApply={onApply} />}

      {/* Never seen; only measured. Absolute so it takes no space, and
          `invisible` rather than hidden so its chips still have widths. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible fixed top-0 left-0 flex items-center gap-2"
      >
        {presets.map((preset) => (
          <PresetChip key={preset.id} preset={preset} flavors={flavors} onApply={() => {}} />
        ))}
      </div>
    </div>
  );
}

/** Matches the `gap-2` and the overflow button below, in px. */
const CHIP_GAP = 8;
const OVERFLOW_WIDTH = 44;
/** Roughly what the overflow list needs, for deciding which way it opens. */
const LIST_HEIGHT = 280;

function PresetChip({
  preset,
  flavors,
  onApply,
}: {
  preset: ContentPreset;
  flavors: Flavor[];
  onApply: (preset: ContentPreset) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onApply(preset)}
      className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-ink transition hover:border-ink"
    >
      <PresetSwatch preset={preset} flavors={flavors} />
      {preset.name}
    </button>
  );
}

/** Everything, searchable — not only what fell off the end of the row. */
function PresetOverflow({
  presets,
  flavors,
  hidden,
  onApply,
}: {
  presets: ContentPreset[];
  flavors: Flavor[];
  hidden: number;
  onApply: (preset: ContentPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /**
   * Which way the list opens. Measured rather than fixed: this control
   * sits under the packages, so it is near the bottom of a tall order and
   * near the top of an empty one — and on a 13" laptop, opening upwards
   * from the top of the panel put the search box above the window.
   */
  const [up, setUp] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, containerRef, () => setOpen(false));

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = containerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    // Upwards only when the room is actually there; below is the default
    // a dropdown is read as having.
    setUp(window.innerHeight - trigger.bottom < LIST_HEIGHT && trigger.top > LIST_HEIGHT);
  }, [open]);

  const matches = presets.filter((preset) =>
    preset.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`${hidden} more preset${hidden === 1 ? "" : "s"}`}
        className="flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-ink-soft transition hover:border-ink hover:text-ink"
      >
        +{hidden}
      </button>

      {open && (
        // Right-aligned, so a list wider than a "+10" button grows back
        // over the chips it belongs to rather than off the panel's edge.
        <div
          className={`absolute right-0 z-30 w-64 rounded-2xl border border-line bg-card p-2 shadow-xl ${
            up ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          <label className="relative mb-1.5 flex items-center">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-ink-soft" aria-hidden />
            <TextInput
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search presets"
              placeholder="Search presets"
              className="w-full pl-7 text-xs"
            />
          </label>
          <div className="max-h-56 overflow-y-auto">
            {matches.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-ink-soft">Nothing by that name.</p>
            )}
            {matches.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onApply(preset);
                  setOpen(false);
                }}
                className="hover-line flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold text-ink"
              >
                <PresetSwatch preset={preset} flavors={flavors} />
                <span className="min-w-0 truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A preset's recipe as a miniature of the bar it will produce. */
function PresetSwatch({
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
  preset,
  unitsPerPackage,
  onPatch,
  onRemove,
  onToggleFold,
}: {
  line: DraftPackageLine;
  flavors: Flavor[];
  packageTypes: PackageType[];
  /** The saved mix this line is locked to, if any. */
  preset: ContentPreset | undefined;
  unitsPerPackage: Map<number, number>;
  onPatch: (patch: Partial<DraftPackageLine>) => void;
  onRemove: () => void;
  onToggleFold: () => void;
}) {
  const packed = linePackedUnits(line, unitsPerPackage);
  const assigned = lineAssignedUnits(line);
  const remaining = packed - assigned;
  const packageType = packageTypes.find((p) => String(p.id) === line.packageTypeId);

  /*
   * Which of the two ways this line is being sized — inferred from what
   * it holds, never stored.
   *
   * A one-off total *is* N of a 1-unit package: same rows, same units, so
   * there is nothing extra to save and an order booked before this
   * existed already reads correctly. A flag would only be a second
   * account of the same fact, free to disagree with it.
   */
  const singleUnit = packageTypes.find((p) => p.unitsPerPackage === 1 && !p.archivedAt);
  const smallestPackage = packageTypes
    .filter((p) => !p.archivedAt && p.unitsPerPackage > 1)
    .reduce<PackageType | null>(
      (best, type) => (best === null || type.unitsPerPackage < best.unitsPerPackage ? type : best),
      null,
    );
  const custom = packageType?.unitsPerPackage === 1;

  /**
   * A number typed or dragged is a deliberate ratio, so it also switches
   * the line off auto-split — otherwise picking one more flavour would
   * immediately overwrite what was just set by hand.
   */
  function setUnits(flavorId: string, units: number) {
    onPatch({ flavors: setFlavorUnits(line.flavors, flavorId, units), autoSplit: false });
  }

  function toggleFlavor(flavorId: string) {
    onPatch({
      flavors: toggleFlavorUnits(line.flavors, flavorId, { autoSplit: line.autoSplit, packed }),
    });
  }

  /**
   * Resizing the tray while still on auto-split re-divides it, so three
   * flavours in one small tray stay thirds when it becomes two big ones.
   * Without this the units stay as they were and the line silently goes
   * unbalanced against a package the user only just changed.
   */
  function resize(patch: Partial<DraftPackageLine>, nextPacked: number) {
    onPatch(
      line.autoSplit
        ? { ...patch, flavors: evenSplit(line.flavors.map((f) => f.flavorId), nextPacked) }
        : patch,
    );
  }

  /*
   * A line locked to a preset: how many, and nothing else.
   *
   * The recipe is a decision already made, so offering the flavour editor
   * beside it invites re-deciding it by accident. Breaking the line is the
   * deliberate way in — it drops the lock and leaves an ordinary line
   * holding exactly what the preset put there, editable like any other.
   *
   * A preset that has since been deleted simply stops resolving, and the
   * line falls through to the ordinary card below: locking something that
   * can no longer be named would be worse than unlocking it.
   */
  if (preset) {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2">
        <span className="keeps-color flex shrink-0 items-center gap-1.5 rounded-full bg-tile-lavender px-2.5 py-0.5 text-[11px] font-bold text-ink">
          <PresetSwatch preset={preset} flavors={flavors} className="h-3 w-6" />
          {preset.name}
        </span>

        <NumberStepper
          label="packages"
          value={line.quantity}
          min={1}
          onChange={(quantity) => onPatch({ quantity: quantity, flavors: presetUnits(preset.flavors, (unitsPerPackage.get(Number(line.packageTypeId)) ?? 0) * quantity) })}
        />

        <span className="text-xs text-ink-soft">
          = <span className="font-bold tabular-nums text-ink">{nf.format(packed)}</span> units
        </span>

        <span className="flex-1" />

        {/* A preset's shares are floored into whole cubes, so a recipe
            that doesn't divide evenly leaves a cube or two spare. Said
            here rather than silently, since the line has no editor to
            open and go looking in. */}
        <LineCoverage remaining={remaining} packed={packed} />

        <button
          type="button"
          onClick={() => onPatch({ presetId: null, folded: false })}
          title="Edit this package's own mix, leaving the preset behind"
          className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
        >
          Break apart
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${preset.name}`}
          title="Remove this package"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-red-600 hover:text-white"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  if (line.folded) {
    return (
      // A div, not a button: the row opens on click but carries a delete
      // control, and a button inside a button is invalid and swallows the
      // inner click in some browsers.
      <div className="hover-line flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2 text-left">
        <button
          type="button"
          onClick={onToggleFold}
          aria-label="Open this package"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRight size={14} className="shrink-0 text-ink-soft" />
          <span className="keeps-color flex shrink-0 items-center gap-1.5 rounded-full bg-tile-peach px-2.5 py-0.5 text-[11px] font-bold text-ink">
            {packageTypeIconElement(packageType?.unitsPerPackage ?? 0, 12)}
            {line.quantity}× {packageType?.name ?? "?"}
          </span>
          <FoldedMix line={line} flavors={flavors} packed={packed} />
          <span className="flex-1" />
          {/* The warning survives folding. A package whose flavours don't
              add up is exactly the one you'd close and forget, and the
              summary row is where you'd look for it. */}
          <LineCoverage remaining={remaining} packed={packed} />
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-soft">
            {nf.format(packed)}u
          </span>
        </button>
        {/* Deleting a package you can see the summary of shouldn't mean
            opening it first. */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${line.quantity}× ${packageType?.name ?? "package"}`}
          title="Remove this package"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-red-600 hover:text-white"
        >
          <Trash2 size={13} />
        </button>
      </div>
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
          {packageTypeIconElement(packageType?.unitsPerPackage ?? 0, 16)}
        </span>

        {/*
          First and loudest, because it decides what every control after
          it means: a count of packages, or one agreed total. Reading the
          row left to right then goes "this is a Package line — of this
          size — this many", which is the order the decision is actually
          made in.
        */}
        {singleUnit && smallestPackage && (
          <SizingSwitch
            custom={custom}
            onChange={(toCustom) =>
              toCustom
                ? // The total is preserved exactly: N cubes of a 1-unit
                  // package is the same jelly, differently described.
                  resize({ packageTypeId: String(singleUnit.id), quantity: packed }, packed)
                : // Going the other way can't preserve it — an arbitrary
                  // total rarely divides into whole packages, and quietly
                  // rounding would change what the customer ordered. One
                  // of the smallest package instead, to be adjusted.
                  resize(
                    { packageTypeId: String(smallestPackage.id), quantity: 1 },
                    smallestPackage.unitsPerPackage,
                  )
            }
          />
        )}

        {custom ? (
          /*
            One plain total, no multiplier. An event asking for 260 cubes
            is not "so many of a package" — it is a number someone agreed
            to — and expressing it as a count of a 1-unit package is an
            implementation detail the person typing it shouldn't have to
            perform.
          */
          <label className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              aria-label="Total units"
              value={line.quantity}
              onChange={(e) => resize({ quantity: Math.max(1, Number(e.target.value) || 1) }, Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded-lg border border-line bg-cream px-2 py-1 text-center text-sm font-semibold tabular-nums text-ink outline-none focus:border-accent"
            />
            <span className="text-xs text-ink-soft">units in total</span>
          </label>
        ) : (
          <>
            {/*
              The sizes spread out rather than hiding behind a dropdown.
              There are three of them, they are the shortest labels in the
              form, and which one a line is *is* what you came to this row
              to read — a select spent a click and a popover to show one of
              three words. Same rule as the form's other chip spreads.

              Retired types stay out, unless this line already uses one:
              it has to remain choosable or opening the row and leaving it
              would silently repackage the order. The 1-unit type is left
              out too — it is what Event mode *is*, and offering it here
              would be two ways to say the same thing.
            */}
            <SizeSpread
              value={line.packageTypeId}
              options={packageTypes.filter(
                (p) =>
                  (!p.archivedAt || String(p.id) === line.packageTypeId) &&
                  (p.unitsPerPackage > 1 || String(p.id) === line.packageTypeId),
              )}
              onChange={(id) =>
                resize({ packageTypeId: id }, (unitsPerPackage.get(Number(id)) ?? 0) * line.quantity)
              }
            />

            <NumberStepper
              label="packages"
              value={line.quantity}
              min={1}
              onChange={(quantity) =>
                resize({ quantity }, (unitsPerPackage.get(Number(line.packageTypeId)) ?? 0) * quantity)
              }
            />

            <span className="text-xs text-ink-soft">
              = <span className="font-bold tabular-nums text-ink">{nf.format(packed)}</span> units
            </span>
          </>
        )}

        <span className="flex-1" />

        <LineCoverage remaining={remaining} packed={packed} />

        <ModeSwitch mode={line.mode} onChange={(mode) => onPatch({ mode })} />

        {/* Done with this package. It doesn't write anything — the order
            saves as a whole — it folds the line back to its summary so the
            next one has the room. Named Save because that is what closing
            a finished package feels like. */}
        <button
          type="button"
          onClick={onToggleFold}
          className="rounded-full bg-black px-3 py-1 text-[11px] font-semibold text-cream transition hover:opacity-85"
        >
          Save package
        </button>

        <button
          type="button"
          aria-label="Remove this package"
          title="Remove this package"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-red-600 hover:text-white"
        >
          <Trash2 size={14} />
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
                onToggle={() => toggleFlavor(String(flavor.id))}
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

/**
 * Whether a line's flavours add up to what it packs.
 *
 * Shown on the open editor, on a folded summary and on a preset line, so
 * that an unfinished package cannot hide behind being closed. Silent on
 * an empty line: a package with no flavours yet is a normal stage of
 * booking an order, not a mistake to flag.
 */
function LineCoverage({ remaining, packed }: { remaining: number; packed: number }) {
  if (packed === 0 || remaining === packed) return null;
  return (
    <span
      className={`keeps-color shrink-0 text-[11px] font-semibold tabular-nums ${
        remaining === 0 ? "text-accent" : "text-amber-700"
      }`}
    >
      {remaining === 0
        ? "balanced"
        : remaining > 0
          ? `${nf.format(remaining)} unassigned`
          : `${nf.format(-remaining)} over`}
    </span>
  );
}

/**
 * Package or Event — two ways of saying how much jelly, not one control
 * with a "Custom" entry mixed in among the sizes.
 *
 * They are different questions. A package is a thing the kitchen makes
 * several of; an event total is a number agreed for one booking, where
 * the idea of a multiplier doesn't apply at all. Putting "Custom" among
 * the sizes made the count stepper beside it meaningless without saying
 * so.
 *
 * Drawn larger than the toggles elsewhere in the form and placed first in
 * the row, because it governs everything after it: the same row reads as
 * "three of the 12s" or as "260 units" depending only on this.
 */
function SizingSwitch({
  custom,
  onChange,
}: {
  custom: boolean;
  onChange: (custom: boolean) => void;
}) {
  return (
    <div role="group" aria-label="How this line is sized" className="flex shrink-0 gap-0.5 rounded-full bg-cream p-0.5">
      {[
        { value: false, text: "Package" },
        { value: true, text: "Event" },
      ].map((option) => (
        <button
          key={option.text}
          type="button"
          aria-pressed={custom === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3.5 py-1 text-xs font-bold transition ${
            custom === option.value ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

/**
 * The package sizes as a chip spread. Same reasoning as the form's other
 * spreads: a short owner-managed list read far more often than it is
 * changed has no business behind a popover.
 *
 * It wraps rather than scrolls, so a fifth size added in Settings takes a
 * second line instead of quietly falling off the end of the row.
 */
function SizeSpread({
  value,
  options,
  onChange,
}: {
  value: string;
  options: PackageType[];
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Package size" className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const id = String(option.id);
        const on = id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            // Border on both states, so the chosen size is the same
            // height as the ones beside it.
            className={`keeps-color rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap transition ${
              on
                ? "border-black bg-black text-cream"
                : "border-line text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {option.name}
          </button>
        );
      })}
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
/**
 * One flavour's row: pick it in or out by name, read its share, set it by
 * number or slider. Exported because Settings' preset editor shows the
 * same list against a single package — keeping a second copy there meant
 * two controls to hold in visual step by hand.
 */
export function FlavorRow({
  flavor,
  units,
  packed,
  mode = "units",
  onToggle,
  onChange,
}: {
  flavor: Flavor;
  units: number;
  packed: number;
  mode?: DraftPackageLine["mode"];
  onToggle: () => void;
  onChange: (units: number) => void;
}) {
  const active = units > 0;
  const percent = packed > 0 ? Math.round((units / packed) * 100) : 0;

  return (
    <div
      className={`group rounded-lg px-1 py-1 transition ${
        active ? "" : "opacity-45 hover:opacity-90"
      } hover:bg-cream/70`}
    >
      <div className="flex items-center gap-2">
        {/* Clicking the name picks the flavour in or out. While the line
            is on auto-split that re-divides the tray evenly. */}
        <button
          type="button"
          onClick={onToggle}
          title={active ? `Remove ${flavor.name}` : `Add ${flavor.name}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="h-5 w-5 shrink-0 rounded-md shadow-sm"
            style={{ background: flavorGradient(flavor) }}
            aria-hidden
          />
          <span className="min-w-0 truncate text-xs font-semibold text-ink">{flavor.name}</span>
        </button>

        <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-ink-soft">
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
        <span className="w-5 shrink-0 text-[10px] text-ink-soft">{mode === "percent" ? "%" : "u"}</span>
      </div>

      {/*
        Only on a flavour that's in the tray. A row of eight sliders all
        sitting at zero reads as clutter, and dragging one is how you'd
        add a flavour by accident.
      */}
      {active && packed > 0 && (
        <input
          type="range"
          min={0}
          max={packed}
          value={Math.min(units, packed)}
          aria-label={`${flavor.name} share`}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ accentColor: flavor.colorBase }}
          className="mt-0.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-line"
        />
      )}
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
