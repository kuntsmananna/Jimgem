import { getTasks } from "@/lib/tasks";
import { getStaff } from "@/lib/settings";
import { TaskList } from "@/components/tasks/TaskList";
import { requireSignedInPage } from "@/lib/guard";
import { isAdmin } from "@/lib/roles";
import { redactStaff } from "@/lib/redact";

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
  // Asked here and not only in the app layout, which a client-side
  // navigation does not re-render — see requireSignedInPage.
  const [role, tasks, staff] = await Promise.all([requireSignedInPage(), getTasks(), getStaff()]);

  return (
    <div className="mx-auto max-w-3xl">
      <TaskList tasks={tasks} staff={isAdmin(role) ? staff : redactStaff(staff)} />
    </div>
  );
}
