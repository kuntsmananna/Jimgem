"use client";

import { createContext, useContext, useMemo } from "react";
import type { ProductionStage } from "@/lib/orderTypes";

const StageList = createContext<ProductionStage[]>([]);
const StageByKey = createContext<Map<string, ProductionStage>>(new Map());

/**
 * The production stages, provided once at the app layout.
 *
 * Same reasoning as `OrderTypesProvider`: a stage's label and colour are
 * needed by the table, the Kanban board, the calendar's hover card and
 * the order popup, and threading the list through all of their parents
 * would touch a dozen components to deliver ambient styling data.
 *
 * Keyed by `key`, which is what orders store — so renaming a stage
 * renames it everywhere at once and cannot retype an order.
 */
export function ProductionStagesProvider({
  stages,
  children,
}: {
  stages: ProductionStage[];
  children: React.ReactNode;
}) {
  const byKey = useMemo(() => new Map(stages.map((s) => [s.key, s])), [stages]);
  return (
    <StageList.Provider value={stages}>
      <StageByKey.Provider value={byKey}>{children}</StageByKey.Provider>
    </StageList.Provider>
  );
}

/** One stage by the key an order stores, or undefined if it has been removed. */
export function useStage(key: string): ProductionStage | undefined {
  return useContext(StageByKey).get(key);
}

/** Every stage in board order, for the pickers and the Kanban's columns. */
export function useStages(): ProductionStage[] {
  return useContext(StageList);
}
