import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { currentRole } from "./auth";
import { isAdmin, STAFF_HOME } from "./roles";

/**
 * The server-side half of the role gate.
 *
 * `src/proxy.ts` already refuses a staff account every route but Orders
 * and Tasks, so this is the second lock on the two it does let through —
 * and on Settings' account management, which an admin reaches and nothing
 * else should. Two locks rather than one because they fail differently:
 * the gate reads the cookie, which is a snapshot from sign-in, while this
 * asks the database, which is current. Demote somebody and the next write
 * they attempt is refused, rather than the next time they sign in.
 *
 * Returns a 403 to hand straight back, or null when the caller may
 * proceed — so a route reads as `const no = await refuseNonAdmin(); if
 * (no) return no;` and cannot accidentally continue past a refusal the
 * way an exception-based guard can be caught and swallowed.
 */
export async function refuseNonAdmin(): Promise<NextResponse | null> {
  if (isAdmin(await currentRole())) return null;
  return NextResponse.json({ error: "Only an admin can do that." }, { status: 403 });
}

/** Whether the caller is an admin, where a route needs to branch rather than refuse. */
export async function callerIsAdmin(): Promise<boolean> {
  return isAdmin(await currentRole());
}

/**
 * The same lock on a page rather than a route.
 *
 * `src/proxy.ts` already sends a staff account to the order list before
 * any of these pages renders, so this is belt and braces — and it is worth
 * having on exactly these pages, because they *are* the money. The gate is
 * one regular expression in one file; a change to it that quietly stopped
 * matching would take every page's data with it, and a page that checks
 * for itself cannot be un-gated by an edit somewhere else.
 *
 * A redirect rather than a "not allowed" screen: there is nothing for them
 * to do about it, and the page they want is the one they get.
 */
export async function requireAdminPage(): Promise<void> {
  if (!isAdmin(await currentRole())) redirect(STAFF_HOME);
}
