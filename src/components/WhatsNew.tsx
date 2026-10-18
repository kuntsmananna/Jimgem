"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Banknote, Boxes, CreditCard, Filter, Landmark, MousePointer2, Palette, Receipt, Sparkles, TrendingUp } from "lucide-react";
import { cubeColors } from "@/components/JellyLoader";
import { Modal } from "@/components/Modal";
import { flavorCubeGradient } from "@/lib/flavorStyle";
import { SERIES_COLORS } from "@/lib/chartPalette";
import type { Announcement } from "@/lib/announcement";

const noSubscription = () => () => {};

const ITEM_ICON = {
  amount: Receipt,
  card: CreditCard,
  filter: Filter,
  palette: Palette,
  lift: TrendingUp,
  hover: MousePointer2,
  jelly: Boxes,
} as const;

/**
 * The "what's new" popup, shown once to each person on their next visit
 * after a release (the app layout decides what there is to show — see
 * `getUnseenAnnouncements`).
 *
 * **Several releases are pages of one popup**, newest first, with Back and
 * Next and a dot per page. Somebody who missed one release and then came
 * back for the next would otherwise get two popups in two visits, the
 * older one arriving after the newer and describing a page that has since
 * moved on. Every page is mounted and stacked in one grid cell, so the
 * popup is as tall as its tallest page and does not jump between them —
 * the same reason the order form keeps one fixed body across its tabs.
 * The arrow keys page too.
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
export function WhatsNew({ announcements }: { announcements: Announcement[] }) {
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(0);
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const primary = useRef<HTMLButtonElement | null>(null);
  const pages = useRef<HTMLDivElement | null>(null);
  const turned = useRef(false);
  // Focus without scrolling: `autoFocus` scrolled the popup down to the
  // button, which on a phone hid the title and the picture above the fold.
  // After a page turn the popup goes back to its top, since on a phone
  // Next was pressed from the bottom of the last page. The top of the
  // popup, not of the page: the title band scrolls with the body, and
  // `scrollIntoView` on the page would tuck it out of sight.
  useEffect(() => {
    if (!open || !inBrowser) return;
    primary.current?.focus({ preventScroll: true });
    if (turned.current) scrollerOf(pages.current)?.scrollTo({ top: 0 });
  }, [open, inBrowser, page]);
  if (!open || !inBrowser) return null;

  const count = announcements.length;
  const last = page === count - 1;
  const turnTo = (next: number) => {
    if (next < 0 || next >= count) return;
    turned.current = true;
    setPage(next);
  };
  const dismiss = () => {
    setOpen(false);
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
      <div
        className="flex flex-col gap-5"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") turnTo(page + 1);
          else if (e.key === "ArrowLeft") turnTo(page - 1);
        }}
      >
        <div ref={pages} className="grid">
          {announcements.map((announcement, i) => (
            <section
              key={announcement.id}
              aria-hidden={i !== page}
              inert={i !== page}
              className={`col-start-1 row-start-1 flex flex-col gap-5 ${i === page ? "motion-fade" : "invisible"}`}
            >
              <Page announcement={announcement} />
            </section>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {count > 1 && (
            <div className="flex items-center" aria-label={`Page ${page + 1} of ${count}`}>
              {announcements.map((announcement, i) => (
                <button
                  key={announcement.id}
                  type="button"
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === page ? "step" : undefined}
                  onClick={() => turnTo(i)}
                  className="flex h-8 items-center px-1"
                >
                  <span
                    className={`h-1.5 rounded-full transition-all duration-150 ${
                      i === page ? "w-4 bg-ink" : "w-1.5 bg-ink/25 hover:bg-ink/50"
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
              onClick={() => turnTo(page - 1)}
              className="press rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-ink/[0.06] hover:text-ink max-md:py-3"
            >
              Back
            </button>
          )}
          <button
            type="button"
            ref={primary}
            onClick={last ? dismiss : () => turnTo(page + 1)}
            className="press rounded-full bg-black px-5 py-2 text-sm font-semibold text-cream max-md:flex-1 max-md:py-3"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** The nearest ancestor that actually scrolls — the popup's own box. */
function scrollerOf(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY !== "visible") return node;
  }
  return null;
}

/** One release: its picture, its heading, what it changed. */
function Page({ announcement }: { announcement: Announcement }) {
  return (
    <>
      {announcement.art === "refresh" ? <RefreshIllustration /> : <Illustration />}
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

function Cubes({ colors }: { colors: (typeof SERIES_COLORS)[keyof typeof SERIES_COLORS][] }) {
  return (
    <span className="flex gap-[3px]">
      {colors.map((color, i) => (
        <span key={i} className="jelly-cube h-2.5 w-2.5" style={cubeColors(color)} />
      ))}
    </span>
  );
}
