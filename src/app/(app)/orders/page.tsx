import { getOrders } from "@/lib/orders";
import {
  getContentPresets,
  getDisplayOptions,
  getFlavors,
  getPackageTypes,
  getPrices,
} from "@/lib/settings";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, flavors, packageTypes, presets, prices, displayOptions] = await Promise.all([
    getOrders(),
    getFlavors(true),
    // Archived included so an existing line still resolves its size.
    // The pickers filter them out themselves — see PackageLineEditor.
    getPackageTypes(true),
    getContentPresets(),
    getPrices(),
    // Archived included: an order can still owe for a display option
    // since retired, and the form filters them out of the picker itself.
    getDisplayOptions(true),
  ]);

  return (
    <OrdersClient
      orders={orders}
      flavors={flavors}
      packageTypes={packageTypes}
      presets={presets}
      rates={{ prices, displayOptions }}
    />
  );
}
