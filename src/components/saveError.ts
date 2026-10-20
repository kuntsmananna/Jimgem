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

/**
 * A write, with its refusal read the way `saveError` reads every one —
 * and a request that never arrived counted as a refusal too.
 *
 * `fetch` throws rather than answering when the connection drops — offline,
 * or the weak signal a phone gets at a venue — and a caller that only reads
 * the answer is left with Save spinning for good and a value on screen that
 * was never written. `response` is null exactly then.
 */
export async function sendWrite(
  what: string,
  url: string,
  init: RequestInit,
): Promise<{ response: Response | null; error: string | null }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return {
      response: null,
      error: `Couldn't reach the server, so this ${what} wasn't saved. Check the connection and try again.`,
    };
  }
  return { response, error: await saveError(response, what) };
}
