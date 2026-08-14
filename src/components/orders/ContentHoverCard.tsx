"use client";

import type { ReactNode } from "react";
import {
  expandMixFlavors,
  lineAssignedUnits,
  linePackedUnits,
  type OrderPackageLine,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { flavorGradient, isMixFlavor } from "@/lib/flavorStyle";
import { UnitsIcon } from "@/lib/icons";
import { HoverCard } from "@/components/HoverCard";
import { TrayPreview } from "./TrayPreview";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const CARD_WIDTH = 320;
/** Header, plus roughly what one line's preview and flavour list occupy. */
const lineHeight = (lines: number) => Math.min(560, 70 + lines * 200);

/**
 * The content column, spelled out on hover: what each package line packs
 * and how its units divide between flavours.
 *
 * The chips in the cell answer "how much of what" in the width a table
 * column can spare; this answers "what does that actually look like",
 * which is the question the chips keep raising. It shows the same
 * `TrayPreview` the order form draws, so the row and the editor describe
 * one tray rather than two.
 *
 * Content-only rather than the whole order (`OrderHoverCard`, used by the
 * Kanban and calendar): everything that card carries — customer, date,
 * money, statuses — is already its own column here.
 */
export function ContentHoverCard({
  lines,
  flavors,
  packageTypes,
  className = "",
  children,
}: {
  lines: OrderPackageLine[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  className?: string;
  children: ReactNode;
}) {
  // Nothing to elaborate on, and an empty card under the cursor reads as
  // a glitch rather than as an answer.
  if (lines.length === 0) return <>{children}</>;

  const unitsPerPackage = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));
  const total = lines.reduce((sum, line) => sum + linePackedUnits(line, unitsPerPackage), 0);

  return (
    <HoverCard
      width={CARD_WIDTH}
      height={lineHeight(lines.length)}
      className={className}
      render={() => (
        <>
          <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
            <p className="font-display text-sm font-bold text-ink">Content</p>
            <p className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
              <UnitsIcon size={12} />
              {nf.format(total)} units
            </p>
          </div>

          <div className="flex flex-col gap-3.5 pt-3">
            {lines.map((line, i) => (
              <LineDetail
                key={i}
                line={line}
                flavors={flavors}
                packageType={packageTypes.find((p) => String(p.id) === line.packageTypeId)}
              />
            ))}
          </div>
        </>
      )}
    >
      {children}
    </HoverCard>
  );
}

function LineDetail({
  line,
  flavors,
  packageType,
}: {
  line: OrderPackageLine;
  flavors: Flavor[];
  packageType: PackageType | undefined;
}) {
  const packed = line.quantity * (packageType?.unitsPerPackage ?? 0);
  const assigned = lineAssignedUnits(line);
  const missing = packed - assigned;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs font-bold text-ink">
        {line.quantity}× {packageType?.name ?? "Unknown package"}
        {packed > 0 && <span className="font-semibold text-ink-soft"> · {nf.format(packed)} units</span>}
      </p>

      {packageType && (
        <TrayPreview
          entries={line.flavors}
          unitsPerPackage={packageType.unitsPerPackage}
          quantity={line.quantity}
          flavors={flavors}
          packageName={packageType.name}
        />
      )}

      <ul className="flex flex-col gap-0.5">
        {line.flavors.map((entry, i) => {
          const flavor = flavors.find((f) => String(f.id) === entry.flavorId);
          return (
            <li key={i} className="flex items-center gap-2 text-[11px]">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: flavor ? flavorGradient(flavor) : "#726A5E" }}
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                {flavor?.name ?? "Unknown flavour"}
              </span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                {nf.format(entry.units)}u
                {packed > 0 && ` · ${Math.round((entry.units / packed) * 100)}%`}
              </span>
            </li>
          );
        })}

        {/* A line booked before anyone decided the mix. Reported, never
            blocked — see the order form's matching warning. */}
        {missing > 0 && (
          <li className="flex items-center gap-2 text-[11px] text-amber-700">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-amber-700" />
            <span className="flex-1 font-semibold">No flavour yet</span>
            <span className="shrink-0 tabular-nums">{nf.format(missing)}u</span>
          </li>
        )}
      </ul>

      <MixNote line={line} flavors={flavors} />
    </section>
  );
}

/**
 * MIX is stored as one line — "a mix" is what was ordered, and picking the
 * exact split is a kitchen decision (see CLAUDE.md). The preview above
 * draws it as an even spread of every other flavour, so say so rather than
 * let the grid look like it knows something the list doesn't.
 */
function MixNote({ line, flavors }: { line: OrderPackageLine; flavors: Flavor[] }) {
  const mixIds = new Set(flavors.filter(isMixFlavor).map((f) => String(f.id)));
  const mixed = line.flavors.filter((entry) => mixIds.has(entry.flavorId));
  if (mixed.length === 0) return null;

  const spread = expandMixFlavors(mixed, flavors).length;
  return (
    <p className="text-[10px] text-ink-soft">
      Shown as an even spread of {spread} flavours — the mix itself is decided in the kitchen.
    </p>
  );
}
