import { Boxes, Cloud, ListChecks, Palette, Users } from "lucide-react";
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
import { SettingsTabs } from "@/components/settings/SettingsTabs";

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
    <SettingsTabs
      tabs={[
        { id: "flavors", label: "Flavors", icon: <Palette size={14} />, content: <FlavorsPanel flavors={flavors} /> },
        {
          id: "packaging",
          label: "Packaging",
          icon: <Boxes size={14} />,
          // Short lists are capped rather than stretched — a three-row
          // panel spanning the full desktop width reads as broken.
          content: (
            <div className="max-w-xl">
              <PackageTypesPanel items={packageTypes} />
            </div>
          ),
        },
        {
          id: "lists",
          label: "Lists",
          icon: <ListChecks size={14} />,
          // The two short value lists share a row — either alone would be
          // a nearly empty tab.
          content: (
            <div className="grid min-w-0 grid-cols-2 items-start gap-6">
              <NameListPanel title="Payment methods" resource="payment-methods" items={paymentMethods} />
              <NameListPanel
                title="Expense categories"
                resource="expense-categories"
                items={expenseCategories}
              />
            </div>
          ),
        },
        {
          id: "team",
          label: "Team",
          icon: <Users size={14} />,
          content: (
            <div className="max-w-xl">
              <StaffPanel items={staff} />
            </div>
          ),
        },
        {
          id: "data",
          label: "Data",
          icon: <Cloud size={14} />,
          content: (
            <div className="max-w-2xl">
              <ImportPanel />
            </div>
          ),
        },
      ]}
    />
  );
}
