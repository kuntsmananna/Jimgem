import type { OrderContentLine } from "@/lib/orderTypes";

export interface FlavorMeta {
  id: number;
  name: string;
  colorGlow: string;
  colorBase: string;
  colorShadow: string;
}

export interface PackageTypeMeta {
  id: number;
  name: string;
  unitsPerPackage: number;
}

export function flavorGradient(flavor: FlavorMeta): string {
  return `radial-gradient(circle at -15% -15%, ${flavor.colorGlow}, ${flavor.colorBase} 55%, ${flavor.colorShadow} 100%)`;
}

/**
 * An order's content, as chips. Packaging and flavour are separate axes
 * (see schema.sql's order_content_lines), so they read as two groups:
 * neutral chips for how it's packed, gradient chips for the flavour mix.
 */
export function ContentChips({
  lines,
  flavors,
  packageTypes,
}: {
  lines: OrderContentLine[];
  flavors: FlavorMeta[];
  packageTypes: PackageTypeMeta[];
}) {
  if (lines.length === 0) return <span className="text-xs text-ink-soft">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {lines.map((line, i) => {
        if (line.kind === "package") {
          const pkg = packageTypes.find((p) => String(p.id) === line.packageTypeId);
          return (
            <span
              key={i}
              title={pkg ? `${line.quantity} × ${pkg.name} (${pkg.unitsPerPackage} units each)` : undefined}
              className="rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] font-semibold text-ink"
            >
              {line.quantity}× {pkg?.name ?? "?"}
            </span>
          );
        }
        const flavor = flavors.find((f) => String(f.id) === line.flavorId);
        return (
          <span
            key={i}
            title={flavor ? `${flavor.name} — ${line.quantity} units` : undefined}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
            style={{ background: flavor ? flavorGradient(flavor) : "#726A5E" }}
          >
            {line.quantity}u {flavor?.name ?? "?"}
          </span>
        );
      })}
    </div>
  );
}
