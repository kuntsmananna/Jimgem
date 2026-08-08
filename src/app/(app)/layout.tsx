import { getSession } from "@/lib/session";
import { Nav } from "@/components/Nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  return (
    <div className="min-h-screen">
      <Nav name={session.name ?? ""} />
      <main className="px-8 py-8">{children}</main>
    </div>
  );
}
