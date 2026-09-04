import { Cloud, ListChecks, Palette, Users } from "lucide-react";
import {
  getContentPresets,
  getOrderTypes,
  getFlavors,
  getPackageTypes,
  getPaymentMethods,
  getExpenseCategories,
  getStaff,
  getPrices,
  getProductionStages,
  getDisplayOptions,
  getDeliveryOptions,
  getArchivedItems,
} from "@/lib/settings";
import { FlavorsPanel } from "@/components/settings/FlavorsPanel";
import { NameListPanel } from "@/components/settings/NameListPanel";
import { PackageTypesPanel } from "@/components/settings/PackageTypesPanel";
import { OrderTypesPanel } from "@/components/settings/OrderTypesPanel";
import { PresetsPanel } from "@/components/settings/PresetsPanel";
import { PricesPanel } from "@/components/settings/PricesPanel";
import { VatPanel } from "@/components/settings/VatPanel";
import { JellyPricesPanel } from "@/components/settings/JellyPricesPanel";
import { PricedOptionsPanel } from "@/components/settings/PricedOptionsPanel";
import { StagesPanel } from "@/components/settings/StagesPanel";
import { StaffPanel } from "@/components/settings/StaffPanel";
import { ImportPanel } from "@/components/settings/ImportPanel";
import { getLastSumitSync, getSumitDocuments } from "@/lib/sumitSync";
import { getSumitUsage } from "@/lib/sumitBudget";
import { SumitProbePanel } from "@/components/settings/SumitProbePanel";
import { SumitSyncPanel } from "@/components/settings/SumitSyncPanel";
import { ArchivedPanel } from "@/components/settings/ArchivedPanel";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { HistoryPanel } from "@/components/settings/HistoryPanel";
import { listSnapshots } from "@/lib/backup";
import { getHistory } from "@/lib/history";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [flavors, packageTypes, paymentMethods, expenseCategories, staff, presets, orderTypes, prices, stages, displayOptions, deliveryOptions, archived, lastSumitSync, sumitDocuments, sumitUsage, snapshots, history] =
    await Promise.all([
      getFlavors(),
      getPackageTypes(),
      getPaymentMethods(),
      getExpenseCategories(),
      getStaff(),
      getContentPresets(),
      getOrderTypes(),
      getPrices(),
      getProductionStages(),
      getDisplayOptions(),
      getDeliveryOptions(),
      getArchivedItems(),
      getLastSumitSync(),
      getSumitDocuments(),
      getSumitUsage(),
      listSnapshots(),
      getHistory(),
    ]);
  const sumitDocumentCount = sumitDocuments.length;

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
          label: "Lists",
          icon: <ListChecks size={14} />,
          // Everything the owner keeps a list of, three panes across.
          //
          // CSS columns rather than a 3-column grid: these four are wildly
          // different heights (seven order types against two payment
          // methods), and a grid would align them into rows and leave a
          // hole under every short one. Multi-column packs by height
          // instead, so the tab is as tall as its tallest pane and no
          // taller. `break-inside-avoid` is what keeps a card whole —
          // without it a list splits across two columns mid-row.
          content: (
            <div className="columns-3 gap-6 max-md:columns-1 [&>*]:mb-6 [&>*]:break-inside-avoid">
              <StagesPanel items={stages} />
              <OrderTypesPanel items={orderTypes} />
              <JellyPricesPanel prices={prices} presets={presets} />
              <PricesPanel prices={prices} />
              <VatPanel prices={prices} />
              <PricedOptionsPanel
                title="Display"
                description="An order can carry several at once."
                resource="displays"
                noun="display option"
                items={displayOptions}
              />
              <PricedOptionsPanel
                title="Delivery"
                description="An order picks one, or is given an amount by hand."
                resource="deliveries"
                noun="delivery destination"
                items={deliveryOptions}
              />
              <PackageTypesPanel items={packageTypes} />
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
          // Sheet imports, SUMIT syncs, backups and the change log are
          // desk work, and the owner does not reach for any of them on a
          // phone. Not offered there at all.
          desktopOnly: true,
          label: "Data",
          icon: <Cloud size={14} />,
          // Two columns, packed by height like Lists: these panes are
          // wildly different lengths — a sync button against the archive —
          // and stacked they left a screen of cream beside them.
          content: (
            <div className="columns-2 gap-6 max-md:columns-1 [&>*]:mb-6 [&>*]:break-inside-avoid">
              <ImportPanel />
              <SumitSyncPanel lastSync={lastSumitSync} documentCount={sumitDocumentCount} usage={sumitUsage} />
              <SumitProbePanel usage={sumitUsage} />
              <BackupPanel {...snapshots} />
              <HistoryPanel history={history} />
              <ArchivedPanel items={archived} />
            </div>
          ),
        },
      ]}
    />
  );
}
