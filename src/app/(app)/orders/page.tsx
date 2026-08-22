import { getOrders } from "@/lib/orders";
import { getClients } from "@/lib/clients";
import {
  getContentPresets,
  getDeliveryOptions,
  getDisplayOptions,
  getFlavors,
  getPackageTypes,
  getPrices,
} from "@/lib/settings";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, flavors, packageTypes, presets, prices, displayOptions, deliveryOptions, clients] =
    await Promise.all([
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
    getDeliveryOptions(true),
    // Archived included: an order already linked to a retired client
    // should still show their name in the picker (see ClientPicker).
    getClients(true),
  ]);

  return (
    <OrdersClient
      orders={orders}
      flavors={flavors}
      packageTypes={packageTypes}
      presets={presets}
      clients={clients}
      rates={{ prices, displayOptions, deliveryOptions }}
    />
  );
}
