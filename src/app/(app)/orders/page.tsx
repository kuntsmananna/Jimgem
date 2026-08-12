import { getOrders } from "@/lib/orders";
import { getFlavors, getPackageTypes } from "@/lib/settings";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, flavors, packageTypes] = await Promise.all([
    getOrders(),
    getFlavors(true),
    getPackageTypes(),
  ]);

  return <OrdersClient orders={orders} flavors={flavors} packageTypes={packageTypes} />;
}
