import { getSession } from "@/lib/session";
import { getOrderTypes } from "@/lib/settings";
import { APP_VERSION_LABEL } from "@/lib/version";
import { Nav } from "@/components/Nav";
import { OrderTypesProvider } from "@/components/OrderTypesContext";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [session, orderTypes] = await Promise.all([getSession(), getOrderTypes()]);

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
