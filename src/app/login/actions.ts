"use server";

import { redirect } from "next/navigation";
import { verifyCredentials } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { STAFF_HOME } from "@/lib/roles";

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const account = await verifyCredentials(username, password);
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
