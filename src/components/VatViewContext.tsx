"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { orderNet, orderTotal, type Order, type OrderInput } from "@/lib/orderTypes";
import { VAT_VIEW_COOKIE, VAT_VIEW_LABEL, type VatView } from "@/lib/vatView";

interface VatViewValue {
  view: VatView;
  label: string;
  setView: (view: VatView) => void;
  /** What one order contributes under the current view. */
  forOrder: (order: Order | OrderInput) => number;
  /** The same for an expense, which stores its net alongside its amount. */
  forExpense: (expense: { amount: number; netAmount: number }) => number;
}

const VatViewContext = createContext<VatViewValue | null>(null);

/**
 * The VAT view, provided from the app layout the way order types and
 * production stages are.
 *
 * The choice lives in a cookie rather than local storage so the *server*
 * render already agrees with it — pages compute their money on the server,
 * and reading the preference in the browser would paint one convention and
 * then flip. Setting it re-runs those server components through
 * `router.refresh()` rather than converting anything client-side.
 */
export function VatViewProvider({ view, children }: { view: VatView; children: ReactNode }) {
  const router = useRouter();

  const setView = (next: VatView) => {
    // A year, path-wide: it is a display preference, not a session.
    document.cookie = `${VAT_VIEW_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };

  return (
    <VatViewContext.Provider
      value={{
        view,
        label: VAT_VIEW_LABEL[view],
        setView,
        // Per row, never per total: a period straddling the date the
        // business registered holds both exempt and VAT-inclusive orders,
        // so there is no single divisor for the month.
        forOrder: (order) => (view === "net" ? orderNet(order) : orderTotal(order)),
        forExpense: (expense) => (view === "net" ? expense.netAmount : expense.amount),
      }}
    >
      {children}
    </VatViewContext.Provider>
  );
}

/**
 * Null outside the provider — the login page has no nav and no money, and
 * a component that can't reach the context falls back to what is charged.
 */
export function useVatView(): VatViewValue {
  return (
    useContext(VatViewContext) ?? {
      view: "gross",
      label: VAT_VIEW_LABEL.gross,
      setView: () => {},
      forOrder: orderTotal,
      forExpense: (expense) => expense.amount,
    }
  );
}
