import {
  getFlavors,
  getPackageTypes,
  getPaymentMethods,
  getExpenseCategories,
  getStaff,
} from "@/lib/settings";
import { FlavorsPanel } from "@/components/settings/FlavorsPanel";
import { NameListPanel } from "@/components/settings/NameListPanel";
import { PackageTypesPanel } from "@/components/settings/PackageTypesPanel";
import { StaffPanel } from "@/components/settings/StaffPanel";
import { ImportPanel } from "@/components/settings/ImportPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [flavors, packageTypes, paymentMethods, expenseCategories, staff] = await Promise.all([
    getFlavors(),
    getPackageTypes(),
    getPaymentMethods(),
    getExpenseCategories(),
    getStaff(),
  ]);

  return (
    <div className="grid min-w-0 grid-cols-[2fr_1fr] gap-6">
      <FlavorsPanel flavors={flavors} />

      <div className="flex min-w-0 flex-col gap-6">
        <PackageTypesPanel items={packageTypes} />
        <NameListPanel title="Payment methods" resource="payment-methods" items={paymentMethods} />
        <NameListPanel title="Expense categories" resource="expense-categories" items={expenseCategories} />
        <StaffPanel items={staff} />
        <ImportPanel />
      </div>
    </div>
  );
}
