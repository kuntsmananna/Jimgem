import { getSession } from "./session";

/**
 * Who is signed in, as the name to stamp on a row they change.
 *
 * A name rather than a staff id: `updated_by` records who did it *at the
 * time*, and should keep saying that if the person is later renamed — the
 * opposite of `expenses.staff_id`, which points at a person the row is
 * about. Undefined when there is somehow no session, so the write still
 * lands rather than failing over a caption.
 */
export async function currentEditor(): Promise<string | undefined> {
  try {
    const session = await getSession();
    return session.name || session.username || undefined;
  } catch {
    return undefined;
  }
}
