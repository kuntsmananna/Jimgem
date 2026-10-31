import { getOrders } from "@/lib/orders";
import { getClients } from "@/lib/clients";
import {
  getContentPresets,
  getDeliveryOptions,
  getDisplayOptions,
  getFlavors,
  getPackageTypes,
  getPaymentMethods,
  getPrices,
} from "@/lib/settings";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { requireSignedInPage } from "@/lib/guard";
import { canSeeMoney } from "@/lib/roles";
import { redactClients, redactOrders, redactPresets, redactRates } from "@/lib/redact";
import { cookies } from "next/headers";
import { ORDERS_FIGURES_COOKIE, parseFiguresFolded } from "@/lib/paneFolds";
import { getIngredientData } from "@/lib/ingredients";
import { flavorUnitCosts } from "@/lib/foodCost";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  // Asked here and not only in the app layout, which a client-side
  // navigation does not re-render — see requireSignedInPage.
  const signedIn = requireSignedInPage();
  const [role, orders, flavors, packageTypes, presets, prices, displayOptions, deliveryOptions, clients, paymentMethods, cookieStore, ingredientData] =
    await Promise.all([
    signedIn,
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
    // Archived included, like the lists above: an order paid by a method
    // since retired still names it, and the picker filters it out itself.
    getPaymentMethods(true),
    cookies(),
    // What a jelly costs is money, so a staff login is not read it at all.
    // Archived included: a recipe may still use one, and costing needs it.
    signedIn.then((role) => (canSeeMoney(role) ? getIngredientData(true) : null)),
  ]);

  /*
   * A staff account is sent the orders with every amount taken out.
   *
   * Here rather than in the components, because this is where the data
   * becomes a response: anything handed to `OrdersClient` is serialised
   * into the page's payload whether or not a component renders it, so a
   * total hidden with a class is a total one View Source away. The
   * components still have to know (see RoleContext) — otherwise they would
   * faithfully draw the zeros that are left.
   */
  const money = canSeeMoney(role);
  const rates = { prices, displayOptions, deliveryOptions };

  return (
    <OrdersClient
      orders={money ? orders : redactOrders(orders)}
      flavors={flavors}
      packageTypes={packageTypes}
      presets={money ? presets : redactPresets(presets)}
      clients={money ? clients : redactClients(clients)}
      rates={money ? rates : redactRates(rates)}
      // The list itself is not money — the order's choice from it is, and
      // redactOrders has already taken that out.
      paymentMethods={paymentMethods}
      // What a jelly costs to make is money: a staff login gets none.
      unitCosts={ingredientData ? flavorUnitCosts(ingredientData.recipes, ingredientData.ingredients, flavors) : {}}
      figuresFolded={parseFiguresFolded(cookieStore.get(ORDERS_FIGURES_COOKIE)?.value)}
    />
  );
}
