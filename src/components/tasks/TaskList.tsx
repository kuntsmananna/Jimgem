"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import type { Task } from "@/lib/tasks";
import type { StaffAccount } from "@/lib/settings";
import { UndoToast, useUndoToast } from "@/components/UndoToast";

/**
 * The shared to-do list — the Dashboard's pane and the whole of `/tasks`.
 *
 * One component in both places rather than a pane and a page that drift:
 * the only difference between them is how much room they have, and a list
 * of one-line rows needs no second layout for that.
 *
 * **A done task sinks and stays.** It is struck through and drops below
 * the open ones rather than disappearing — the owner's call, and the right
 * one: what was finished is half of what a list is read for, and a mis-tap
 * has to be untickable without going to look for the row.
 *
 * Everything here is one tap: the box ticks it, the text edits in place,
 * the chip reassigns it. There is no popup, because a task is one sentence
 * and a dialog to change a sentence is a dialog nobody opens.
 */
export function TaskList({
  tasks,
  staff,
  /** The pane on the Dashboard keeps its own heading, so it turns this off. */
  heading = true,
}: {
  tasks: Task[];
  staff: StaffAccount[];
  heading?: boolean;
}) {
  const router = useRouter();
  const undo = useUndoToast();
  /*
    The server's list, held locally so a tick shows immediately.

    It is re-seeded whenever the server sends a new one — which is what
    `router.refresh()` after every write produces — so the optimistic copy
    is a head start on the truth and never a second version of it.

    Re-seeded **during render**, comparing the props against the last ones
    seen, rather than from an effect: React's own answer for adjusting
    state when a prop changes, and the only one that does not paint the
    stale list for a frame first. An effect here would also be a cascading
    render, which the lint rule says out loud.
  */
  const [rows, setRows] = useState(tasks);
  const [seen, setSeen] = useState(tasks);
  if (seen !== tasks) {
    setSeen(tasks);
    setRows(tasks);
  }

  const openCount = rows.filter((task) => !task.doneAt).length;

  async function send(task: Task, body: Record<string, unknown>) {
    await fetch(`/api/tasks/${task.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: task.title, staffId: task.staffId, done: !!task.doneAt, ...body }),
    });
    router.refresh();
  }

  /*
    Ticking marks the row where it is and lets the *server's* order move
    it, rather than re-sorting here.

    Two reasons, and both matter. The order is stated once, in SQL
    (`getTasks`), so a copy of it here is a second place for it to be
    wrong. And a row that jumped to the bottom of the list the instant it
    was tapped would take the next row up under the finger already on its
    way to it — settling a moment later is the kinder animation as well as
    the simpler code.
  */
  function toggle(task: Task) {
    const done = !task.doneAt;
    setRows((current) =>
      current.map((row) =>
        row.key === task.key ? { ...row, doneAt: done ? new Date().toISOString() : null } : row,
      ),
    );
    void send(task, { done });
  }

  async function remove(task: Task) {
    setRows((current) => current.filter((row) => row.key !== task.key));
    await fetch(`/api/tasks/${task.key}`, { method: "DELETE" });
    router.refresh();
    // Put aside rather than destroyed, so this offer is real — see
    // `deleteTask`. The offer lapses; the row stays recoverable.
    undo.show("Task deleted", async () => {
      await fetch(`/api/tasks/${task.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      router.refresh();
    });
  }

  return (
    <>
      {heading && (
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Tasks <span className="font-normal text-ink-soft">({openCount} open)</span>
        </h2>
      )}

      <Composer staff={staff} onAdded={() => router.refresh()} />

      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.map((task) => (
          <TaskRow
            key={task.key}
            task={task}
            staff={staff}
            onToggle={() => toggle(task)}
            onSave={(change) => send(task, change)}
            onDelete={() => remove(task)}
          />
        ))}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-ink-soft">
            Nothing on the list. Type the first one above.
          </li>
        )}
      </ul>

      <UndoToast offer={undo.offer} onDismiss={undo.dismiss} />
    </>
  );
}

/**
 * The box you type into, at the top of the list.
 *
 * At the top rather than the bottom because that is where the new task
 * then appears — `getTasks` puts the newest first — so the thing just
 * typed is next to the box it was typed in, instead of a scroll away.
 *
 * Enter adds it. The button is there for a phone, where there is a Return
 * key but no habit of trusting it.
 */
function Composer({ staff, onAdded }: { staff: StaffAccount[]; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [staffId, setStaffId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add() {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: text, staffId, done: false }),
    });
    setBusy(false);
    // The text clears and the assignee does not: adding three things for
    // the same person is the common case, and re-picking them each time is
    // the sort of friction that ends with the list not being used.
    setTitle("");
    input.current?.focus();
    onAdded();
  }

  return (
    <div className="flex items-center gap-2 max-md:flex-wrap">
      <input
        ref={input}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void add();
        }}
        placeholder="Add a task"
        aria-label="Add a task"
        /* `basis-full` below the breakpoint, so the box is the whole first
           line and the picker and the button share the second. Left to
           `flex-1` it shrank instead of wrapping, and at 360px "Add a
           task" was cut to "Add a tas" in the field it names. */
        className="input min-w-0 flex-1 rounded-xl border border-line bg-cream/60 px-3 py-2 text-sm max-md:basis-full"
      />
      <AssigneeSelect staff={staff} value={staffId} onChange={setStaffId} />
      <button
        onClick={() => void add()}
        disabled={!title.trim() || busy}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-black px-3.5 py-2 text-xs font-semibold text-cream transition disabled:opacity-40"
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}

