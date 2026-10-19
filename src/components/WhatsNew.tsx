"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BadgeCheck,
  Banknote,
  Boxes,
  Briefcase,
  Cake,
  HandPlatter,
  CalendarDays,
  Columns3,
  CreditCard,
  Filter,
  Landmark,
  MousePointer2,
  Palette,
  Receipt,
  Sparkles,
  SquareCheck,
  TrendingUp,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cubeColors } from "@/components/JellyLoader";
import { Modal, useModalScroller } from "@/components/Modal";
import { JellyBlob } from "@/components/JellyMode";
import { HoverCard } from "@/components/HoverCard";
import { flavorCubeGradient } from "@/lib/flavorStyle";
import { SERIES_COLORS } from "@/lib/chartPalette";
import { announcementsFor, type Announcement } from "@/lib/announcement";
import { useRole } from "@/components/RoleContext";

const noSubscription = () => () => {};

const ITEM_ICON = {
  amount: Receipt,
  card: CreditCard,
  filter: Filter,
  palette: Palette,
  lift: TrendingUp,
  hover: MousePointer2,
  jelly: Boxes,
  day: CalendarDays,
  columns: Columns3,
  extras: Truck,
  select: SquareCheck,
} as const;

/**
 * The "what's new" popup, shown once to each person on their next visit
 * after a release (the app layout decides what there is to show — see
 * `getSeenAnnouncements` and `unseenFor`).
 *
 * **Several releases are pages of one popup**, newest first, with Back and
 * Next and a dot per page. Somebody who missed one release and then came
 * back for the next would otherwise get two popups in two visits, the
 * older one arriving after the newer and describing a page that has since
 * moved on. Every page is mounted and stacked in one grid cell, so the
 * popup is as tall as its tallest page and does not jump between them —
 * the same reason the order form keeps one fixed body across its tabs.
 * The arrow keys page too, from anywhere in the popup.
 *
 * Any way of closing it counts as having seen *all* of it: Got it, the
 * close button, Escape, a click on the dim. Asking somebody to find the one
 * button that "really" dismisses an announcement is how it comes back
 * tomorrow and gets resented, and closing on page one is an answer about
 * the rest as well. The dismissal is sent and not awaited — if it fails,
 * the worst case is seeing the popup once more.
 *
 * **Browser only.** Every other popup opens from a click, so `Modal`'s
 * portal to `document.body` has never had to survive a server render; this
 * one is open on arrival and would. `useSyncExternalStore` answers false on
 * the server and true on the client in the same pass that hydrates, the
 * trick `useMediaQuery` uses, so nothing renders until there is a body.
 */
export function WhatsNew({
  announcements,
  replay = false,
  onClose,
}: {
  announcements: Announcement[];
  /**
   * Opened on purpose from the nav's button (`WhatsNewButton`) to read the
   * releases again, rather than on arrival: nothing is recorded on close,
   * since every page was already seen to be offered there.
   */
  replay?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!open || !inBrowser) return null;

  const dismiss = () => {
    setOpen(false);
    onClose?.();
    if (replay) return;
    void fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: announcements.map((announcement) => announcement.id) }),
    }).catch(() => {});
  };

  return (
    // Short, because a popup's title shares its header with the close
    // button and is cut off past ~14 characters on a phone — each page's
    // own heading says which release it is.
    <Modal title="What's new" icon={<Sparkles size={16} />} onClose={dismiss}>
      <Pages announcements={announcements} onDone={dismiss} />
    </Modal>
  );
}

/**
 * How long after a page turn the button under the pointer refuses to close
 * the popup. Next and Got it are the same button in the same place, so a
 * double-click on Next would otherwise turn to the last page and close it
 * before a word of it was read — and closing records it as seen.
 */
const TURN_GRACE_MS = 450;

/**
 * The pages and their controls. A component of its own because it lives
 * *inside* the `Modal`, which is what lets it ask for the popup's scroll
 * box (`useModalScroller`) instead of hunting the DOM for one.
 */
