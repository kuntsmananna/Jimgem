"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserPlus, X } from "lucide-react";
import type { StaffAccount } from "@/lib/settings";
import { ROLES, ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/roles";
import { PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";
import { Segmented } from "@/components/orders/OrderSheet";

/**
 * Who can sign in, and what each of them may see.
 *
 * For most of this app's life there were exactly two accounts, made by a
 * hand-written INSERT, and this pane could only rename them and reset a
 * password. There are more than two people in the business now — the
 * kitchen and the floor — so it adds accounts as well.
 *
 * **It is not a signup.** Only an admin reaches Settings at all, and the
 * route behind every control here checks that again against the database
 * rather than against the cookie: this is the pane that hands out access,
 * which is the one place a role read from a snapshot taken at sign-in is
 * least good enough.
 *
 * There is still no delete, deliberately. A staff row is pointed at by
 * every expense that names who spent it and every task assigned to them,
 * so removing one would either orphan those rows or take real history with
 * it — the same reason every owner-managed list archives instead. Demoting
 * somebody to Staff and changing their password is what "they have left"
 * looks like here.
 */
export function StaffPanel({ items }: { items: StaffAccount[] }) {
  const router = useRouter();
  const [editingName, setEditingName] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [resetting, setResetting] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One place every write goes through, so a refusal is always printed.
   *
   * The old panel fired and forgot: a duplicate username or a refused
   * demotion came back as a 409 nobody read, and the pane simply did not
   * change — indistinguishable from a save that worked.
   */
  async function send(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Couldn't save that.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Couldn't reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveName(id: number) {
    if (!nameDraft.trim()) return;
    if (await send(`/api/settings/staff/${id}`, "PATCH", { name: nameDraft })) setEditingName(null);
  }

  async function savePassword(id: number) {
    if (newPassword.length < 8) {
      setError("A password needs 8 characters or more.");
      return;
    }
    if (await send(`/api/settings/staff/${id}`, "PATCH", { password: newPassword })) {
      setResetting(null);
      setNewPassword("");
    }
  }

  async function saveRole(id: number, role: Role) {
    await send(`/api/settings/staff/${id}`, "PATCH", { role });
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Staff & logins"
        description={
          <>
            An <span className="font-semibold">admin</span> sees everything. A{" "}
            <span className="font-semibold">staff</span> account sees the order list, an order&apos;s
            details and the to-do list — and no money anywhere.
          </>
        }
        action={
          <button onClick={() => setAdding((open) => !open)} className={`flex items-center gap-1.5 ${PANE_ACTION_CLASS}`}>
            {adding ? <X size={14} /> : <UserPlus size={14} />}
            {adding ? "Cancel" : "Add person"}
          </button>
        }
      />

      {adding && (
        <NewAccount
          busy={busy}
          onCancel={() => setAdding(false)}
          onCreate={async (input) => {
            if (await send("/api/settings/staff", "POST", input)) setAdding(false);
          }}
        />
      )}

      {error && (
        <p className="mt-3 text-xs font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-3">
        {items.map((staff) => (
          <li key={staff.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              {editingName === staff.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-sm max-md:py-2"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                  <button
                    onClick={() => saveName(staff.id)}
                    disabled={busy}
                    className="text-xs font-semibold text-accent max-md:text-sm"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  className="min-w-0 text-left"
                  onClick={() => {
                    setEditingName(staff.id);
                    setNameDraft(staff.name);
                  }}
                >
                  <p className="truncate text-sm font-semibold text-ink">{staff.name}</p>
                  <p className="truncate text-xs text-ink-soft">@{staff.username}</p>
                </button>
              )}

              {/*
                The role sits on the row's right, as the fill the app gives
                every chosen thing. Two options both worth seeing, so a
                track rather than a dropdown — the same call the calendar's
                Monthly/Weekly switch makes.
              */}
              <Segmented
                label={`Role for ${staff.name}`}
                value={staff.role}
                onChange={(role) => saveRole(staff.id, role)}
                options={ROLES.map((role) => ({ value: role, text: ROLE_LABEL[role] }))}
              />
            </div>

            {resetting === staff.id ? (
              <div className="mt-2 flex items-center gap-2 max-md:flex-wrap">
                <input
                  type="text"
                  placeholder="New password (8+ chars)"
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-sm max-md:py-2"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  onClick={() => savePassword(staff.id)}
                  disabled={busy}
                  className="text-xs font-semibold text-accent max-md:text-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setResetting(null);
                    setNewPassword("");
                  }}
                  className="text-xs font-semibold text-ink-soft max-md:text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResetting(staff.id)}
                className="mt-2 text-xs font-semibold text-ink-soft underline decoration-dotted hover:text-ink max-md:min-h-9 max-md:text-sm"
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

/**
 * The four things a new account needs.
 *
 * It **defaults to Staff**, which is the same fail-closed rule the column
 * default follows: the common case is a kitchen login, and the one role
 * that can hand out roles should have to be chosen deliberately.
 *
 * The password is shown rather than masked. It is typed by the person
 * creating the account and then read out or written down for somebody
 * else, so hiding it hides it from the only person who needs to see it —
 * and it is changed from this same pane the moment it should be.
 */
function NewAccount({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: { name: string; username: string; password: string; role: Role }) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staff");

  const field = "w-full rounded-lg border border-line px-2 py-1 text-sm max-md:py-2";

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-cream/60 p-3">
      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold tracking-[0.08em] text-ink-soft uppercase">Name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Noa" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold tracking-[0.08em] text-ink-soft uppercase">Username</span>
          <input
            className={field}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="noa"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold tracking-[0.08em] text-ink-soft uppercase">Password</span>
        <input
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8 characters or more"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold tracking-[0.08em] text-ink-soft uppercase">Role</span>
        <Segmented
          label="Role"
          value={role}
          onChange={setRole}
          options={ROLES.map((r) => ({ value: r, text: ROLE_LABEL[r] }))}
        />
        <p className="flex items-start gap-1.5 text-[11px] text-ink-soft">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          {ROLE_DESCRIPTION[role]}
        </p>
      </div>

      <div className="mt-1 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="text-xs font-semibold text-ink-soft max-md:text-sm">
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={() => onCreate({ name, username, password, role })}
          className={`${PANE_ACTION_CLASS} disabled:opacity-60`}
        >
          {busy ? "Adding…" : "Add account"}
        </button>
      </div>
    </div>
  );
}
