"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isThrottled, recentFailures, recordAttempt } from "@/lib/loginThrottle";
import { verifyCredentials } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { STAFF_HOME } from "@/lib/roles";

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // The caller's address as Vercel's edge reports it: the first entry of
  // x-forwarded-for is the client, anything after it a proxy on the way.
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || (await headers()).get("x-real-ip") || "unknown";
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

  const session = await getSession();
  session.userId = account.id;
  session.username = account.username;
  session.name = account.name;
  // The cheap copy of the role, for the edge gate. The database is what
  // decides what data leaves the server -- see `currentRole` in auth.ts.
  session.role = account.role;
  session.version = account.sessionVersion;
  await session.save();

  // Staff have no Dashboard to land on, and being bounced off "/" on the
  // first page of every session reads as the sign-in having failed.
  redirect(account.role === "admin" ? "/" : STAFF_HOME);
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
