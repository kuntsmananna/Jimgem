"use client";

import { createContext, useContext } from "react";
import type { PaymentMethod } from "@/lib/settings";

const PaymentMethods = createContext<PaymentMethod[]>([]);

/**
 * The owner's payment methods, for the Orders page's table, cards and
 * order form.
 *
 * Context rather than props for the reason `OrderTypesContext` gives: the
 * table, the phone cards and the form's Customer tab all want it, and the
 * form alone sits four components deep. Provided by `OrdersClient` rather
 * than the app layout, because nothing outside the Orders page reads it —
 * every other page would pay a query for a list it never shows.
 *
 * Archived methods are included, so an order paid by a retired method
 * still names it; the pickers filter them out themselves.
 */
export const PaymentMethodsProvider = PaymentMethods.Provider;

export function usePaymentMethods(): PaymentMethod[] {
  return useContext(PaymentMethods);
}
