"use client";

import type { ReactNode } from "react";
import { lineAssignedUnits, linePackedUnits, type OrderPackageLine } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { flavorGradient } from "@/lib/flavorStyle";
import { UnitsIcon } from "@/lib/icons";
import { HoverCard } from "@/components/HoverCard";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const CARD_WIDTH = 280;
/** Header, plus a heading and a few flavour rows per package line. */
const cardHeight = (lines: OrderPackageLine[]) =>
  Math.min(520, 64 + lines.reduce((sum, line) => sum + 34 + (line.flavors.length + 1) * 22, 0));

/**
 * The content column, spelled out on hover: what each package line packs
 * and how its units divide between flavours.
 *
 * The chips in the cell fit "how much of what" into the width a table
 * column can spare, which costs them the per-flavour share and truncates
 * once a line has more than two or three flavours. This is the same
 * information given room to be read — a heading per package line, then one
 * row per flavour with its units and its share of that line.
 *
 * Deliberately no `TrayPreview`: the picture belongs in the order form,
 * where you are deciding the mix. Here you are reading an order, and the
 * grid crowded out the numbers that answer the question.
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
      height={cardHeight(lines)}
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

          <div className="flex flex-col gap-3 pt-2.5">
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
  const missing = packed - lineAssignedUnits(line);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-bold text-ink">
          {line.quantity}× {packageType?.name ?? "Unknown package"}
        </p>
        {packed > 0 && (
          <p className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-soft">
            {nf.format(packed)} units
          </p>
        )}
      </div>

      <ul className="mt-1 flex flex-col">
        {line.flavors.map((entry, i) => {
          const flavor = flavors.find((f) => String(f.id) === entry.flavorId);
          return (
            <li key={i} className="flex items-center gap-2 py-[3px] text-xs">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: flavor ? flavorGradient(flavor) : "#726A5E" }}
              />
              <span className="min-w-0 flex-1 truncate text-ink">{flavor?.name ?? "Unknown flavour"}</span>
              <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-ink">
                {nf.format(entry.units)}u
              </span>
              {packed > 0 && (
                <span className="w-9 shrink-0 text-right tabular-nums text-ink-soft">
                  {Math.round((entry.units / packed) * 100)}%
                </span>
              )}
            </li>
          );
        })}

        {/* A line booked before anyone decided the mix. Reported, never
            blocked — see the order form's matching warning. */}
        {missing > 0 && (
          <li className="flex items-center gap-2 py-[3px] text-xs text-amber-700">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-amber-700"
            />
            <span className="min-w-0 flex-1 truncate font-semibold">No flavour yet</span>
            <span className="w-14 shrink-0 text-right font-semibold tabular-nums">
              {nf.format(missing)}u
            </span>
            {packed > 0 && (
              <span className="w-9 shrink-0 text-right tabular-nums">
                {Math.round((missing / packed) * 100)}%
              </span>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}
