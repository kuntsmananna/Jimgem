"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isThrottled, recentFailures, recordAttempt } from "@/lib/loginThrottle";
import { startSession, verifyCredentials } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { STAFF_HOME } from "@/lib/roles";

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // The caller's address as Vercel's edge reports it: the first entry of
  // x-forwarded-for is the client, anything after it a proxy on the way.
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  const key = username.toLowerCase();

  // Too many recent failures: refuse without checking the password at all
  // — see loginThrottle.ts.
  if (isThrottled(await recentFailures(key, ip))) {
    redirect("/login?error=wait");
  }

  const account = await verifyCredentials(username, password);
  await recordAttempt(key, ip, account !== null);
  if (!account) {
    redirect("/login?error=1");
  }

  await startSession(account);

  // Staff have no Dashboard to land on, and being bounced off "/" on the
  // first page of every session reads as the sign-in having failed.
  redirect(account.role === "admin" ? "/" : STAFF_HOME);
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
