import { getYearlyFinancials } from "@/lib/financials";
import { BizPlanClient } from "@/components/bizplan/BizPlanClient";

export const dynamic = "force-dynamic";

export default async function BizPlanPage() {
  const financials = await getYearlyFinancials();

  return <BizPlanClient financials={financials} />;
}
