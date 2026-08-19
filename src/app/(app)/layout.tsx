import { getSession } from "@/lib/session";
import { getOrderTypes } from "@/lib/settings";
import { APP_VERSION_LABEL } from "@/lib/version";
import { Nav } from "@/components/Nav";
import { OrderTypesProvider } from "@/components/OrderTypesContext";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  /*
   * Archived types included: this list feeds `EventTypeChip` everywhere,
   * and an order booked under a type since retired should keep its colour
   * and icon rather than falling back to a grey tag. The two places that
   * *offer* a type — the order form's pill and the table's Type cell —
   * filter the archived ones out themselves.
   */
  const [session, orderTypes] = await Promise.all([getSession(), getOrderTypes(true)]);

  return (
    <OrderTypesProvider types={orderTypes}>
      <div className="min-h-screen">
        {/* Version lives in the nav so every page carries it, not just the
            Dashboard — it is how a deployed build is identified. */}
        <Nav name={session.name ?? ""} version={APP_VERSION_LABEL} />
        <main className="px-8 py-8">{children}</main>
      </div>
    </OrderTypesProvider>
  );
}
