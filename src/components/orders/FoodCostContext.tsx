"use client";

import { createContext, useContext } from "react";

/**
 * What one jelly unit of each flavour costs to make (`flavorUnitCosts`),
 * for the order form's money rail.
 *
 * Context rather than props for the reason `PaymentMethodsContext` gives:
 * the rail sits four components deep in the form. Provided by
 * `OrdersClient`, and empty for a staff login — the page never sends the
 * costs to one — or before any recipe exists, in which case the rail draws
 * nothing about ingredients at all.
 */
export interface FoodCosts {
  unitCosts: Record<string, number>;
  unitsPerPackage: Map<number, number>;
}

const FoodCost = createContext<FoodCosts | null>(null);

export const FoodCostProvider = FoodCost.Provider;

export function useFoodCosts(): FoodCosts | null {
  return useContext(FoodCost);
}
