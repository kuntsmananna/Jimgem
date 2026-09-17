/**
 * What a login is allowed to see.
 *
 * Two roles, because the business has two kinds of person in it. An
 * **admin** — Anna and Aviv — is what every account was before this
 * existed: the whole dashboard, money included. A **staff** account is the
 * kitchen and the floor: the order list, an order's details, and the
 * shared to-do list. No money anywhere, and no other page.
 *
 * This module is deliberately **client-safe** — no database, no session,
 * nothing server-only — because the same three facts are needed in three
 * places that cannot share a server module: `src/proxy.ts` at the edge,
 * the server pages that decide what to send, and the client components
 * that decide what to draw. Stating them once is what stops the three
 * drifting into disagreeing about what a staff user is.
 */

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Everything: orders, money, expenses, clients, settings.",
  staff: "Orders and the to-do list. No money, no other page.",
};

/** Anything that is not exactly "admin" is staff. Unknown fails closed. */
export function isAdmin(role: Role | string | null | undefined): boolean {
  return role === "admin";
}

/**
 * Whether this role is shown any figure in shekels at all.
 *
 * A separate function from `isAdmin` despite being the same test today:
 * every call site says *why* it is asking, and a third role that could see
 * money without being an admin would be one edit here rather than a search
 * for every `isAdmin` that happened to mean this.
 */
export function canSeeMoney(role: Role | string | null | undefined): boolean {
  return isAdmin(role);
}

/**
 * The first path segment of every page and API route a staff account may
 * reach. Everything else is refused.
 *
 * An allowlist rather than a list of things to block, so a page added next
 * month is out of reach until somebody decides it should not be — the same
 * fail-closed rule the column default follows.
 */
const STAFF_SEGMENTS = new Set(["orders", "tasks"]);

/**
 * May a staff account reach this path?
 *
 * Matched on the **first segment** rather than by prefix, because a prefix
 * test on "/" would match every page in the app, and because Next serves a
 * page's React Server Component payload beside it — the payload carries
 * the page's real data, so a rule that let `/settings.rsc` through while
 * blocking `/settings` would hand over exactly what it was written to
 * protect. A trailing `.rsc` is stripped before the comparison, and
 * anything that does not then match a known segment is refused, so the
 * Dashboard (whose first segment is the empty string) is out by
 * construction rather than by being named.
 */
export function staffCanReach(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  const first = (parts[0] ?? "").replace(/\.rsc$/, "");
  if (first === "api") {
    const resource = (parts[1] ?? "").replace(/\.rsc$/, "");
    return STAFF_SEGMENTS.has(resource);
  }
  return STAFF_SEGMENTS.has(first);
}

/** Where a staff account lands when it asks for something it cannot have. */
export const STAFF_HOME = "/orders";
