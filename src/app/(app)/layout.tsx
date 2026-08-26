import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getOrderTypes, getProductionStages } from "@/lib/settings";
import { APP_VERSION_LABEL } from "@/lib/version";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { OrderTypesProvider } from "@/components/OrderTypesContext";
import { ProductionStagesProvider } from "@/components/ProductionStagesContext";
import { VatViewProvider } from "@/components/VatViewContext";
import { parseVatView, VAT_VIEW_COOKIE } from "@/lib/vatView";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  /*
   * Archived types included: this list feeds `EventTypeChip` everywhere,
   * and an order booked under a type since retired should keep its colour
   * and icon rather than falling back to a grey tag. The two places that
   * *offer* a type — the order form's pill and the table's Type cell —
   * filter the archived ones out themselves.
   */
  const [session, orderTypes, stages, cookieStore] = await Promise.all([
    getSession(),
    getOrderTypes(true),
    getProductionStages(true),
    cookies(),
  ]);
  // Read here, on the server, so the first paint is already in the right
  // convention — see VatViewProvider.
  const vatView = parseVatView(cookieStore.get(VAT_VIEW_COOKIE)?.value);

  return (
    <OrderTypesProvider types={orderTypes}>
      <ProductionStagesProvider stages={stages}>
      <VatViewProvider view={vatView}>
      <div className="min-h-screen">
        {/* Version lives in the nav so every page carries it, not just the
            Dashboard — it is how a deployed build is identified. */}
        <Nav name={session.name ?? ""} version={APP_VERSION_LABEL} />
        {/* The bottom bar and its More sheet, below the breakpoint only. */}
        <MobileNav name={session.name ?? ""} version={APP_VERSION_LABEL} />
        {/* The tail padding clears the bar, which is fixed over the page. */}
        <main className="px-6 py-8 max-md:px-4 max-md:pb-28">{children}</main>
      </div>
      </VatViewProvider>
      </ProductionStagesProvider>
    </OrderTypesProvider>
  );
}
