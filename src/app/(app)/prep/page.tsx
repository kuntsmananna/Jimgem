import { getOrders } from "@/lib/orders";
import { getDisplayOptions, getFlavors, getPackageTypes } from "@/lib/settings";
import { PrepClient } from "@/components/prep/PrepClient";
import { requireSignedInPage } from "@/lib/guard";
import { redactOrders } from "@/lib/redact";
import { isoDate } from "@/lib/orderTypes";
import { getIngredientData } from "@/lib/ingredients";

export const dynamic = "force-dynamic";

/** The longest window the sheet offers, plus a day either side for the timezone. */
const REACH_DAYS = 15;

/**
 * The kitchen's prep sheet — what the coming days' orders add up to.
 *
 * Staff reach it as well as admins: it is the kitchen's page more than
 * anybody's. It carries no money for either, so the orders are **always**
 * sent redacted — what a page never draws it has no reason to send.
 *
 * Only the next fortnight or so is sent. The window is chosen in the
 * browser, against the browser's own today (the server runs in UTC), so
 * the server's cut is a day wider on both sides than the widest window.
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

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 1);
  const to = new Date(now);
  to.setDate(to.getDate() + REACH_DAYS);
  const upcoming = orders.filter((order) => order.date >= isoDate(from) && order.date <= isoDate(to));

  return (
    <PrepClient
      orders={redactOrders(upcoming)}
      flavors={flavors}
      packageTypes={packageTypes}
      displayOptions={displayOptions.map((option) => ({ ...option, price: 0 }))}
      // Prices out: the shopping list is amounts and packs, not shekels.
      ingredients={ingredientData.ingredients.map((ingredient) => ({ ...ingredient, packPrice: 0 }))}
      recipes={ingredientData.recipes}
    />
  );
}
