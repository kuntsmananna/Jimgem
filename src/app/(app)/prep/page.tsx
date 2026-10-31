import { getOrders } from "@/lib/orders";
import { getDisplayOptions, getFlavors, getPackageTypes } from "@/lib/settings";
import { PrepClient } from "@/components/prep/PrepClient";
import { requireSignedInPage } from "@/lib/guard";
import { redactIngredients, redactOrders, redactPricedOptions } from "@/lib/redact";
import { aroundToday, inRange } from "@/lib/orderScope";
import { PREP_WINDOWS } from "@/lib/prep";
import { getIngredientData } from "@/lib/ingredients";

export const dynamic = "force-dynamic";

/**
 * The kitchen's prep sheet — what the coming days' orders add up to.
 *
 * Staff reach it as well as admins: it is the kitchen's page more than
 * anybody's. It carries no money for either, so the orders are **always**
 * sent redacted — what a page never draws it has no reason to send.
 *
 * Only the widest window is sent, a day wider each side (`aroundToday`):
 * the window itself is chosen in the browser, against its own today.
 */
export default async function PrepPage() {
  const [, orders, flavors, packageTypes, displayOptions, ingredientData] = await Promise.all([
    // Asked here and not only in the app layout — see requireSignedInPage.
    requireSignedInPage(),
    getOrders(),
    // Archived included: an order already booked may use a retired one.
    getFlavors(true),
    getPackageTypes(true),
    getDisplayOptions(true),
    // Archived included: a recipe that still uses one still needs it bought.
    getIngredientData(true),
  ]);

  const reach = aroundToday(Math.max(...PREP_WINDOWS.map((w) => w.days)));
  const upcoming = orders.filter((order) => inRange(order.date, reach));

  return (
    <PrepClient
      orders={redactOrders(upcoming)}
      flavors={flavors}
      packageTypes={packageTypes}
      displayOptions={redactPricedOptions(displayOptions)}
      ingredients={redactIngredients(ingredientData.ingredients)}
      recipes={ingredientData.recipes}
    />
  );
}
