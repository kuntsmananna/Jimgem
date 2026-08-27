"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ClipboardList,
  Ellipsis,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { Sheet, SheetClose } from "@/components/Sheet";
import { initials, VatViewToggle } from "@/components/Nav";

/**
 * The three the phone is for.
 *
 * The owner's answer to what a phone is actually used for — looking an
 * order up, booking one on the spot, logging an expense in a shop, and
 * marking something delivered — names these three and nothing else. The
 * other three destinations are still reachable, one tap further away,
 * which is the right distance for screens nobody opens away from a desk.
 */
const BAR = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
];

const MORE = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/biz-plan", label: "Biz Plan", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

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

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {BAR.map((item) => (
          <BarItem key={item.href} {...item} active={isActive(item.href, path)} />
        ))}
        <BarItem
          label="More"
          icon={Ellipsis}
          // Not a link: the other three destinations live behind it, and
          // so do the controls that belong to no page at all.
          active={moreOpen || MORE.some((item) => isActive(item.href, path))}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

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
}: {
  href?: string;
  label: string;
  icon: typeof ClipboardList;
  active: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
          active ? "bg-black text-cream" : "text-ink-soft"
        }`}
      >
        <Icon size={18} />
      </span>
      <span className={`text-[10px] font-semibold ${active ? "text-ink" : "text-ink-soft"}`}>
        {label}
      </span>
    </>
  );

  const shape = "flex flex-1 flex-col items-center gap-0.5 py-2";
  return href ? (
    <Link href={href} className={shape} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={shape} aria-expanded={active}>
      {body}
    </button>
  );
}

/**
 * Everything the bar does not carry.
 *
 * Its own first row rather than the `Sheet`'s title, because who is signed
 * in is the useful heading here — the sheet is reached from a button
 * labelled More, which has already said what it is.
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
    <Sheet onClose={onClose}>
      <>
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[11px] font-bold text-cream">
            {initials(name)}
          </span>
          <span className="flex-1 truncate text-sm font-semibold">{name}</span>
          <SheetClose onClose={onClose} />
        </div>

        <div className="border-t border-line/60">
          {MORE.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-5 py-3.5 text-sm font-semibold ${
                isActive(href, path) ? "text-ink" : "text-ink-soft"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </div>

        {/*
          The VAT switch has to have a home somewhere that is not a page:
          it governs figures on four screens, and a per-page copy would let
          two of them disagree about what a shekel means.
        */}
        <div className="flex items-center justify-between gap-3 border-t border-line/60 px-5 py-3.5">
          <span className="text-sm font-semibold text-ink-soft">Money shown as</span>
          <VatViewToggle />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line/60 px-5 py-3.5">
          <span className="font-mono text-[11px] text-ink-soft/70 tabular-nums">{version}</span>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-soft"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </form>
        </div>
      </>
    </Sheet>
  );
}
