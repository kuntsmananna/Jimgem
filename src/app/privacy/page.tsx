import type { Metadata } from "next";
import Link from "next/link";
import { GemsLogo } from "@/components/GemsLogo";

export const metadata: Metadata = { title: "Privacy — Gems" };

/**
 * The privacy policy Google asks for before an OAuth app can leave Testing
 * (v0.97.1). Public — outside the session gate in `proxy.ts` — because
 * Google's reviewers and anyone on the consent screen must be able to read
 * it without an account.
 *
 * It describes what the code actually does, and must be kept that way: if
 * sign-in or the calendar sync start doing something new with Google data,
 * this page changes in the same commit. No personal address in it — the
 * business's own site is the contact point.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-cream px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-card border border-line bg-card p-8 text-sm leading-relaxed text-ink">
        <GemsLogo className="h-12 w-auto text-brand" />
        <h1 className="font-display mt-6 text-2xl font-extrabold">Privacy policy</h1>
        <p className="mt-1 text-ink-soft">Gems dashboard · last updated 23 November 2026</p>

        <h2 className="mt-6 font-bold">What this is</h2>
        <p className="mt-1">
          The Gems dashboard is the private internal tool of Gems Cocktail Bites (gem-bites.com), used by its own
          team to manage orders, clients and expenses. There is no public sign-up: only people the business has
          given an account can sign in.
        </p>

        <h2 className="mt-6 font-bold">Signing in with Google</h2>
        <p className="mt-1">
          If you choose &ldquo;Continue with Google&rdquo;, we receive your name and your verified email address
          from Google. We use the email address only to find the dashboard account it belongs to and sign you in.
          We keep a record of sign-in attempts (the address used, time and IP address) for one day, to protect
          accounts from password guessing.
        </p>

        <h2 className="mt-6 font-bold">Connecting a Google Calendar</h2>
        <p className="mt-1">
          A team member may choose to connect their Google Calendar. The dashboard then creates one calendar of
          its own in that Google account, named &ldquo;Gems orders&rdquo;, and writes the business&apos;s orders
          into it as events — the date and times, customer name, place and what is being made. It uses Google&apos;s{" "}
          <code className="font-mono text-xs">calendar.app.created</code> permission, which allows access only to
          calendars the dashboard itself created. It cannot see, read or change any other calendar or event.
        </p>
        <p className="mt-2">
          To keep that calendar up to date, we store the access token Google provides. It is used for nothing
          else, is never included in downloaded backups, and is deleted when the calendar is disconnected.
        </p>

        <h2 className="mt-6 font-bold">Sharing</h2>
        <p className="mt-1">
          We do not sell, rent or share Google user data with anyone, and we do not use it for advertising.
          The dashboard&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a
            className="underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noreferrer"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2 className="mt-6 font-bold">Removing access</h2>
        <p className="mt-1">
          Disconnecting the calendar in the dashboard (Settings → Team) deletes the &ldquo;Gems orders&rdquo;
          calendar, revokes the token and removes it from our records. You can also remove the dashboard&apos;s
          access at any time from your Google Account&apos;s{" "}
          <a className="underline" href="https://myaccount.google.com/permissions" rel="noreferrer" target="_blank">
            third-party access page
          </a>
          .
        </p>

        <h2 className="mt-6 font-bold">Contact</h2>
        <p className="mt-1">
          Questions about this policy: contact Gems Cocktail Bites through{" "}
          <a className="underline" href="https://gem-bites.com" rel="noreferrer" target="_blank">
            gem-bites.com
          </a>
          .
        </p>

        <p className="mt-8">
          <Link href="/login" className="font-semibold text-accent underline">
            Sign in
          </Link>
        </p>
      </article>
    </div>
  );
}
