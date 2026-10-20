import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { currentRole } from "@/lib/auth";
import { getOrderTypes, getProductionStages } from "@/lib/settings";
import { APP_VERSION_LABEL } from "@/lib/version";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { HeaderSlotProvider } from "@/components/HeaderSlot";
import { OrderTypesProvider } from "@/components/OrderTypesContext";
import { ProductionStagesProvider } from "@/components/ProductionStagesContext";
import { VatViewProvider } from "@/components/VatViewContext";
import { JellyModeProvider } from "@/components/JellyMode";
import { HideModeProvider } from "@/components/HideMode";
import { HIDE_MODE_COOKIE, parseHideMode } from "@/lib/hideMode";
import { RoleProvider } from "@/components/RoleContext";
import { parseVatView, VAT_VIEW_COOKIE } from "@/lib/vatView";
import { getSeenAnnouncements } from "@/lib/announcementViews";
import { unseenFor } from "@/lib/announcement";
import { WhatsNew } from "@/components/WhatsNew";
import { Notices } from "@/components/Notices";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  /*
   * Archived types included: this list feeds `EventTypeChip` everywhere,
   * and an order booked under a type since retired should keep its colour
   * and icon rather than falling back to a grey tag. The two places that
   * *offer* a type — the order form's pill and the table's Type cell —
   * filter the archived ones out themselves.
   */
  const [session, role, orderTypes, stages, cookieStore, seenAnnouncements] = await Promise.all([
    getSession(),
    // Read from the database rather than from the cookie — see currentRole.
    // Null means no account we can resolve, and everything below it treats
    // that as the least privileged answer.
    currentRole(),
    getOrderTypes(true),
    getProductionStages(true),
    cookies(),
    // Beside the role rather than after it: what has been seen does not
    // depend on who is asking, only what is shown does (`unseenFor`).
    getSeenAnnouncements(),
  ]);
  // Read here, on the server, so the first paint is already in the right
  // convention — see VatViewProvider.
  const vatView = parseVatView(cookieStore.get(VAT_VIEW_COOKIE)?.value);
  // A cookie the gate let through but the database no longer honours —
  // the account's role or password changed since it signed in, or the
  // account is gone (see currentRole). Back to the sign-in page rather than
  // a dashboard drawn as if they were a staff login.
  if (session.userId && role === null) redirect("/login");
  // Who an announcement is for is part of whether there is one to show —
  // a staff login is never told about money.
  const announcements = role && seenAnnouncements ? unseenFor(role, seenAnnouncements) : [];

  return (
    <RoleProvider role={role ?? "staff"}>
    <OrderTypesProvider types={orderTypes}>
      <ProductionStagesProvider stages={stages}>
      <VatViewProvider view={vatView}>
      {/* The phone header's right-hand side, offered to whichever page has
          something to put there — today, a search box. Above `Nav` and
          `main` both, because one writes the slot and the other fills it. */}
      <HeaderSlotProvider>
      {/* Jelly mode's switch lives in both navs and its motion on every
          page — see JellyMode.tsx. Off at the start of every visit. */}
      <JellyModeProvider>
      <HideModeProvider initial={parseHideMode(cookieStore.get(HIDE_MODE_COOKIE)?.value)}>
      <div className="min-h-screen">
        {/* Version lives in the nav so every page carries it, not just the
            Dashboard — it is how a deployed build is identified. */}
        <Nav name={session.name ?? ""} version={APP_VERSION_LABEL} />
        {/* The bottom bar and its More sheet, below the breakpoint only. */}
        <MobileNav name={session.name ?? ""} version={APP_VERSION_LABEL} />
        {/* The tail padding clears the bar, which is fixed over the page. */}
        {/* Less air at the top on a phone: `py-8` is desktop spacing under a
            header carrying six pills and a name, and below the breakpoint
            that header is a thin strip with a wordmark on it. */}
        <main className="px-6 py-8 max-md:px-4 max-md:pt-4 max-md:pb-28">{children}</main>
        {/* Once per person per release — see lib/announcement.ts. */}
        {announcements.length > 0 && <WhatsNew announcements={announcements} />}
        {/* "That didn't save", for every page — see Notices.tsx. */}
        <Notices />
      </div>
      </HideModeProvider>
      </JellyModeProvider>
      </HeaderSlotProvider>
      </VatViewProvider>
      </ProductionStagesProvider>
    </OrderTypesProvider>
    </RoleProvider>
  );
}
