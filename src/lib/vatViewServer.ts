import { cookies } from "next/headers";
import { parseVatView, VAT_VIEW_COOKIE, type VatView } from "./vatView";

/**
 * The viewer's VAT convention, read on the server.
 *
 * Server-only — it imports `next/headers` — which is why the type and the
 * cookie name live in `vatView.ts` beside it: the provider and the nav
 * toggle are Client Components and can only have the client-safe half.
 */
export async function getVatView(): Promise<VatView> {
  return parseVatView((await cookies()).get(VAT_VIEW_COOKIE)?.value);
}
