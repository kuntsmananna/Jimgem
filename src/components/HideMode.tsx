"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { HoverCard } from "@/components/HoverCard";
import { writePrefCookie } from "@/lib/prefCookie";
import { HIDE_MODE_COOKIE } from "@/lib/hideMode";

/**
 * Hide mode (v0.85): every money figure and every client name blurred, for
 * a screen shown across a table or opened in a café. The owner asked for
 * it beside Jelly mode; quantities stay sharp — units, guests and counts
 * are not what anybody is hiding.
 *
 * **It is a cookie, not plain state**, unlike Jelly mode: the root layout
 * reads it and writes `data-hide` on `<html>` in the server's own HTML, so
 * a page loaded with it on never paints a figure first. And it is on
 * `<html>` rather than a wrapper because popups, hover cards and sheets
 * portal to `<body>`, outside anything the app layout could wrap.
 *
 * **What is blurred is found, not listed.** Money reaches the screen through
 * four formatters and dozens of call sites — tiles, rails, chart scales,
 * hover cards, tooltips — so instead of a class at every one, a
 * `MutationObserver` marks the element holding any text with a ₪ in it
 * (`data-money`), and the CSS blurs what is marked. A new screen is covered
 * the day it is written. Money *inputs* hold their figure as a value rather
 * than text, so those few say `data-money` themselves, and client names —
 * which no character gives away — carry `data-private` where they are drawn.
 * Until the first pass has run, `globals.css` keeps `main` invisible, so the
 * moment between paint and marking shows nothing rather than everything.
 */

const HideModeContext = createContext<{ on: boolean; toggle: () => void }>({ on: false, toggle: () => {} });

export function useHideMode() {
  return useContext(HideModeContext);
}

/**
 * Marks the element holding a text node with a shekel sign in it — when the
 * element's text also has a digit, so a caption like "Amount ₪" or the ₪
 * half of a ₪/% switch stays readable. The whole element's text is what is
 * checked, because JSX's `₪{amount}` renders the sign and the figure as two
 * text nodes side by side.
 */
function markText(node: Node) {
  const parent = node.parentElement;
  if (!parent || parent.hasAttribute("data-money") || !node.nodeValue?.includes("₪")) return;
  if (/\d/.test(parent.textContent ?? "")) parent.setAttribute("data-money", "");
}

function markMoney(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) markText(node);
}

export function HideModeProvider({ initial, children }: { initial: boolean; children: ReactNode }) {
  const [on, setOn] = useState(initial);

  useEffect(() => {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          // A figure changing beside a ₪ that was already there.
          const parent = record.target.parentElement;
          if (parent) markMoney(parent);
        } else {
          record.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              if (node.parentElement) markMoney(node.parentElement);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              markMoney(node);
            }
          });
        }
      }
    });
    function start() {
      markMoney(document.body);
      document.documentElement.setAttribute("data-hide-ready", "");
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    // Not before the page has hydrated: React compares server markup with
    // its own, and an attribute written into a Suspense boundary it has not
    // reached yet is reported as a mismatch. By the load event and the next
    // idle moment it has; `main` stays hidden until then if hide is on.
    let idle = 0;
    const schedule = () => {
      idle = window.requestIdleCallback
        ? window.requestIdleCallback(start, { timeout: 300 })
        : window.setTimeout(start, 50);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      observer.disconnect();
    };
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    document.documentElement.toggleAttribute("data-hide", next);
    writePrefCookie(HIDE_MODE_COOKIE, next ? "1" : "0");
  }

  return <HideModeContext.Provider value={{ on, toggle }}>{children}</HideModeContext.Provider>;
}

/**
 * The switch, in Jelly mode's two shapes: `icon` for the desktop header
 * with an explaining hover card, `sheet` for the phone's More sheet.
 */
export function HideModeButton({ variant = "icon" }: { variant?: "icon" | "sheet" }) {
  const { on, toggle } = useHideMode();
  const Icon = on ? EyeOff : Eye;
  const label = on ? "Money and names are hidden. Show them" : "Hide money and client names";
  const button = (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={label}
      className={`press flex shrink-0 items-center justify-center rounded-full transition ${
        variant === "sheet" ? "h-10 w-10" : "h-8 w-8"
      } ${on ? "hide-switch is-on" : "hide-switch"}`}
    >
      <Icon size={variant === "sheet" ? 19 : 16} />
    </button>
  );
  if (variant === "sheet") return button;
  return (
    <HoverCard
      width={220}
      height={80}
      tone="ink"
      placement="below-right"
      render={() => (
        <div className="text-xs leading-snug">
          <p className="font-bold">Hide mode {on ? "is on" : ""}</p>
          <p className="mt-0.5 opacity-75">
            Blurs every amount and client name — for a screen someone else can see. Tap again to show them.
          </p>
        </div>
      )}
    >
      {button}
    </HoverCard>
  );
}
