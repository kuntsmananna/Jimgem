import { NextResponse } from "next/server";

/**
 * A request's JSON body, or the 400 to answer with when there is none.
 *
 * `request.json()` throws on a body that isn't JSON, and a route that
 * awaited it bare answered that with a 500 — "something broke on our side"
 * for what is the caller's mistake. Reads as
 * `const body = await readJson(request); if (body instanceof NextResponse) return body;`.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return badRequest("The request didn't carry what this needs.");
  }
}

/** A refusal with the sentence the UI shows (see `saveError`). */
export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}
