import { getYearlyFinancials } from "@/lib/financials";
import { getMergedOrders, orderMonth, orderDay, PAYMENT_STATUS_LABEL } from "@/lib/orders";
import { getFlavors, getPackageTypes } from "@/lib/settings";
import { DashboardClient, type FlavorLine, type OrderPreview } from "@/components/dashboard/DashboardClient";

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
    .map((order) => ({
      key: order.key,
      month: orderMonth(order),
      day: orderDay(order),
      customer: order.customer || "(no name)",
      totalAmount: order.totalAmount,
      paymentStatusLabel: PAYMENT_STATUS_LABEL[order.paymentStatus],
    }))
    .filter((o): o is OrderPreview & { month: number } => o.month !== null)
    .sort((a, b) => b.month - a.month || (b.day ?? 0) - (a.day ?? 0));

  return (
    <DashboardClient
      financials={financials}
      flavors={flavors.map((f) => ({ id: f.id, name: f.name, colorBase: f.colorBase }))}
      flavorLines={flavorLines}
      orders={orderPreviews}
    />
  );
}
