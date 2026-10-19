"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ClipboardList,
  Ellipsis,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { Sheet, SheetClose } from "@/components/Sheet";
import { initials, VatViewToggle } from "@/components/Nav";
import { WhatsNew, WhatsNewButton } from "@/components/WhatsNew";
import { JellyBlob, JellyModeButton, useJellyMode } from "@/components/JellyMode";
import { announcementsFor } from "@/lib/announcement";
import { useIsAdmin } from "@/components/RoleContext";

/**
 * The three the phone is for.
 *
 * The owner's answer to what a phone is actually used for — looking an
 * order up, booking one on the spot, logging an expense in a shop, and
 * marking something delivered — named Orders, Expenses and Clients. Tasks
 * took the third slot from Clients (v0.64.0), on the owner's instruction:
 * ticking something off is a standing-up job in a way that looking a
 * client up is not, and a client is most often reached *from* an order
 * anyway — the Orders table's customer name opens their card without
 * coming here at all.
 *
 * The rest are still reachable, one tap further away, which is the right
 * distance for screens nobody opens away from a desk.
 */
const BAR = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
];

const MORE = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/biz-plan", label: "Biz Plan", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The bar a staff account gets: the two pages it has, and no More.
 *
 * Two pages rather than four, so the bar sizes itself from what is in it
 * (`flex items-stretch`, every cell `flex-1`), which is what makes this a
 * list rather than a layout. Expenses goes because it is money; More goes
 * because everything behind it is one or the other, and a target opening
 * an empty sheet is worse than no target. What's new and Sign out — the
 * two things behind More a staff account still needs — take cells of
 * their own instead.
 */
const STAFF_BAR = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
];

/** The staff bar's Jelly cell face: the blob, quivering while the mode is on. */
function JellyBarIcon({ size }: { size?: number }) {
  return <JellyBlob size={size} on={useJellyMode().on} />;
}

const isActive = (href: string, path: string) =>
  href === "/" ? path === "/" : path.startsWith(href);

/**
 * Navigation on a phone: a bar along the bottom, and a sheet for the rest.
 *
 * The desktop nav is one row of six pills plus a VAT toggle, a version, a
 * name and a sign-out — around 1000px of content that cannot wrap. Rather
 * than shrink it, the phone gets the shape phones use: four targets in
 * thumb reach, each large enough to hit, with everything that is not a
 * destination behind "More".
 *
 * Rendered beside the desktop header, each hidden at the other's width, so
 * nothing here can affect a laptop.
 */
export function MobileNav({ name, version }: { name: string; version: string }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const admin = useIsAdmin();
  const [newsOpen, setNewsOpen] = useState(false);
  const staffNews = admin ? [] : announcementsFor("staff");
  const jelly = useJellyMode();

  return (
    <>
      <nav
        aria-label="Main"
        /*
          Black, like the app's other permanent chrome — the money rail and
          every selected pill. It also separates the frame from the page:
          everything above it is cream and belongs to the work, and the bar
          is the thing that is always there.
        */
        className="on-ink fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-cream/15 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {(admin ? BAR : STAFF_BAR).map((item) => (
          <BarItem key={item.href} {...item} active={isActive(item.href, path)} />
        ))}
        {/* Sign-out is the one thing behind More that a staff account still
            needs, so it takes the fourth cell in its own right rather than
            the sheet taking a cell to hold one row. */}
        {admin ? (
          <BarItem
            label="More"
            icon={Ellipsis}
            // Not a link: the four remaining destinations live behind it,
            // and so do the controls that belong to no page at all.
            active={moreOpen || MORE.some((item) => isActive(item.href, path))}
            onClick={() => setMoreOpen(true)}
          />
        ) : (
          <>
            {/* Every release again — the arrival popup is the only other
                way a staff account on a phone would ever see one. */}
            {staffNews.length > 0 && (
              <BarItem label="What's new" icon={Sparkles} active={newsOpen} onClick={() => setNewsOpen(true)} />
            )}
            {/* Jelly mode, which an admin finds in More — a staff account
                has no More, so it takes a cell. */}
            <BarItem
              label="Jelly"
              icon={JellyBarIcon}
              active={jelly.on}
              onClick={jelly.toggle}
              pressed
            />
            <form action={logout} className="flex flex-1">
              <BarItem label="Sign out" icon={LogOut} active={false} type="submit" />
            </form>
          </>
        )}
      </nav>

      {newsOpen && <WhatsNew announcements={staffNews} replay onClose={() => setNewsOpen(false)} />}

      {moreOpen && <MoreSheet name={name} version={version} path={path} onClose={() => setMoreOpen(false)} />}
    </>
  );
}

/**
 * One target in the bar.
 *
 * The whole cell is the button, so the tap area is a quarter of the screen
 * rather than the size of the icon — the app's icon buttons are 20-28px,
 * which is fine for a cursor and not for a thumb. Selected is a black
 * fill, the same answer this app gives everywhere else.
 */
function BarItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  type = "button",
  pressed = false,
}: {
  href?: string;
  label: string;
  icon: typeof ClipboardList | ((props: { size?: number }) => React.ReactNode);
  active: boolean;
  onClick?: () => void;
  /** "submit" for the cell that is a form's button — staff's sign-out. */
  type?: "button" | "submit";
  /** A switch rather than a sheet-opener — reports `aria-pressed` instead. */
  pressed?: boolean;
}) {
  const body = (
    <>
      {/* Selected is the fill inverted — cream on the bar's black, which is
          what "selected" looks like everywhere else in the app, read the
          other way up. Unselected states its dimming as opacity so it
          follows the surface rather than naming a colour. */}
      {/* The fill is a layer of its own that grows into place (v0.80), so
          arriving on a page reads as the pill landing on it rather than a
          colour switching — it is always there, scaled to nothing. */}
      <span className="relative flex h-8 w-14 items-center justify-center">
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full bg-cream transition-[transform,opacity] duration-200 ease-[var(--ease-entrance)] ${
            active ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        />
        <span className={`relative transition-colors duration-200 ${active ? "text-ink" : "opacity-55"}`}>
          <Icon size={20} />
        </span>
      </span>
      {/* 12px, not the 10px this was — at 10 the label read as a caption
          under the icon rather than as the name of the destination, which
          is the half of the cell actually being read.

          `leading-tight` is what keeps the bar the same height: 12px at
          1.25 is a 15px line box, exactly what 10px at the inherited
          leading occupied, so the strip measures the same 66px before and
          after. Without it the default 16px box makes the bar a pixel
          taller, and this is the app's one piece of permanent chrome. */}
      <span className={`text-xs leading-tight font-semibold ${active ? "" : "opacity-55"}`}>{label}</span>
    </>
  );

  const shape = "tap flex flex-1 flex-col items-center gap-0.5 py-2";
  return href ? (
    <Link href={href} className={shape} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  ) : (
    <button
      type={type}
      onClick={onClick}
      className={shape}
      // Only the cell that opens a sheet has an expanded state to report.
      aria-expanded={type === "button" && !pressed ? active : undefined}
      aria-pressed={pressed ? active : undefined}
    >
      {body}
    </button>
  );
}

/**
 * Every page, as tiles — the ones in the bar too.
 *
 * The owner's call (v0.80): the sheet is where a phone goes to *find*
 * something, so it lists the whole app rather than only what the bar
 * leaves out, and lists it big — two columns of tiles with a 22px mark and
 * a 17px name, where it was a column of 14px rows at 60% that read as
 * fine print. The page you are on wears the cream fill, the bar's own
 * "selected" read the other way up.
 */
const PAGES = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/biz-plan", label: "Biz Plan", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Everything the bar does not carry, and a way to every page.
 *
 * Its own first row rather than the `Sheet`'s title, because who is signed
 * in is the useful heading here — the sheet is reached from a button
 * labelled More, which has already said what it is.
 *
 * **No hairlines between its parts** (v0.80): each group is a different
 * kind of thing — who, where to, how money reads, leaving — and the space
 * between them says so on its own. Four rules on a black sheet read as a
 * settings form rather than as a menu.
 */
function MoreSheet({
  name,
  version,
  path,
  onClose,
}: {
  name: string;
  version: string;
  path: string;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} tone="ink">
      <>
        <div className="flex items-center gap-3 px-5 pt-1 pb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-xs font-bold text-ink">
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-semibold">{name}</span>
          <WhatsNewButton variant="sheet" />
          <JellyModeButton variant="sheet" />
          <SheetClose onClose={onClose} />
        </div>

        {/* `motion-stagger` so the tiles arrive one after another as the
            sheet comes up — the menu assembling rather than appearing. An
            odd last tile takes the whole row, so seven pages end square. */}
        <nav aria-label="All pages" className="motion-stagger grid grid-cols-2 gap-2 px-4 pt-1">
          {PAGES.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`tap flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3.5 font-display text-[17px] font-bold transition-colors last:odd:col-span-2 ${
                  active ? "bg-cream text-ink" : "bg-cream/[0.08] active:bg-cream/15"
                }`}
              >
                <Icon size={22} className={active ? "" : "opacity-80"} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/*
          The VAT switch has to have a home somewhere that is not a page:
          it governs figures on four screens, and a per-page copy would let
          two of them disagree about what a shekel means. Its words sit
          beside it at the right (the owner's call), so the sentence and the
          switch it describes are read as one thing.
        */}
        <div className="flex items-center justify-end gap-3 px-5 pt-5">
          <span className="text-sm font-semibold opacity-60">Money shown as</span>
          <VatViewToggle />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-4">
          <span className="font-mono text-[11px] tabular-nums opacity-50">{version}</span>
          <form action={logout}>
            <button
              type="submit"
              className="press flex items-center gap-2 rounded-full border border-cream/30 px-4 py-2.5 text-sm font-semibold"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </form>
        </div>
      </>
    </Sheet>
  );
}
