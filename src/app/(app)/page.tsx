import { getYearlyFinancials, MONTH_NAMES_EN } from "@/lib/financials";
import { getMergedOrders, orderMonth, orderDay } from "@/lib/orders";
import { getFlavors, getPackageTypes } from "@/lib/settings";
import { DashboardClient, type FlavorLine, type OrderPreview } from "@/components/dashboard/DashboardClient";
import { APP_VERSION_LABEL } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;

  const [financials, orders, flavors, packageTypes] = await Promise.all([
    getYearlyFinancials(spreadsheetId),
    getMergedOrders(spreadsheetId),
    getFlavors(true),
    getPackageTypes(),
  ]);

  const unitsByPackageType = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));

  const flavorLines: FlavorLine[] = [];
  for (const order of orders) {
    const month = orderMonth(order);
    if (month === null) continue;
    for (const line of order.contentLines) {
      flavorLines.push({
        month,
        flavorId: line.flavorId,
        units: line.quantity * (unitsByPackageType.get(Number(line.packageTypeId)) ?? 0),
      });
    }
  }

  const orderPreviews: OrderPreview[] = orders
    .map((order) => {
      const month = orderMonth(order);
      const day = orderDay(order);
      const units = order.contentLines.reduce(
        (sum, line) => sum + line.quantity * (unitsByPackageType.get(Number(line.packageTypeId)) ?? 0),
        0,
      );
      return {
        key: order.key,
        month,
        day,
        dateLabel: month !== null ? `${MONTH_NAMES_EN[month - 1]}${day ? ` ${day}` : ""}` : order.date,
        customer: order.customer || "(no name)",
        location: order.location,
        totalAmount: order.totalAmount,
        units,
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
