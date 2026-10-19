/**
 * Which side panes are folded away — the Expenses page's two and the
 * Orders page's figures. One module for every fold cookie, so each page's
 * server read and client write agree on the name and the encoding.
 *
 * Expenses:
 * The list in the middle is the page — fifteen columns of it once an
 * expense names its business — and the periods rail and the charts column
 * together take a third of the width to answer questions asked far less
 * often than "what is on this row". Folding either leaves a rail that says
 * where it went and puts it back in one click.
 *
 * Kept in a cookie rather than local storage, for the reason `vatView`
 * is: the page is rendered on the server, so a preference read in the
 * browser would paint the wide layout and then snap. The server reads this
 * and hands the client its opening state, which is why the type and the
 * cookie name live here — client-safe, no `next/headers` — while the page
 * does the reading.
 */
export type ExpensePane = "periods" | "charts";

export const EXPENSE_PANES_COOKIE = "jimgem_expense_panes";

const PANES: ExpensePane[] = ["periods", "charts"];

/** Both open by default: a first visit should show the page whole. */
export function parseCollapsedPanes(value: string | undefined): ExpensePane[] {
  if (!value) return [];
  const folded = value.split(",");
  // Filtered against the known panes rather than trusted, so a stale or
  // hand-edited cookie can't put an unknown name into the layout.
  return PANES.filter((pane) => folded.includes(pane));
}

export function serializeCollapsedPanes(panes: Set<ExpensePane>): string {
  return PANES.filter((pane) => panes.has(pane)).join(",");
}

/**
 * The Orders page's figures pane, folded when the cookie holds "1". A
 * cookie of its own rather than a third name in the Expenses list, since
 * the two pages are read by different server pages.
 */
export const ORDERS_FIGURES_COOKIE = "jimgem_orders_figures";

export const parseFiguresFolded = (value: string | undefined) => value === "1";
export const serializeFiguresFolded = (folded: boolean) => (folded ? "1" : "0");