/**
 * One task: tick, text, who, and a way to remove it.
 *
 * The row is not a button. Three of its four parts are controls of their
 * own, and a row that also did something on click would make every reach
 * for the assignee a gamble — the same reasoning the expense row states
 * about swallowing its inline editors' clicks.
 */
function TaskRow({
  task,
  staff,
  onToggle,
  onSave,
  onDelete,
}: {
  task: Task;
  staff: StaffAccount[];
  onToggle: () => void;
  onSave: (change: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const done = !!task.doneAt;

  function commit() {
    setEditing(false);
    const text = draft.trim();
    // An emptied task is a slip, not an instruction to blank the row —
    // and the route would refuse it anyway. Put the text back.
    if (!text || text === task.title) {
      setDraft(task.title);
      return;
    }
    onSave({ title: text });
  }

  return (
    <li
      /*
        `flex-wrap` is doing one job, and only below the breakpoint: the
        assignee and the trash drop to a line of their own. Measured at
        360px, the row has 296px of content and the select alone took
        ~200 of it — the phone rules size every `select` to 16px so iOS
        does not zoom, and its width comes from its longest option — which
        left the task itself four characters wide. The *task* is the row;
        it gets the first line whole.

        Nothing moves on a laptop: at that width every child fits and a
        wrapping row that does not wrap is the row it was.
      */
      className={`group flex flex-wrap items-center gap-2.5 rounded-xl border border-line px-3 py-2 ${
        // A finished task takes the cream the page is already made of, the
        // same way a delivered order does on the phone's Orders list: the
        // list then separates at a glance into what is left and what is
        // done, without changing a single text colour and so without
        // costing any contrast.
        done ? "bg-cream" : "bg-card"
      }`}
    >
      {/*
        The tick. A button rather than a real checkbox because the app's
        phone rules size every `input` to 16px and give none of them a
        target, and this one needs to be 24px and square on both.
      */}
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" done`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition max-md:h-7 max-md:w-7 ${
          done ? "border-accent bg-accent text-cream" : "border-line hover:border-ink"
        }`}
      >
        {done && <Check size={14} strokeWidth={3} />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
          className="input min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-sm"
        />
      ) : (
        /* `taps-to-edit` is the named opt-in that gives a row which edits
           on tap a resting fill where there is no hover — without it a
           phone says nothing about the text being editable at all. */
        <button
          onClick={() => setEditing(true)}
          /*
            One line on a laptop, where the pane is a column of rows and an
            even rhythm is what makes it scannable — the full text is a
            hover away in the title. On a phone the line is the row's own,
            so it wraps instead: a task you cannot finish reading is not a
            task, and there is nothing beside it to keep in step with.
          */
          className={`taps-to-edit min-w-0 flex-1 truncate rounded-lg px-1 py-1 text-left text-sm max-md:overflow-visible max-md:text-clip max-md:whitespace-normal ${
            done ? "text-ink-soft line-through" : "text-ink"
          }`}
          title={task.title}
        >
          {task.title}
        </button>
      )}

      {/* The two together, so they wrap as one and land right-aligned
          under the task rather than one per line. */}
      <div className="flex items-center gap-2 max-md:basis-full max-md:justify-end">
        <AssigneeSelect
          staff={staff}
          value={task.staffId}
          onChange={(staffId) => onSave({ staffId })}
          subdued={done}
        />

        <button
          onClick={onDelete}
          title="Delete this task"
          aria-label={`Delete "${task.title}"`}
          className="reveals-on-hover invisible shrink-0 rounded-full p-1.5 text-ink-soft transition group-hover:visible hover:text-ink max-md:p-2"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

/**
 * Who a task is for, as a chip that is also the control.
 *
 * A native `<select>` rather than the `EditableCell` the tables use: that
 * one announces itself by hover, which is exactly the affordance a phone
 * does not have, and this list is meant to be worked from one. A select is
 * a control in both places and needs no second state to reach.
 */
function AssigneeSelect({
  staff,
  value,
  onChange,
  subdued = false,
}: {
  staff: StaffAccount[];
  value: number | null;
  onChange: (staffId: number | null) => void;
  subdued?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      aria-label="Who it is for"
      className={`shrink-0 cursor-pointer rounded-full border border-line bg-transparent px-2 py-1 text-[11px] font-semibold transition hover:border-ink max-md:px-2.5 max-md:py-1.5 ${
        value ? "text-ink" : "text-ink-soft"
      } ${subdued ? "opacity-60" : ""}`}
    >
      <option value="">Anyone</option>
      {staff.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}
