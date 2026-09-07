import { cookies } from "next/headers";
import { getExpensePeriods } from "@/lib/expenses";
import { getRecurringSummary } from "@/lib/recurringExpenses";
import { getExpenseCategories, getPaymentMethods, getPrices, getStaff } from "@/lib/settings";
import { ExpensesClient } from "@/components/expenses/ExpensesClient";
import { EXPENSE_PANES_COOKIE, parseCollapsedPanes } from "@/lib/expensePanes";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [periods, categories, paymentMethods, staff, prices, recurring, cookieStore] = await Promise.all([
    getExpensePeriods(),
    getExpenseCategories(),
    getPaymentMethods(),
    getStaff(),
    getPrices(),
    // Read, never written, on a render path: the rows a series is missing
    // are created by the nightly cron and by the Settings button, not by
    // somebody opening this page. See recurringExpenses.ts.
    getRecurringSummary(),
    cookies(),
  ]);

  // Read here rather than in the browser: the layout would otherwise paint
  // wide and then fold — see expensePanes.ts.
  const collapsedPanes = parseCollapsedPanes(cookieStore.get(EXPENSE_PANES_COOKIE)?.value);

  return (
    <ExpensesClient
      periods={periods}
      categories={categories}
      paymentMethods={paymentMethods}
      staff={staff}
      vatRate={prices.vat_rate}
      recurring={recurring}
      collapsedPanes={collapsedPanes}
    />
  );
}
