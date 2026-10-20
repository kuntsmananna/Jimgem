import { getYearlyFinancials, yearOf } from "@/lib/financials";
import { getOrders, orderMonth, orderFlavorUnits } from "@/lib/orders";
import { isBooked, stageMap } from "@/lib/orderTypes";
import { getFlavors, getProductionStages, getStaff } from "@/lib/settings";
import { getVatView } from "@/lib/vatViewServer";
import { DashboardClient, type FlavorLine } from "@/components/dashboard/DashboardClient";
import { getTasks } from "@/lib/tasks";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  // Money lives on this page — see requireAdminPage.
  await requireAdminPage();
  const vatView = await getVatView();
  const asked = Number((await searchParams).year);
  const [{ year, years, months: financials }, orders, flavors, stages, tasks, staff] = await Promise.all([
    getYearlyFinancials(vatView, Number.isInteger(asked) && asked > 2000 ? asked : undefined),
    getOrders(),
    // Archived included: this resolves what stored orders packed, not
    // what a new one may pick.
    getFlavors(true),
    getProductionStages(true),
    // The Dashboard's list is the shared to-do list now, where the
    // period's orders used to be — see DashboardOrdersPane, which is
    // parked whole in case that is wanted back.
    getTasks(),
    getStaff(),
  ]);

  const stageIndex = stageMap(stages);

  // Offers left out, matching getMonthlyRevenue: this chart is a share of
  // units *sold*, and it sits on the same page as a units-sold KPI that
  // already excludes them. Counting a quote in one and not the other would
  // make the two disagree about the same number.
  const flavorLines: FlavorLine[] = orders.flatMap((order) => {
    const month = orderMonth(order);
    // The same year as the figures beside it — see getYearlyFinancials.
    if (month === null || yearOf(order.date) !== year || !isBooked(order, stageIndex)) return [];
    return orderFlavorUnits(order.packageLines).map((line) => ({
      month,
      ...line,
    }));
  });

  // No version footer here any more — it sits in the nav, on every page.
  return (
    <DashboardClient
      key={year}
      financials={financials}
      year={year}
      years={years}
      flavors={flavors.map((f) => ({
        id: f.id,
        name: f.name,
        colorBase: f.colorBase,
      }))}
      flavorLines={flavorLines}
      tasks={tasks}
      staff={staff}
    />
  );
}
