import type { OrderPackageLine } from "@/lib/orderTypes";
import type { PackageType } from "@/lib/settings";
import { flavorGradient } from "@/lib/flavorStyle";

export interface FlavorMeta {
  id: number;
  name: string;
  colorGlow: string;
  colorBase: string;
  colorShadow: string;
}

/**
 * An order's content, as chips: one cluster per package line, each a
 * neutral chip for the packaging followed by gradient chips for that
 * line's flavours. The grouping is the point — flavours belong to a
 * package, not to the order (see schema.sql's order_package_lines), so
 * flattening them back into one row would lose which mix went in which
 * tray.
 *
 * Chips carry `keeps-color`: a chip's fill is its meaning, so it must
 * survive the black-line hover treatment intact (see globals.css).
 */
export function ContentChips({
  lines,
  flavors,
  packageTypes,
  showFlavors = true,
}: {
  lines: OrderPackageLine[];
  flavors: FlavorMeta[];
  packageTypes: PackageType[];
  /**
   * Off in the Orders table, where the column answers "how much was
   * ordered" and the flavour split is one hover away in
   * `ContentHoverCard`. A four-flavour line spent the whole column on
   * chips that then truncated, pushing the quantity — the thing being
   * scanned for — out of sight.
   */
  showFlavors?: boolean;
}) {
  if (lines.length === 0) return <span className="text-xs text-ink-soft">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {lines.map((line, lineIndex) => {
        const pkg = packageTypes.find((p) => String(p.id) === line.packageTypeId);
        return (
          <span key={lineIndex} className="flex flex-wrap items-center gap-1">
            <span
              title={
                pkg
                  ? `${line.quantity} × ${pkg.name} (${pkg.unitsPerPackage} units each)`
                  : undefined
              }
              className="keeps-color rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] font-semibold text-ink"
            >
              {line.quantity}× {pkg?.name ?? "?"}
            </span>
            {showFlavors &&
              line.flavors.map((entry, i) => {
                const flavor = flavors.find((f) => String(f.id) === entry.flavorId);
                return (
                  <span
                    key={i}
                    title={flavor ? `${flavor.name} — ${entry.units} units` : undefined}
                    className="keeps-color rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
                    style={{ background: flavor ? flavorGradient(flavor) : "#726A5E" }}
                  >
                    {entry.units}u {flavor?.name ?? "?"}
                  </span>
                );
              })}
          </span>
        );
      })}
    </div>
  );
}
