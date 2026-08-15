"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A single row that scrolls sideways, with arrows at the ends.
 *
 * For a list where each item is the same size and the set is browsed
 * rather than searched — the flavour cards, where wrapping to a second row
 * pushed everything below it down and made the panel's height depend on
 * how many flavours exist.
 *
 * The arrows only appear when there is something in that direction, so a
 * short list looks like a plain row rather than like a broken carousel.
 */
export function ScrollStrip({
  children,
  step = 3,
  itemWidth = 180,
  gap = 12,
  label,
}: {
  children: ReactNode;
  /** Items to move per arrow press. */
  step?: number;
  itemWidth?: number;
  gap?: number;
  label: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Both false until measured, so the arrows can't flash on a list that
  // doesn't overflow.
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // A pixel of slack: fractional layout widths leave scrollLeft a hair
    // short of the end, which would keep the forward arrow lit forever.
    setCanScroll({
      back: el.scrollLeft > 1,
      forward: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    sync();
    // Both matter: the container resizing, and items being added or
    // removed while it stays the same size.
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [sync, children]);

  function scrollBy(direction: -1 | 1) {
    scroller.current?.scrollBy({
      left: direction * step * (itemWidth + gap),
      behavior: "smooth",
    });
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={sync}
        // `scroll-smooth` is on the element rather than the call so a
        // trackpad swipe isn't animated on top of its own momentum.
        className="flex overflow-x-auto scroll-smooth pb-1"
        style={{ gap, scrollbarWidth: "thin" }}
      >
        {children}
      </div>

      <Arrow side="left" label={`Scroll ${label} left`} shown={canScroll.back} onClick={() => scrollBy(-1)} />
      <Arrow
        side="right"
        label={`Scroll ${label} right`}
        shown={canScroll.forward}
        onClick={() => scrollBy(1)}
      />
    </div>
  );
}

function Arrow({
  side,
  label,
  shown,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  shown: boolean;
  onClick: () => void;
}) {
  if (!shown) return null;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-ink shadow-md transition hover:bg-black hover:text-cream ${
        side === "left" ? "-left-3" : "-right-3"
      }`}
    >
      {side === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}
