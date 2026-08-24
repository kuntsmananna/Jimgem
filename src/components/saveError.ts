"use client";

/**
 * The message behind a refused save, or null if the save went through.
 *
 * Every write reads its failures the same way, so the reading lives here
 * rather than at each call site. Two cases, deliberately worded apart: a
 * **409** is the stale-save guard — nothing failed, the caller's copy is
 * just out of date, and the route sends the sentence to show. Anything
 * else is a genuine failure, and the important half of that message is
 * "nothing was written": a form that closes on a 500 loses the draft,
 * which is the one copy of that work.
 */
export async function saveError(response: Response, what: string): Promise<string | null> {
  if (response.ok) return null;
  const sent = await errorFromBody(response);
  if (response.status === 409) {
    return sent ?? `Someone else changed this ${what} while you had it open.`;
  }
  return sent
    ? `Couldn't save this ${what}: ${sent}`
    : `Couldn't save this ${what} — nothing was written.`;
}

/** Null for a body that isn't the JSON the routes send. */
async function errorFromBody(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}
