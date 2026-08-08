import { getExpensePeriods } from "@/lib/expenses";
import { getExpenseCategories, getPaymentMethods, getStaff } from "@/lib/settings";
import { ExpensesClient } from "@/components/expenses/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;

  const [periods, categories, paymentMethods, staff] = await Promise.all([
    getExpensePeriods(spreadsheetId),
    getExpenseCategories(),
    getPaymentMethods(),
    getStaff(),
  ]);

  return (
    <ExpensesClient periods={periods} categories={categories} paymentMethods={paymentMethods} staff={staff} />
  );
}
