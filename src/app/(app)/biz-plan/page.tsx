import { getYearlyFinancials, reportYear } from "@/lib/financials";
import { getEventSummaries } from "@/lib/eventStats";
import { getVatView } from "@/lib/vatViewServer";
import { BizPlanClient } from "@/components/bizplan/BizPlanClient";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function BizPlanPage({ searchParams }: PageProps<"/biz-plan">) {
  // Money lives on this page — see requireAdminPage.
  await requireAdminPage();
  // Figures come back in the viewer's convention rather than being
  // converted here: both sides of profit have to follow the same one.
  const askedYear = reportYear((await searchParams).year);
  const [{ year, years, months }, events] = await Promise.all([
    getYearlyFinancials(await getVatView(), askedYear),
    getEventSummaries(askedYear),
  ]);

  return <BizPlanClient financials={months} year={year} years={years} events={events} />;
}
