"use client";

import { useState, useSyncExternalStore } from "react";
import { Banknote, CreditCard, Filter, Landmark, Receipt, Sparkles } from "lucide-react";
import { Modal } from "@/components/Modal";
import { flavorCubeGradient } from "@/lib/flavorStyle";
import { SERIES_COLORS } from "@/lib/chartPalette";
import type { Announcement } from "@/lib/announcement";

const noSubscription = () => () => {};

const ITEM_ICON = {
  amount: Receipt,
  card: CreditCard,
  filter: Filter,
} as const;

/**
 * The "what's new" popup, shown once to each person on their next visit
 * after a release (the app layout decides whether there is one to show —
 * see `getUnseenAnnouncement`).
 *
 * Any way of closing it counts as having seen it: Got it, the close
 * button, Escape, a click on the dim. Asking somebody to find the one
 * button that "really" dismisses an announcement is how it comes back
 * tomorrow and gets resented. The dismissal is sent and not awaited — if
 * it fails, the worst case is seeing the popup once more.
 *
 * **Browser only.** Every other popup opens from a click, so `Modal`'s
 * portal to `document.body` has never had to survive a server render; this
 * one is open on arrival and would. `useSyncExternalStore` answers false on
 * the server and true on the client in the same pass that hydrates, the
 * trick `useMediaQuery` uses, so nothing renders until there is a body.
 */
export function WhatsNew({ announcement }: { announcement: Announcement }) {
  const [open, setOpen] = useState(true);
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!open || !inBrowser) return null;

  const dismiss = () => {
    setOpen(false);
    void fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: announcement.id }),
    }).catch(() => {});
  };

  return (
    <Modal title={announcement.title} icon={<Sparkles size={16} />} onClose={dismiss}>
      <div className="flex flex-col gap-5">
        <Illustration />
        <p className="text-sm leading-relaxed text-ink">{announcement.lede}</p>
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
        <div className="flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            autoFocus
            className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-cream max-md:w-full max-md:py-3"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
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
