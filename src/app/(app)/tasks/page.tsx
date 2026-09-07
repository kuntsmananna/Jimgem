import { getTasks } from "@/lib/tasks";
import { getStaff } from "@/lib/settings";
import { TaskList } from "@/components/tasks/TaskList";

export const dynamic = "force-dynamic";

/**
 * The task list on a page of its own.
 *
 * It exists for the phone, where the bottom bar carries it as one of its
 * four targets — the Dashboard, which holds the same list on a laptop, is
 * not laid out for working from and is behind More. On a laptop this page
 * is the same list with more room, which costs nothing to offer.
 */
export default async function TasksPage() {
  const [tasks, staff] = await Promise.all([getTasks(), getStaff()]);

  return (
    <div className="mx-auto max-w-3xl">
      <TaskList tasks={tasks} staff={staff} />
    </div>
  );
}
