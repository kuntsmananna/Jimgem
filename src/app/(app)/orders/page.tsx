import { getOrders } from "@/lib/orders";
import { getContentPresets, getFlavors, getPackageTypes, getPrices } from "@/lib/settings";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, flavors, packageTypes, presets, prices] = await Promise.all([
    getOrders(),
    getFlavors(true),
    // Archived included so an existing line still resolves its size.
    // The pickers filter them out themselves — see PackageLineEditor.
    getPackageTypes(true),
    getContentPresets(),
    getPrices(),
  ]);

  return (
    <OrdersClient
      orders={orders}
      flavors={flavors}
      packageTypes={packageTypes}
      presets={presets}
      prices={prices}
    />
  );
}
