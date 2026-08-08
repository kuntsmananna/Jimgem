"use server";

import { redirect } from "next/navigation";
import { verifyCredentials } from "@/lib/auth";
import { getSession } from "@/lib/session";

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
  await session.save();

  redirect("/");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
