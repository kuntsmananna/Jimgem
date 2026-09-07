-- 029 — a shared to-do list.
--
-- Two people run this business and the things between them -- order more
-- trays, call the accountant, chase a deposit -- lived in WhatsApp, where
-- they scroll away. A list on the dashboard is a list both of them see.
--
-- Deliberately small: a line of text, who it is for, and whether it is
-- done. Not due dates, not priorities, not projects. A task list grows
-- fields until nobody fills them in, and the fastest way to stop this one
-- being used is to ask four questions before it will accept a sentence.
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  -- Free text, like an expense's business or an order's customer: what
  -- needs doing is a sentence, and a list of allowed sentences is not a
  -- thing that exists.
  title TEXT NOT NULL,
  -- Who it is for, or nobody. A real reference rather than a name,
  -- unlike `updated_by` beside it: this is a person the task is *about*
  -- and should follow them if they are renamed, which is exactly the
  -- distinction `expenses.staff_id` already draws.
  staff_id INTEGER REFERENCES staff(id),
  -- When it was ticked, not whether. The timestamp is what sorts the done
  -- ones so the most recently finished sits at the top of them, and
  -- unticking is simply setting it back to NULL.
  done_at TIMESTAMPTZ(3),
  -- Who ticked it. A name for the reason updated_by is a name everywhere
  -- else -- it records who did it at the time.
  done_by TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_by TEXT,
  -- Put aside rather than destroyed, like an order or an expense, so the
  -- Undo beside "Task deleted" brings back the same row
  deleted_at TIMESTAMPTZ(3)
);

-- The list's own order: open first, newest at the top of each half.
CREATE INDEX IF NOT EXISTS tasks_open_idx ON tasks (done_at NULLS FIRST, created_at DESC)
  WHERE deleted_at IS NULL;

-- Watched like every other table that holds real data, so "who ticked
-- that off" and "who deleted it" are answerable from Settings -> Data.
-- `watch_table` is defined by migration 026, which every database this
-- runs against has had; the DO block is so a database that somehow has
-- not gets the table anyway rather than failing here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'watch_table') THEN
    PERFORM watch_table('tasks', 'id');
  END IF;
END
$$;
