"use client";

import { useState, type ReactNode } from "react";

export interface SettingsTab {
  id: string;
  label: string;
  /**
   * A rendered icon element, not the component. The tab list is built in
   * a Server Component, and a lucide component is a plain function — it
   * cannot cross the server/client boundary, while the SVG it renders to
   * can.
   */
  icon: ReactNode;
  content: ReactNode;
}

/**
 * Settings' sections, one at a time. Everything used to be stacked on one
 * screen, where the flavor grid alone filled it and pushed the five
 * smaller lists below the fold.
 *
 * `content` arrives already rendered from the server component — the
 * panels stay where they are, this only decides which one is on screen.
 * Only the active tab is mounted, so an open edit row in one section
 * doesn't linger invisibly in another.
 */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0].id);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex w-fit items-center gap-1 rounded-full bg-card p-1">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveId(id)}
            aria-current={id === active.id ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              id === active.id ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
            }`}
          >
            {/*
              The icon goes below the breakpoint. Four tabs of icon + label
              are ~410px and this strip can neither wrap nor scroll, so at
              360 it simply overflowed; the labels alone are ~286px and hold
              down to 320. The same trade the Clients sort track made — a
              segmented pill track says "pick one" without them. A
              `display: none` child is not a flex item, so the `gap-1.5`
              closes up with it.
            */}
            <span className="max-md:hidden">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {active.content}
    </div>
  );
}
