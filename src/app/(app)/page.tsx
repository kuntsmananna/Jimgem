import { getYearlyFinancials, MONTH_NAMES_EN } from "@/lib/financials";
import { getOrders, orderMonth, orderDay, orderUnits } from "@/lib/orders";
import { getFlavors, getPackageTypes } from "@/lib/settings";
import { DashboardClient, type FlavorLine, type OrderPreview } from "@/components/dashboard/DashboardClient";
import { APP_VERSION_LABEL } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [financials, orders, flavors, packageTypes] = await Promise.all([
    getYearlyFinancials(),
    getOrders(),
    getFlavors(true),
    getPackageTypes(),
  ]);

  const unitsByPackageType = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));

  // Flavour lines already carry their quantity in units (see schema.sql's
  // order_content_lines), so unlike packaging lines they need no conversion.
  const flavorLines: FlavorLine[] = [];
  for (const order of orders) {
    const month = orderMonth(order);
    if (month === null) continue;
    for (const line of order.contentLines) {
      if (line.kind !== "flavor") continue;
      flavorLines.push({ month, flavorId: line.flavorId, units: line.quantity });
    }
  }

  const orderPreviews: OrderPreview[] = orders
    .map((order) => {
      const month = orderMonth(order);
      const day = orderDay(order);
      return {
        key: order.key,
        month,
        day,
        dateLabel: month !== null ? `${MONTH_NAMES_EN[month - 1]}${day ? ` ${day}` : ""}` : order.date,
        customer: order.customer || "(no name)",
        customerType: order.customerType,
        location: order.location,
        guests: order.guests,
        totalAmount: order.totalAmount,
        units: orderUnits(order.contentLines, unitsByPackageType),
      };
    })
    .filter((o): o is OrderPreview & { month: number } => o.month !== null)
    .sort((a, b) => b.month - a.month || (b.day ?? 0) - (a.day ?? 0));

  return (
    <>
      <DashboardClient
        financials={financials}
        flavors={flavors.map((f) => ({ id: f.id, name: f.name, colorBase: f.colorBase }))}
        flavorLines={flavorLines}
        orders={orderPreviews}
      />
      <p className="mt-6 text-right text-xs text-ink-soft/60">{APP_VERSION_LABEL}</p>
    </>
  );
}
