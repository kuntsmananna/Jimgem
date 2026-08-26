"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";

/**
 * Retires one entry from an owner-managed list.
 *
 * **Archive, never delete.** An order references its package type and its
 * event type, an expense its category and payment method — a hard delete
 * would either orphan those rows or cascade and take real history with
 * it. Archiving takes the value out of every picker and leaves what
 * already used it exactly as recorded, which is the same rule flavours
 * and presets have always followed.
 *
 * Revealed on hover, like the Expenses row's delete: the lists are read
 * far more often than they are edited, and a retire button on every row
 * makes a five-item list look like a control panel.
 */
export function ArchiveButton({
  resource,
  id,
  name,
  noun,
}: {
  resource: string;
  id: number;
  /** Named in the confirmation, so it is obvious which row is going. */
  name: string;
  /** What this list holds, e.g. "package type". */
  noun: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function archive() {
    if (
      !confirm(
        `Archive the ${noun} "${name}"?\n\nIt stops appearing in dropdowns. Orders and expenses that already use it keep it exactly as it is.`,
      )
    ) {
      return;
    }
    setBusy(true);
    await fetch(`/api/settings/${resource}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={archive}
      disabled={busy}
      title={`Archive ${name}`}
      aria-label={`Archive ${name}`}
      className="reveals-on-hover shrink-0 rounded-full p-1 text-ink-soft opacity-0 transition group-hover:opacity-100 hover:bg-black/[0.06] hover:text-ink focus-visible:opacity-100 disabled:opacity-50"
    >
      <Archive size={13} />
    </button>
  );
}
