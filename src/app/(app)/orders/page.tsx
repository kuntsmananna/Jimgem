import { getMergedOrders } from "@/lib/orders";
import { getFlavors, getPackageTypes } from "@/lib/settings";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;

  const [orders, flavors, packageTypes] = await Promise.all([
    getMergedOrders(spreadsheetId),
    getFlavors(true),
    getPackageTypes(),
  ]);

  return <OrdersClient orders={orders} flavors={flavors} packageTypes={packageTypes} />;
}
