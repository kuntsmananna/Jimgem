"use client";

import { createContext, useContext, type ReactNode } from "react";
import { canSeeMoney, isAdmin, type Role } from "@/lib/roles";

const RoleContext = createContext<Role | null>(null);

/**
 * What the signed-in account may see, provided from the app layout the way
 * order types, production stages and the VAT view are.
 *
 * Context rather than props for the reason `OrderTypesContext` gives: the
 * answer is needed in half a dozen unrelated trees — the table, the cards,
 * the board, the hover cards, the order form and its money rail — and
 * threading a role to all of them would touch a dozen components to say
 * one thing.
 *
 * **This is not what enforces anything.** The server has already taken the
 * money out of what a staff account is sent (`src/lib/redact.ts`), and the
 * routes refuse the writes. What this decides is only whether a component
 * draws a figure — and it has to exist, because a redacted order is full
 * of zeros, and a page saying every order is worth ₪0 is worse than one
 * that does not mention money at all.
 */
export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/**
 * Outside the provider — the login page — there is no account, so the
 * least privileged answer is the right one. Every caller asks in order to
 * decide whether to draw something, so failing closed draws nothing.
 */
export function useRole(): Role {
  return useContext(RoleContext) ?? "staff";
}

/** Whether to draw any figure in shekels at all. */
export function useCanSeeMoney(): boolean {
  return canSeeMoney(useRole());
}

/** Whether to offer the things only an admin may do — booking, deleting. */
export function useIsAdmin(): boolean {
  return isAdmin(useRole());
}
