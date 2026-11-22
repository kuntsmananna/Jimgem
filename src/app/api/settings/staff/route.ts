import { NextRequest, NextResponse } from "next/server";
import { createStaff } from "@/lib/settings";
import { refuseNonAdmin } from "@/lib/guard";
import { ROLES, type Role } from "@/lib/roles";

export const runtime = "nodejs";

/** The shortest password this will accept, stated once — the panel says it too. */
const MIN_PASSWORD = 8;

/** A deliberately loose shape check — something@something.something, no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add an account.
 *
 * There is still no self-service signup: this is behind the session gate,
 * behind Settings (which a staff account cannot reach at all), and behind
 * an admin check of its own that asks the database rather than the cookie.
 * What has changed is that the business has more than two people in it,
 * and making a kitchen login should not mean a hand-written INSERT.
 *
 * Every refusal names the field, because the panel prints what comes back
 * — a create that fails silently on a duplicate username is indisting-
 * uishable from one that worked.
 */
export async function POST(request: NextRequest) {
  const refusal = await refuseNonAdmin();
  if (refusal) return refusal;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  // Case-folded, because "Anna" and "anna" signing in as different people
  // is a trap rather than a feature, and the unique index is exact.
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = body.role as Role;
  // Optional: the address they can also sign in with. Lower-cased to match
  // the case-insensitive unique index and the login lookup.
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!name) return NextResponse.json({ error: "Give them a name." }, { status: 400 });
  if (email && !EMAIL.test(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    return NextResponse.json(
      { error: "A username is 3+ characters, letters, numbers, dot, dash or underscore." },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `A password needs ${MIN_PASSWORD} characters or more.` },
      { status: 400 },
    );
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Pick a role." }, { status: 400 });
  }

  try {
    return NextResponse.json(await createStaff({ name, username, password, role, email: email || null }), {
      status: 201,
    });
  } catch (error) {
    // The unique indexes are the failures worth wording: a taken username
    // or an email already on another account — both the person can fix.
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      const taken = /email/i.test(error.message) ? "That email is already on another account." : `“${username}” is taken.`;
      return NextResponse.json({ error: taken }, { status: 409 });
    }
    console.error("Failed to create a staff account:", error);
    return NextResponse.json({ error: "Couldn't create the account." }, { status: 500 });
  }
}
