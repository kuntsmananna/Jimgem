import { getDb, isMissingTable, reportMissingTable } from "./db";
import { getStaff } from "./settings";
import { isoStamp } from "./stamp";

/**
 * The shared to-do list.
 *
 * A line of text, who it is for, and whether it is done — and deliberately
 * nothing else. No due dates, no priorities, no projects: a task list
 * grows fields until nobody fills them in, and the surest way to stop this
 * one being used is to ask four questions before it will take a sentence.
 *
 * It replaced the Dashboard's list of the period's orders, which is kept
 * in the codebase but no longer rendered — see `DashboardOrdersPane`.
 */
export interface Task {
  /** The DB row id, as a string, like every other record in this app. */
  key: string;
  title: string;
  /** Who it is for, or null for nobody in particular. */
  staffId: number | null;
  staffName: string | null;
  /**
   * When it was ticked, or null while it is still open.
   *
   * A timestamp rather than a boolean, because the two questions a done
   * list gets asked are "what has been finished" and "when" — and it is
   * what sorts the finished ones so the newest sits at the top of them.
   */
  doneAt: string | null;
  /** Who ticked it, by name — see Order.updatedBy for why a name. */
  doneBy: string;
  createdAt: string;
  /** The version a save is matched against — see StaleWriteError. */
  updatedAt: string;
  updatedBy: string;
}

export interface TaskInput {
  title: string;
  staffId: number | null;
  /** Ticked or not. The route turns this into a stamp, or clears one. */
  done: boolean;
}

interface DbTaskRow {
  id: number;
  title: string;
  staff_id: number | null;
  done_at: string | Date | null;
  done_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  updated_by: string | null;
}

function mapTask(row: DbTaskRow, staffNameById: Map<number, string>): Task {
  return {
    key: String(row.id),
    title: row.title,
    staffId: row.staff_id,
    staffName: row.staff_id ? (staffNameById.get(row.staff_id) ?? null) : null,
    doneAt: row.done_at ? isoStamp(row.done_at) : null,
    doneBy: row.done_by ?? "",
    createdAt: isoStamp(row.created_at),
    updatedAt: isoStamp(row.updated_at),
    updatedBy: row.updated_by ?? "",
  };
}

/**
 * Every task, in the order the list draws them: **open first, newest at
 * the top of each half.**
 *
 * Newest first rather than oldest, because the composer sits at the top of
 * the list and a task should appear where it was just typed. The done ones
 * sink below the open ones rather than disappearing — the owner's call:
 * they are what says the day went somewhere, and unticking a mis-tap has
 * to be possible without going to look for the row.
 *
 * Ordered in SQL rather than in the component, so the page and the
 * Dashboard pane cannot disagree about it.
 */
export async function getTasks(): Promise<Task[]> {
  const db = getDb();
  try {
    const [{ rows }, staff] = await Promise.all([
      db.query<DbTaskRow>(
        `SELECT * FROM tasks
          WHERE deleted_at IS NULL
          ORDER BY (done_at IS NOT NULL), COALESCE(done_at, created_at) DESC, id DESC`,
      ),
      getStaff(),
    ]);
    const staffNameById = new Map(staff.map((person) => [person.id, person.name]));
    return rows.map((row) => mapTask(row, staffNameById));
  } catch (error) {
    // The minutes between a deploy and migration 029 being pasted in. An
    // empty list is the truthful answer and keeps the Dashboard up — the
    // same degrading the SUMIT meter and the backups pane do, and per
    // table so a connection failure is never read as "run the migration".
    if (!isMissingTable(error, "tasks")) throw error;
    await reportMissingTable("tasks", "scripts/migrate-029-tasks.sql");
    return [];
  }
}

export async function createTask(input: TaskInput, editor?: string): Promise<Task> {
  const db = getDb();
  const [{ rows }, staff] = await Promise.all([
    db.query<DbTaskRow>(
      `INSERT INTO tasks (title, staff_id, done_at, done_by, updated_by)
       VALUES ($1, $2, ${input.done ? "now()" : "NULL"}, $3, $4)
       RETURNING *`,
      [input.title.trim(), input.staffId, input.done ? (editor ?? null) : null, editor ?? null],
    ),
    getStaff(),
  ]);
  return mapTask(rows[0], new Map(staff.map((person) => [person.id, person.name])));
}

/**
 * Change a task.
 *
 * `done_at` is only written when the tick actually moves: ticking a task
 * that is already done must not restamp it, or the finished half of the
 * list would reshuffle every time somebody edited a title. `done_by`
 * follows the stamp for the same reason.
 */
export async function updateTask(id: number, input: TaskInput, editor?: string): Promise<Task> {
  const db = getDb();
  const [{ rows }, staff] = await Promise.all([
    db.query<DbTaskRow>(
      `UPDATE tasks
          SET title = $1,
              staff_id = $2,
              done_at = CASE
                WHEN $3::boolean AND done_at IS NULL THEN now()
                WHEN $3::boolean THEN done_at
                ELSE NULL
              END,
              done_by = CASE
                WHEN $3::boolean AND done_at IS NULL THEN $4
                WHEN $3::boolean THEN done_by
                ELSE NULL
              END,
              updated_at = now(),
              updated_by = $4
        WHERE id = $5
        RETURNING *`,
      [input.title.trim(), input.staffId, input.done, editor ?? null, id],
    ),
    getStaff(),
  ]);
  if (rows.length === 0) throw new Error(`No task ${id}.`);
  return mapTask(rows[0], new Map(staff.map((person) => [person.id, person.name])));
}

/** Put aside, not destroyed — so the Undo beside "Task deleted" works. */
export async function deleteTask(id: number): Promise<void> {
  await getDb().query("UPDATE tasks SET deleted_at = now() WHERE id = $1", [id]);
}

/** The other direction, for that Undo. */
export async function restoreTask(id: number): Promise<void> {
  await getDb().query("UPDATE tasks SET deleted_at = NULL WHERE id = $1", [id]);
}
