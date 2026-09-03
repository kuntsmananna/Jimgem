"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffAccount } from "@/lib/settings";
import { PaneHeader } from "@/components/Pane";

export function StaffPanel({ items }: { items: StaffAccount[] }) {
  const router = useRouter();
  const [editingName, setEditingName] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [resetting, setResetting] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveName(id: number) {
    if (!nameDraft.trim()) return;
    setBusy(true);
    await fetch(`/api/settings/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft }),
    });
    setEditingName(null);
    setBusy(false);
    router.refresh();
  }

  async function savePassword(id: number) {
    if (newPassword.length < 8) return;
    setBusy(true);
    await fetch(`/api/settings/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    setResetting(null);
    setNewPassword("");
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader title="Staff & logins" />
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((staff) => (
          <li key={staff.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              {editingName === staff.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    autoFocus
                    className="flex-1 rounded-lg border border-line px-2 py-1 text-sm max-md:py-2"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                  <button
                    onClick={() => saveName(staff.id)}
                    disabled={busy}
                    className="text-xs font-semibold text-accent"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  className="text-left"
                  onClick={() => {
                    setEditingName(staff.id);
                    setNameDraft(staff.name);
                  }}
                >
                  <p className="text-sm font-semibold text-ink">{staff.name}</p>
                  <p className="text-xs text-ink-soft">@{staff.username}</p>
                </button>
              )}
            </div>

            {resetting === staff.id ? (
              <div className="mt-2 flex items-center gap-2 max-md:flex-wrap">
                <input
                  type="text"
                  placeholder="New password (8+ chars)"
                  autoFocus
                  className="flex-1 rounded-lg border border-line px-2 py-1 text-sm max-md:py-2"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  onClick={() => savePassword(staff.id)}
                  disabled={busy}
                  className="text-xs font-semibold text-accent"
                >
                  Save
                </button>
                <button
                  onClick={() => setResetting(null)}
                  className="text-xs font-semibold text-ink-soft"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResetting(staff.id)}
                className="mt-2 text-xs font-semibold text-ink-soft underline decoration-dotted hover:text-ink"
              >
                Reset password
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
