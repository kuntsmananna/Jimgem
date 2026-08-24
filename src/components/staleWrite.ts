"use client";

/**
 * The message behind a refused save, or null if the save was fine.
 *
 * Every write that can be refused reads the same 409 in the same way — the
 * route already sends the sentence, so a call site's only job is to show
 * it. The fallback is here rather than repeated four times, for the case
 * where the body isn't the JSON we expect.
 */
export async function staleWriteMessage(
  response: Response,
  what: string,
): Promise<string | null> {
  if (response.status !== 409) return null;
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Someone else changed this ${what} while you had it open.`;
  } catch {
    return `Someone else changed this ${what} while you had it open.`;
  }
}
