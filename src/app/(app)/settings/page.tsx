import { Cloud, ListChecks, Palette, Users } from "lucide-react";
import {
  getContentPresets,
  getOrderTypes,
  getFlavors,
  getPackageTypes,
  getPaymentMethods,
  getExpenseCategories,
  getStaff,
} from "@/lib/settings";
import { FlavorsPanel } from "@/components/settings/FlavorsPanel";
import { NameListPanel } from "@/components/settings/NameListPanel";
import { PackageTypesPanel } from "@/components/settings/PackageTypesPanel";
import { OrderTypesPanel } from "@/components/settings/OrderTypesPanel";
import { PresetsPanel } from "@/components/settings/PresetsPanel";
import { StaffPanel } from "@/components/settings/StaffPanel";
import { ImportPanel } from "@/components/settings/ImportPanel";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [flavors, packageTypes, paymentMethods, expenseCategories, staff, presets, orderTypes] =
    await Promise.all([
      getFlavors(),
      getPackageTypes(),
      getPaymentMethods(),
      getExpenseCategories(),
      getStaff(),
      getContentPresets(),
      getOrderTypes(),
    ]);

  return (
    <SettingsTabs
      tabs={[
        {
          // Flavours and presets are one job: a preset is a package plus a
          // recipe of these flavours, and keeping them a tab apart meant
          // switching back and forth to build one.
          id: "flavors",
          label: "Flavors",
          icon: <Palette size={14} />,
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              <FlavorsPanel flavors={flavors} />
              <PresetsPanel presets={presets} flavors={flavors} packageTypes={packageTypes} />
            </div>
          ),
        },
        {
          id: "lists",
          label: "Settings",
          icon: <ListChecks size={14} />,
          // Everything the owner keeps a list of. Order types and package
          // types keep their own rows — both have a taller row than a
          // plain name list, so pairing either with one left a column
          // ragged. The two short value lists do share a row.
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              <div className="max-w-xl">
                <OrderTypesPanel items={orderTypes} />
              </div>
              <div className="max-w-xl">
                <PackageTypesPanel items={packageTypes} />
              </div>
              <div className="grid min-w-0 grid-cols-2 items-start gap-6">
                <NameListPanel title="Payment methods" resource="payment-methods" items={paymentMethods} />
                <NameListPanel
                  title="Expense categories"
                  resource="expense-categories"
                  items={expenseCategories}
                />
              </div>
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
