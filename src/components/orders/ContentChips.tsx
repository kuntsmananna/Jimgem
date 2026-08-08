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
}

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
        const pkg = packageTypes.find((p) => String(p.id) === line.packageTypeId);
        const flavor = line.flavorId ? flavors.find((f) => String(f.id) === line.flavorId) : null;
        const background = flavor
          ? `radial-gradient(circle at -15% -15%, ${flavor.colorGlow}, ${flavor.colorBase} 55%, ${flavor.colorShadow} 100%)`
          : "conic-gradient(#D4FF3D, #FF2D6B, #E82DC7, #4f6f52, #D4FF3D)";
        return (
          <span
            key={i}
            title={flavor ? flavor.name : "Mix"}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
            style={{ background }}
          >
            {line.quantity}× {pkg?.name ?? "?"}
          </span>
        );
      })}
    </div>
  );
}
