import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import type { Role } from "./roles";

export interface SessionData {
  userId: number;
  username: string;
  name: string;
  /**
   * What this login may see, as it stood when they signed in.
   *
   * Here as well as in the database because `src/proxy.ts` runs at the
   * edge on every request and has only the cookie to go on — see
   * `currentRole` in `auth.ts`, which is the copy that decides what data
   * actually leaves the server.
   *
   * Optional, and absent only on a session issued before roles existed.
   * Every one of those belongs to Anna or Aviv, so the gate reads a
   * missing role as admin: the alternative is signing the two founders out
   * of their own dashboard the moment this deploys. It stops mattering
   * once both have signed in again.
   */
  role?: Role;
}

const SESSION_COOKIE_NAME = "jimgem_session";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is not set (or too short — needs 32+ chars). See .env.local.example.",
    );
  }
  return secret;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, {
    password: getSessionSecret(),
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  });
}
