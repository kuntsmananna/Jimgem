import { getYearlyFinancials, MONTH_NAMES_EN } from "@/lib/financials";
import { getOrders, orderMonth, orderDay, orderUnits, orderFlavorUnits } from "@/lib/orders";
import { isBooked, orderTotal, stageMap } from "@/lib/orderTypes";
import { getFlavors, getPackageTypes, getProductionStages } from "@/lib/settings";
import { DashboardClient, type FlavorLine, type OrderPreview } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [financials, orders, flavors, packageTypes, stages] = await Promise.all([
    getYearlyFinancials(),
    getOrders(),
    getFlavors(true),
    // Archived included, like getFlavors(true) above: these resolve
    // what stored orders packed, not what a new one may pick.
    getPackageTypes(true),
    getProductionStages(true),
  ]);

  const unitsByPackageType = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));
  const stageIndex = stageMap(stages);

  // Offers left out, matching getMonthlyRevenue: this chart is a share of
  // units *sold*, and it sits on the same page as a units-sold KPI that
  // already excludes them. Counting a quote in one and not the other would
  // make the two disagree about the same number.
  const flavorLines: FlavorLine[] = orders.flatMap((order) => {
    const month = orderMonth(order);
    if (month === null || !isBooked(order, stageIndex)) return [];
    return orderFlavorUnits(order.packageLines).map((line) => ({
      month,
      ...line,
    }));
  });

  /*
   * Every order, delivered included.
   *
   * The list used to be the *latest* few still needing work, so finished
   * business was noise in it. It is now everything in the period the page
   * is scoped to — which is a different question, and one that "all orders
   * in May" would answer wrongly if it left out the month's delivered
   * ones.
   */
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
        // What the order is worth, extras and discount included — the
        // same figure the KPI tiles above the list total up.
        totalAmount: orderTotal(order),
        units: orderUnits(order.packageLines, unitsByPackageType),
      };
    })
    .filter((o): o is OrderPreview & { month: number } => o.month !== null)
    .sort((a, b) => b.month - a.month || (b.day ?? 0) - (a.day ?? 0));

  // No version footer here any more — it sits in the nav, on every page.
  return (
    <DashboardClient
      financials={financials}
      flavors={flavors.map((f) => ({
        id: f.id,
        name: f.name,
        colorBase: f.colorBase,
      }))}
      flavorLines={flavorLines}
      orders={orderPreviews}
    />
  );
}
