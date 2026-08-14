import { Blend, Boxes, Cloud, ListChecks, Palette, Users } from "lucide-react";
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
          id: "presets",
          label: "Presets",
          icon: <Blend size={14} />,
          content: (
            <PresetsPanel presets={presets} flavors={flavors} packageTypes={packageTypes} />
          ),
        },
        {
          id: "lists",
          label: "Lists",
          icon: <ListChecks size={14} />,
          // The two short value lists share a row — either alone would be
          // a nearly empty tab. Order types keep their own row above them:
          // the colour swatch makes each of its rows taller, so pairing it
          // with a plain name list left one column ragged.
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              <div className="max-w-xl">
                <OrderTypesPanel items={orderTypes} />
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
