"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SwitchExplainer } from "@/components/HoverCard";
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
 * Marks an element whose own text has a shekel sign *and* a digit, so a
 * caption like "Amount ₪" or the ₪ half of a ₪/% switch stays readable.
 * Its own text nodes are joined because JSX's `₪{amount}` renders the
 * sign and the figure as two of them side by side; nothing deeper is read.
 */
function markElement(el: Element | null) {
  if (!el || el.hasAttribute("data-money")) return;
  let text = "";
  for (const child of el.childNodes) if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue;
  if (text.includes("₪") && /\d/.test(text)) el.setAttribute("data-money", "");
}

function markMoney(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) markElement(node.parentElement);
}

export function HideModeProvider({ initial, children }: { initial: boolean; children: ReactNode }) {
  const [on, setOn] = useState(initial);

  // Nothing is marked or watched while the mode is off, which is most of
  // the time. A layout effect, so turning it on marks the page before the
  // next paint and no figure shows sharp for a frame. On a page loaded with
  // it on, this runs as React hydrates — an attribute it writes into a
  // Suspense boundary not yet reached is reported as a mismatch in a dev
  // build; production does not compare attributes and leaves it in place.
  useLayoutEffect(() => {
    if (!on) return;
    markMoney(document.body);
    document.documentElement.setAttribute("data-hide-ready", "");
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") markElement(record.target.parentElement);
        else
          record.addedNodes.forEach((node) =>
            node.nodeType === Node.TEXT_NODE ? markElement(node.parentElement) : markMoney(node),
          );
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [on]);

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
    <SwitchExplainer
      title={`Hide mode ${on ? "is on" : ""}`}
      body="Blurs every amount, client name, phone and location — for a screen someone else can see. Tap again to show them."
    >
      {button}
    </SwitchExplainer>
  );
}
