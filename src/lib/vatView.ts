/**
 * Which convention money is shown in, app-wide.
 *
 * One switch rather than a control per page: half a screen in one
 * convention and half in the other is how a number gets misread.
 *
 * Client-safe by design — no database, no `next/headers` — because both
 * the provider in the app layout and the toggle in the nav need it.
 */
export type VatView = "gross" | "net";

export const VAT_VIEW_COOKIE = "jimgem_vat_view";

/** Gross by default: what a customer pays, and how the Sheet always read. */
export function parseVatView(value: string | undefined): VatView {
  return value === "net" ? "net" : "gross";
}

export const VAT_VIEW_LABEL: Record<VatView, string> = {
  gross: "incl. VAT",
  net: "excl. VAT",
};
