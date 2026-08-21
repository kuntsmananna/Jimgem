import { getExpensePeriods } from "@/lib/expenses";
import { getExpenseCategories, getPaymentMethods, getPrices, getStaff } from "@/lib/settings";
import { ExpensesClient } from "@/components/expenses/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [periods, categories, paymentMethods, staff, prices] = await Promise.all([
    getExpensePeriods(),
    getExpenseCategories(),
    getPaymentMethods(),
    getStaff(),
    getPrices(),
  ]);

  return (
    <ExpensesClient
      periods={periods}
      categories={categories}
      paymentMethods={paymentMethods}
      staff={staff}
      vatRate={prices.vat_rate}
    />
  );
}
