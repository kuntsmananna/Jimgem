import { getYearlyFinancials } from "@/lib/financials";
import { getVatView } from "@/lib/vatViewServer";
import { BizPlanClient } from "@/components/bizplan/BizPlanClient";

export const dynamic = "force-dynamic";

export default async function BizPlanPage() {
  // Figures come back in the viewer's convention rather than being
  // converted here: both sides of profit have to follow the same one.
  const financials = await getYearlyFinancials(await getVatView());

  return <BizPlanClient financials={financials} />;
}
