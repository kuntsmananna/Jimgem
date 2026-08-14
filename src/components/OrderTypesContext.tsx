"use client";

import { createContext, useContext, useMemo } from "react";
import type { OrderType } from "@/lib/settings";

const OrderTypeList = createContext<OrderType[]>([]);
const OrderTypeByName = createContext<Map<string, OrderType>>(new Map());

/**
 * Order-type colours, provided once at the app layout and read by
 * `EventTypeChip` wherever it appears.
 *
 * Context rather than props because the chip shows up in five unrelated
 * places — the Orders table, the Kanban and calendar hover cards, the
 * order popup and the Dashboard's list — and threading a colour lookup
 * through all of their parents would touch a dozen components to deliver
 * one piece of ambient styling data.
 *
 * Keyed by name, not id: orders store the type as text (see schema.sql's
 * order_types), so a value the owner hasn't added to the list simply
 * misses and the chip falls back to its neutral tint.
 */
export function OrderTypesProvider({
  types,
  children,
}: {
  types: OrderType[];
  children: React.ReactNode;
}) {
  const byName = useMemo(() => new Map(types.map((t) => [t.name, t])), [types]);
  return (
    <OrderTypeList.Provider value={types}>
      <OrderTypeByName.Provider value={byName}>{children}</OrderTypeByName.Provider>
    </OrderTypeList.Provider>
  );
}

/**
 * The whole type, not just its colour — the chip needs the icon too, and
 * two lookups keyed the same way would only drift.
 */
export function useOrderType(name: string): OrderType | undefined {
  return useContext(OrderTypeByName).get(name.trim());
}

/** The list itself, for the order form's Type dropdown. */
export function useOrderTypes(): OrderType[] {
  return useContext(OrderTypeList);
}