function Pages({ announcements, onDone }: { announcements: Announcement[]; onDone: () => void }) {
  const [page, setPage] = useState(0);
  const scroller = useModalScroller();
  const primary = useRef<HTMLButtonElement | null>(null);
  const turnedAt = useRef<number | null>(null);
  const count = announcements.length;
  const last = page === count - 1;

  // Every page turn — Next, Back, a dot, an arrow key — goes through
  // here, so the grace window and the scroll-to-top cannot differ between
  // them. Relative, so the keyboard listener needs no current page.
  const turnBy = useCallback(
    (delta: number) => {
      turnedAt.current = performance.now();
      setPage((p) => Math.min(count - 1, Math.max(0, p + delta)));
    },
    [count],
  );

  // Focus without scrolling: `autoFocus` scrolled the popup down to the
  // button, which on a phone hid the title and the picture above the fold.
  // After a page turn the popup goes back to its top, since on a phone
  // Next was pressed from the bottom of the last page.
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    if (turnedAt.current !== null) scroller?.scrollTo({ top: 0 });
  }, [page, scroller]);

  // The arrow keys page from anywhere in the popup — clicking the picture
  // or the title band moves focus off the buttons, and the keys should not
  // stop working because of it. On the document, like Escape is, and
  // subscribed once: the step is relative, so it needs no current page.
  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (delta === 0) return;
      e.preventDefault();
      turnBy(delta);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, turnBy]);

  const pressPrimary = () => {
    if (!last) return turnBy(1);
    if (turnedAt.current !== null && performance.now() - turnedAt.current < TURN_GRACE_MS) return;
    onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid">
        {announcements.map((announcement, i) => (
          <section
            key={announcement.id}
            className={`col-start-1 row-start-1 flex flex-col gap-5 ${i === page ? "motion-fade" : "invisible"}`}
          >
            <Page announcement={announcement} />
          </section>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {count > 1 && (
          <div role="group" aria-label={`Page ${page + 1} of ${count}`} className="flex items-center">
            {announcements.map((announcement, i) => (
              <button
                key={announcement.id}
                type="button"
                aria-label={`Page ${i + 1} of ${count}`}
                aria-current={i === page ? "step" : undefined}
                onClick={() => turnBy(i - page)}
                className="group flex h-8 items-center px-1"
              >
                <span
                  className={`h-1.5 rounded-full transition-all duration-150 ${
                    i === page ? "w-4 bg-ink" : "w-1.5 bg-ink/25 group-hover:bg-ink/50"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
        <span className="flex-1 max-md:hidden" />
        {page > 0 && (
          <button
            type="button"
            onClick={() => turnBy(-1)}
            className="press rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-ink/[0.06] hover:text-ink max-md:py-3"
          >
            Back
          </button>
        )}
        <button
          type="button"
          ref={primary}
          onClick={pressPrimary}
          // A held Enter repeats the click: the first press turns the page
          // and the repeats would land on Got it.
          onKeyDown={(e) => {
            if (e.repeat && e.key === "Enter") e.preventDefault();
          }}
          className="press rounded-full bg-black px-5 py-2 text-sm font-semibold text-cream max-md:flex-1 max-md:py-3"
        >
          {last ? "Got it" : "Next"}
        </button>
      </div>
    </div>
  );
}

/** One release: its picture, its heading, what it changed. */
function Page({ announcement }: { announcement: Announcement }) {
  return (
    <>
      {announcement.art === "jelly-mode" ? (
        <JellyModeIllustration />
      ) : announcement.art === "orders-table" ? (
        <OrdersTableIllustration />
      ) : announcement.art === "refresh" ? (
        <RefreshIllustration />
      ) : (
        <Illustration />
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-lg leading-tight font-extrabold tracking-tight text-ink">
          {announcement.title}
        </h3>
        <p className="text-sm leading-relaxed text-ink">{announcement.lede}</p>
      </div>
      <ul className="flex flex-col gap-3.5">
        {announcement.items.map((item) => {
          const Icon = ITEM_ICON[item.icon];
          return (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-black text-cream">
                <Icon size={15} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-ink">{item.title}</span>
                <span className="text-[13px] leading-snug text-ink-soft">{item.text}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * The release in one picture: an order row with its amount underlined,
 * the black breakdown card that hovering it opens, and the three Paid by
 * chips — drawn from the app's own pieces (the same chip shapes, the same
 * black card) so it reads as a glimpse of the page rather than as clip
 * art. A few jelly cubes in the house flavours sit behind it, lit by
 * `flavorCubeGradient` like the Settings swatches.
 *
 * Purely decorative markup, so it is hidden from screen readers; the
 * list under it says everything it shows.
 */
function Illustration() {
  return (
    <div
      aria-hidden
      className="relative h-48 overflow-hidden rounded-2xl bg-band"
    >
      {/* Jelly cubes, scattered behind the scene. */}
      <Cube color={SERIES_COLORS.berry} className="top-4 left-5 size-9 rotate-[-12deg]" />
      <Cube color={SERIES_COLORS.jasmine} className="right-[42%] bottom-3 size-6 rotate-[10deg] max-md:hidden" />
      <Cube color={SERIES_COLORS.midori} className="top-6 right-6 size-6 rotate-[18deg]" />
      <Cube color={SERIES_COLORS.royale} className="right-16 bottom-4 size-8 rotate-[-6deg]" />

      {/* The order row. */}
      <div className="absolute top-10 left-1/2 flex w-[19rem] -translate-x-[62%] items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 shadow-md max-md:w-[16rem] max-md:-translate-x-[58%]">
        <span className="text-[13px] font-semibold text-ink">Noa</span>
        <span className="flex-1" />
        <span className="border-b border-dotted border-ink-soft/60 text-[13px] font-bold tabular-nums text-ink">
          ₪6,053
        </span>
        <span className="flex items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-semibold text-ink">
          <CreditCard size={10} />
          Credit card
        </span>
      </div>

      {/* The breakdown card that hovering the amount opens. */}
      <div className="absolute top-[4.6rem] left-1/2 w-40 -translate-x-[18%] rotate-[2deg] rounded-xl bg-black p-3 text-[10px] text-cream/80 shadow-xl max-md:top-[4.2rem] max-md:-translate-x-[8%]">
        <Line label="Jelly" value="₪4,200" />
        <Line label="Delivery" value="₪250" />
        <Line label="Display" value="₪300" />
        <Line label="Waitressing" value="₪800" />
        <div className="my-1 border-t border-cream/20" />
        <Line label="Total" value="₪6,053" strong />
      </div>

      {/* The three methods, as the chips the table wears. */}
      <div className="absolute bottom-4 left-5 flex flex-col gap-1.5 max-md:left-3">
        <Chip icon={<Banknote size={10} />} label="Cash" />
        <Chip icon={<CreditCard size={10} />} label="Credit card" />
        <Chip icon={<Landmark size={10} />} label="Bank transfer" />
      </div>
    </div>
  );
}

function Cube({ color, className }: { color: (typeof SERIES_COLORS)[keyof typeof SERIES_COLORS]; className: string }) {
  return (
    <span
      className={`absolute rounded-md opacity-80 shadow-sm ${className}`}
      style={{ background: flavorCubeGradient(color) }}
    />
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 leading-relaxed ${strong ? "text-[11px] font-bold text-cream" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex w-fit items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-ink shadow-sm">
      {icon}
      {label}
    </span>
  );
}

/**
 * The v0.74 refresh in one picture, built from the pieces it introduced:
 * three order rows with the middle one lifted off the list and casting
 * its warm shadow, sharp flavour cubes in the units column, a dark detail
 * card hanging under one of them, and a small heap of jelly — the loader —
 * settled in the corner.
 *
 * Static on purpose: the popup is read, and a picture that moves under the
 * words competes with them. The real loader moves; this one is its photo.
 */
function RefreshIllustration() {
  const row =
    "absolute left-6 right-28 flex h-9 items-center gap-2.5 rounded-xl bg-card/75 px-3 text-[11px] shadow-[inset_0_0_0_1px_var(--color-line)] max-md:right-6";
  return (
    <div aria-hidden className="relative h-48 overflow-hidden rounded-2xl bg-band">
      <div className={`${row} top-5`}>
        <span className="rounded-full bg-tile-peach px-2 py-0.5 font-bold">Queued</span>
        <span className="font-semibold">Noa</span>
        <span className="flex-1" />
        <Cubes colors={[SERIES_COLORS.berry, SERIES_COLORS.jasmine]} />
        <span className="font-bold">240</span>
      </div>
      <div
        className={`${row} top-[3.9rem] z-10 -translate-y-[2px] bg-[#fffdfb] shadow-[0_0_0_1px_#f2e6de,0_4px_10px_-4px_rgb(150_95_65/0.2),0_18px_34px_-14px_rgb(150_95_65/0.4)]`}
      >
        <span className="rounded-full bg-tile-sage px-2 py-0.5 font-bold">Ready</span>
        <span className="font-semibold">Bilduts</span>
        <span className="flex-1" />
        <Cubes colors={[SERIES_COLORS.royale]} />
        <span className="border-b border-dotted border-ink-soft/60 font-bold">120</span>
      </div>
      <div className={`${row} top-[6.8rem]`}>
        <span className="rounded-full bg-tile-peach px-2 py-0.5 font-bold">Queued</span>
        <span className="font-semibold">Studio Lev</span>
        <span className="flex-1" />
        <Cubes colors={[SERIES_COLORS.midori, SERIES_COLORS.berry]} />
        <span className="font-bold">300</span>
      </div>
      {/* The detail card, hanging under the lifted row's units. */}
      <div className="absolute top-[6.4rem] right-32 z-20 w-36 rounded-lg bg-black p-2.5 text-[10px] leading-relaxed text-cream/80 shadow-xl max-md:right-10">
        <p className="mb-1 font-bold text-cream">4 × 30-unit trays</p>
        <p className="flex justify-between"><span>Kir Royale</span><b className="text-cream">120</b></p>
      </div>
      {/* The loader's heap, at rest. */}
      <div className="absolute right-5 bottom-4 h-14 w-[4.4rem] max-md:hidden">
        {[
          { left: 2, bottom: 0, rf: -3, c: SERIES_COLORS.berry },
          { left: 24, bottom: 0, rf: 2, c: SERIES_COLORS.midori },
          { left: 46, bottom: 0, rf: -1, c: SERIES_COLORS.jasmine },
          { left: 12, bottom: 19, rf: -6, c: SERIES_COLORS.royale },
          { left: 35, bottom: 18, rf: 5, c: SERIES_COLORS.sage },
          { left: 24, bottom: 37, rf: -2, c: SERIES_COLORS.berry },
        ].map((cube, i) => (
          <span
            key={i}
            className="jelly-cube absolute h-[19px] w-[19px]"
            style={{ ...cubeColors(cube.c), left: cube.left, bottom: cube.bottom, transform: `rotate(${cube.rf}deg)` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * v0.78's picture: the reorganised Orders table in small, drawn from its
 * own new parts — the day in the margin with Today in the accent, the
 * tinted type mark beside a name, the four extras slots lit or faint with
 * a count, and one of the dark labels every mark now opens on hover. No
 * money in it: staff see this page too, and the money half of the change
 * has an admin-only page of its own.
 */
function OrdersTableIllustration() {
  const rows: {
    day?: { wd: string; dt: string; today?: boolean };
    type: { icon: LucideIcon; tint: string };
    name: string;
    guests: number;
    extras: number[];
    lifted?: boolean;
  }[] = [
    { day: { wd: "Today", dt: "19/10", today: true }, type: { icon: Cake, tint: "bg-tile-peach" }, name: "Noa", guests: 60, extras: [1, 0, 0, 1], lifted: true },
    { type: { icon: Briefcase, tint: "bg-tile-lavender" }, name: "Studio Lev", guests: 120, extras: [0, 2, 1, 1] },
    { day: { wd: "Tue", dt: "20/10" }, type: { icon: Briefcase, tint: "bg-tile-lavender" }, name: "Bilduts", guests: 40, extras: [0, 0, 0, 0] },
  ];
  const slots = [Sparkles, HandPlatter, BadgeCheck, Truck];
  return (
    <div aria-hidden className="relative overflow-hidden rounded-2xl bg-band px-4 pt-8 pb-5 text-[11px]">
      {rows.map((row, i) => (
        <div key={i} className={`flex items-center gap-2 ${row.day && i > 0 ? "mt-3" : i > 0 ? "mt-1.5" : ""}`}>
          {/* The day column, written once per day. */}
          <span className={`flex w-11 shrink-0 flex-col leading-[1.1] ${row.day?.today ? "text-accent" : ""}`}>
            {row.day && (
              <>
                <span className={`text-[8px] font-extrabold tracking-[0.14em] uppercase ${row.day.today ? "" : "text-ink-soft"}`}>
                  {row.day.wd}
                </span>
                <span className="font-display text-[13px] font-extrabold">{row.day.dt}</span>
              </>
            )}
          </span>
          <div
            className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 ${
              row.lifted
                ? "relative z-10 -translate-y-px bg-[#fffdfb] shadow-[0_0_0_1px_#f2e6de,0_12px_24px_-12px_rgb(150_95_65/0.45)]"
                : "bg-card/60"
            }`}
          >
            <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] ${row.type.tint}`}>
              <row.type.icon size={11} />
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{row.name}</span>
            <span className="flex shrink-0 items-center gap-0.5 text-ink-soft max-md:hidden">
              <UserRound size={10} className="opacity-60" />
              {row.guests}
            </span>
            <span className="flex shrink-0 gap-[3px]">
              {slots.map((Icon, at) => (
                <span
                  key={at}
                  className={`relative flex h-[18px] w-[18px] items-center justify-center rounded-[5px] ${
                    row.extras[at] ? "bg-band" : "opacity-25"
                  }`}
                >
                  <Icon size={11} />
                  {/* One of the instant labels, hanging over the lifted
                      row's delivery slot. */}
                  {row.lifted && at === slots.length - 1 && (
                    <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-md bg-black px-2 py-1 text-[10px] whitespace-nowrap text-cream shadow-lg">
                      Delivery
                    </span>
                  )}
                  {row.extras[at] > 1 && (
                    <span className="absolute -top-1 -right-1 min-w-3 rounded-full bg-black px-[2px] text-center text-[7px] leading-3 font-extrabold text-cream">
                      {row.extras[at]}
                    </span>
                  )}
                </span>
              ))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * v0.79's picture: a few of the app's chips and cubes caught mid-wobble —
 * skewed and squashed the way `wobble` poses them — with the switch's own
 * blob quivering in its black pill, as it does while the mode is on.
 */
function JellyModeIllustration() {
  const pieces: { label?: string; tint?: string; cube?: (typeof SERIES_COLORS)[keyof typeof SERIES_COLORS]; pose: string }[] = [
    { label: "Queued", tint: "bg-tile-lavender", pose: "skewX(-12deg) scale(1.06, 0.94)" },
    { cube: SERIES_COLORS.berry, pose: "skewX(10deg) scale(0.92, 1.08) rotate(-6deg)" },
    { label: "Deposit paid", tint: "bg-tile-peach", pose: "skewX(8deg) scale(0.95, 1.05)" },
    { cube: SERIES_COLORS.jasmine, pose: "skewX(-14deg) scale(1.08, 0.92) rotate(5deg)" },
    { label: "Birthday", tint: "bg-tile-mint", pose: "skewX(-6deg) scale(1.03, 0.97)" },
    { cube: SERIES_COLORS.midori, pose: "skewX(12deg) scale(0.94, 1.06) rotate(-3deg)" },
  ];
  return (
    <div aria-hidden className="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl bg-band px-4 py-7">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {pieces.map((piece, i) =>
          piece.cube ? (
            <span key={i} className="jelly-cube h-5 w-5" style={{ ...cubeColors(piece.cube), transform: piece.pose }} />
          ) : (
            <span
              key={i}
              className={`rounded-full px-3 py-1 text-[11px] font-bold text-ink ${piece.tint}`}
              style={{ transform: piece.pose }}
            >
              {piece.label}
            </span>
          ),
        )}
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black">
        <JellyBlob size={20} on />
      </span>
    </div>
  );
}

function Cubes({ colors }: { colors: (typeof SERIES_COLORS)[keyof typeof SERIES_COLORS][] }) {
  return (
    <span className="flex gap-[3px]">
      {colors.map((color, i) => (
        <span key={i} className="jelly-cube h-2.5 w-2.5" style={cubeColors(color)} />
      ))}
    </span>
  );
}

/**
 * Every release this account is meant to hear about, again — an icon
 * beside the VAT switch (and a row in the phone's More sheet). The popup
 * shows once on arrival and any way of closing it counts as read, so
 * without this a page skimmed past on a busy morning was gone for good.
 * All of them rather than the arrival popup's three, because this one is
 * asked for.
 */
export function WhatsNewButton({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const announcements = announcementsFor(role);
  if (announcements.length === 0) return null;
  return (
    <>
      {variant === "icon" ? (
        // Says what it is the moment the pointer arrives — a bare sparkle
        // is not self-explanatory, and the browser's own `title` tooltip
        // takes a second to appear and is gone by the time it is read.
        <HoverCard
          width={210}
          height={70}
          tone="ink"
          placement="below-right"
          render={() => (
            <div className="text-xs leading-snug">
              <p className="font-bold">What&apos;s new</p>
              <p className="mt-0.5 opacity-75">See every release again, with what changed in each.</p>
            </div>
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="What's new: see every release again"
            className="press flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-black/5 hover:text-ink"
          >
            <Sparkles size={15} />
          </button>
        </HoverCard>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-semibold opacity-60"
        >
          <Sparkles size={17} />
          What&apos;s new
        </button>
      )}
      {open && <WhatsNew announcements={announcements} replay onClose={() => setOpen(false)} />}
    </>
  );
}
