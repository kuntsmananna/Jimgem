import { getYearlyFinancials } from "@/lib/financials";
import { BizPlanClient } from "@/components/bizplan/BizPlanClient";

export const dynamic = "force-dynamic";

export default async function BizPlanPage() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  const financials = await getYearlyFinancials(spreadsheetId);

  return <BizPlanClient financials={financials} />;
}
