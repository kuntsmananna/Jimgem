import { getYearlyFinancials } from "@/lib/financials";
import { getVatView } from "@/lib/vatViewServer";
import { BizPlanClient } from "@/components/bizplan/BizPlanClient";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function BizPlanPage({ searchParams }: PageProps<"/biz-plan">) {
  // Money lives on this page — see requireAdminPage.
  await requireAdminPage();
  const asked = Number((await searchParams).year);
  // Figures come back in the viewer's convention rather than being
  // converted here: both sides of profit have to follow the same one.
  const { year, years, months } = await getYearlyFinancials(
    await getVatView(),
    Number.isInteger(asked) && asked > 2000 ? asked : undefined,
  );

  return <BizPlanClient financials={months} year={year} years={years} />;
}
