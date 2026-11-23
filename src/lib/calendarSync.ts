import { after } from "next/server";
import { getDb, isMissingTable, reportMissingTable } from "./db";
import { getOrders } from "./orders";
import { getDisplayOptions, getFlavors, getPackageTypes, getProductionStages } from "./settings";
import { stageMap, type Order } from "./orderTypes";
import { calendarEventId, eventHash, orderEvent, type CalendarEventBody, type EventContext } from "./calendarEvent";
import { RefreshRevokedError, refreshAccessToken, revokeToken } from "./googleOAuth";

/**
 * Each admin's Google Calendar, kept in step with the orders (v0.97,
 * migration 037).
 *
 * **One-way and reconciling.** A sync does not replay a log of what
 * changed; it works out what every order *should* look like in the
 * calendar (`orderEvent`), compares a fingerprint against the one stored
 * from last time, and writes only the differences — then takes down the
 * events of orders that have been deleted. Run it twice and the second run
 * writes nothing. That is what makes it safe to fire from every order save
 * (`scheduleCalendarSync`, after the response has gone) and again from the
 * nightly cron as a net for anything a save missed, without a queue.
 *
 * **Its own calendar, not theirs.** Connecting makes a calendar called
 * "Gems orders" inside the admin's Google account and writes only there,
 * under the `calendar.app.created` scope, which cannot see or touch any
 * other calendar. They can colour it, hide it, or share it from Google
 * Calendar; disconnecting deletes it.
 *
 * Google is never called on a render path. The Settings pane reads only
 * what is stored here.
 */

const API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_NAME = "Gems orders";
const TIME_ZONE = "Asia/Jerusalem";
/** How far back a sync reaches. Older events are left as they were written. */
const LOOKBACK_DAYS = 31;
/** Calls in flight at once per calendar — gentle on Google's rate limit. */
const CONCURRENCY = 4;

export interface CalendarConnection {
  /** False until migration 037 has been run against this database. */
  available: boolean;
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Connected once, but Google has since withdrawn access. */
  needsReconnect: boolean;
}

interface ConnectionRow {
  staff_id: number;
  google_email: string;
  calendar_id: string;
  refresh_token: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

/** What the Settings pane shows for one admin. Never calls Google. */
export async function getCalendarConnection(staffId: number): Promise<CalendarConnection> {
  try {
    const { rows } = await getDb().query<ConnectionRow>(
      "SELECT * FROM calendar_connections WHERE staff_id = $1",
      [staffId],
    );
    const row = rows[0];
    if (!row) return { available: true, connected: false, googleEmail: null, lastSyncedAt: null, lastError: null, needsReconnect: false };
    return {
      available: true,
      connected: true,
      googleEmail: row.google_email,
      lastSyncedAt: row.last_synced_at,
      lastError: row.last_error,
      needsReconnect: row.refresh_token === null,
    };
  } catch (error) {
    if (!isMissingTable(error, "calendar_connections")) throw error;
    await reportMissingTable("calendar_connections", "migrate-037-calendar-sync.sql");
    return { available: false, connected: false, googleEmail: null, lastSyncedAt: null, lastError: null, needsReconnect: false };
  }
}

/** A Calendar API call. Returns the response so callers can read the status they care about. */
async function google(accessToken: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function failure(response: Response, what: string): Promise<Error> {
  const detail = await response.text().catch(() => "");
  console.error(`Google Calendar ${what} failed (${response.status}):`, detail.slice(0, 300));
  return new Error(`Google Calendar ${what} failed (${response.status}).`);
}

/**
 * The calendar this app writes into: the one already on file if Google
 * still has it, else a new one. A reconnect keeps the same calendar — and
 * with it whatever colour or sharing the admin gave it.
 */
async function ensureCalendar(accessToken: string, existingId: string | null): Promise<string> {
  if (existingId) {
    const found = await google(accessToken, "GET", `/calendars/${encodeURIComponent(existingId)}`);
    if (found.ok) return existingId;
  }
  const created = await google(accessToken, "POST", "/calendars", {
    summary: CALENDAR_NAME,
    description: "Orders from the Gems dashboard. Kept up to date automatically — edit the order there, not here.",
    timeZone: TIME_ZONE,
  });
  if (!created.ok) throw await failure(created, "calendar create");
  const calendar = (await created.json()) as { id: string };
  return calendar.id;
}

/**
 * Called from the OAuth callback once Google has handed back a refresh
 * token. Makes (or finds) the calendar and stores the connection. Starting
 * on a new calendar clears what was recorded as written to the old one,
 * so the first sync fills the new one in full.
 */
export async function saveCalendarConnection(
  staffId: number,
  googleEmail: string,
  refreshToken: string,
  accessToken: string,
): Promise<void> {
  const db = getDb();
  const { rows } = await db.query<{ calendar_id: string }>(
    "SELECT calendar_id FROM calendar_connections WHERE staff_id = $1",
    [staffId],
  );
  const previous = rows[0]?.calendar_id ?? null;
  const calendarId = await ensureCalendar(accessToken, previous);
  await db.query(
    `WITH saved AS (
       INSERT INTO calendar_connections (staff_id, google_email, calendar_id, refresh_token, last_error)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (staff_id) DO UPDATE
         SET google_email = EXCLUDED.google_email, calendar_id = EXCLUDED.calendar_id,
             refresh_token = EXCLUDED.refresh_token, last_error = NULL
       RETURNING staff_id
     )
     DELETE FROM calendar_events WHERE staff_id = $1 AND $5::boolean`,
    [staffId, googleEmail, calendarId, refreshToken, previous !== calendarId],
  );
}

/**
 * Disconnects an admin: deletes the app's calendar from their Google
 * account (it only ever held these events), withdraws the token, and
 * forgets the connection. Google failing is not a reason to keep the
 * connection — the person asked for it gone.
 */
export async function disconnectCalendar(staffId: number): Promise<void> {
  const db = getDb();
  const { rows } = await db.query<ConnectionRow>("SELECT * FROM calendar_connections WHERE staff_id = $1", [staffId]);
  const row = rows[0];
  if (!row) return;
  if (row.refresh_token) {
    try {
      const accessToken = await refreshAccessToken(row.refresh_token);
      await google(accessToken, "DELETE", `/calendars/${encodeURIComponent(row.calendar_id)}`);
    } catch (error) {
      console.error("Couldn't delete the Gems calendar while disconnecting:", error);
    }
    await revokeToken(row.refresh_token);
  }
  // calendar_events goes with it (ON DELETE CASCADE).
  await db.query("DELETE FROM calendar_connections WHERE staff_id = $1", [staffId]);
}

/**
 * Writes one event. `PUT` first, since after the first sync nearly every
 * write is an update; a 404 means it was never made (or Google purged it),
 * so it is created with its chosen id; a 409 on that create means another
 * sync made it a moment ago, and the update is simply tried again. `PUT`
 * on an event that was deleted brings it back, because the body carries
 * its status.
 */
async function putEvent(accessToken: string, calendarId: string, event: CalendarEventBody): Promise<void> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const path = `${base}/${event.id}`;
  let response = await google(accessToken, "PUT", path, event);
  if (response.status === 404) {
    response = await google(accessToken, "POST", base, event);
    if (response.status === 409) response = await google(accessToken, "PUT", path, event);
  }
  if (!response.ok) throw await failure(response, "event write");
}

async function deleteEvent(accessToken: string, calendarId: string, orderId: number): Promise<void> {
  const response = await google(
    accessToken,
    "DELETE",
    `/calendars/${encodeURIComponent(calendarId)}/events/${calendarEventId(orderId)}`,
  );
  // 404 / 410: already gone, which is the state this was asking for.
  if (!response.ok && response.status !== 404 && response.status !== 410) throw await failure(response, "event delete");
}

/** Runs `work` over `items`, a few at a time. */
async function inBatches<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  for (let at = 0; at < items.length; at += CONCURRENCY) {
    await Promise.all(items.slice(at, at + CONCURRENCY).map(work));
  }
}

function lookbackStart(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - LOOKBACK_DAYS);
  return date.toISOString().slice(0, 10);
}

/** The orders and lookups every connection's sync reads — loaded once per run. */
async function loadContext(appUrl: string): Promise<{ orders: Order[]; ctx: EventContext }> {
  const [orders, packageTypes, flavors, displays, stages] = await Promise.all([
    getOrders(),
    // Archived included: these resolve rows already stored, and an order
    // that used a since-retired package must still say what it holds.
    getPackageTypes(true),
    getFlavors(true),
    getDisplayOptions(true),
    getProductionStages(true),
  ]);
  return {
    orders,
    ctx: {
      unitsPerPackage: new Map(packageTypes.map((type) => [type.id, type.unitsPerPackage])),
      packageNames: new Map(packageTypes.map((type) => [type.id, type.name])),
      flavorNames: new Map(flavors.map((flavor) => [flavor.id, flavor.name])),
      displayNames: new Map(displays.map((option) => [option.id, option.name])),
      stages: stageMap(stages),
      appUrl,
    },
  };
}

export interface SyncResult {
  staffId: number;
  written: number;
  removed: number;
  error?: string;
}

/**
 * Brings every connected calendar (or one admin's) up to date.
 *
 * Never throws for one calendar's sake: each connection's failure is
 * recorded on its row, shown in Settings, and the others carry on. Resolves
 * to an empty list before migration 037 has been run.
 */
export async function syncCalendars(options: { staffId?: number; appUrl: string }): Promise<SyncResult[]> {
  const db = getDb();
  let connections: ConnectionRow[];
  try {
    const { rows } = await db.query<ConnectionRow>(
      options.staffId === undefined
        ? "SELECT * FROM calendar_connections WHERE refresh_token IS NOT NULL"
        : "SELECT * FROM calendar_connections WHERE refresh_token IS NOT NULL AND staff_id = $1",
      options.staffId === undefined ? [] : [options.staffId],
    );
    connections = rows;
  } catch (error) {
    if (isMissingTable(error, "calendar_connections")) return [];
    throw error;
  }
  if (connections.length === 0) return [];

  const { orders, ctx } = await loadContext(options.appUrl);
  const since = lookbackStart();
  const inWindow = orders.filter((order) => order.date >= since);
  // Every live order, whatever its date: an event is taken down only when
  // its order is gone, never because the order has slipped into the past.
  const live = new Set(orders.map((order) => Number(order.key)));

  const results: SyncResult[] = [];
  for (const connection of connections) {
    results.push(await syncOne(connection, inWindow, live, ctx));
  }
  return results;
}

async function syncOne(
  connection: ConnectionRow,
  orders: Order[],
  live: Set<number>,
  ctx: EventContext,
): Promise<SyncResult> {
  const db = getDb();
  const staffId = connection.staff_id;
  let written = 0;
  let removed = 0;
  try {
    const accessToken = await refreshAccessToken(connection.refresh_token!);

    const { rows: stored } = await db.query<{ order_id: number; content_hash: string }>(
      "SELECT order_id, content_hash FROM calendar_events WHERE staff_id = $1",
      [staffId],
    );
    const hashes = new Map(stored.map((row) => [row.order_id, row.content_hash]));

    const changed = orders
      .map((order) => ({ orderId: Number(order.key), event: orderEvent(order, ctx) }))
      .map((entry) => ({ ...entry, hash: eventHash(entry.event) }))
      .filter((entry) => hashes.get(entry.orderId) !== entry.hash);

    await inBatches(changed, async ({ orderId, event, hash }) => {
      await putEvent(accessToken, connection.calendar_id, event);
      await db.query(
        `INSERT INTO calendar_events (staff_id, order_id, content_hash, synced_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (staff_id, order_id) DO UPDATE SET content_hash = EXCLUDED.content_hash, synced_at = now()`,
        [staffId, orderId, hash],
      );
      written += 1;
    });

    const gone = stored.map((row) => row.order_id).filter((orderId) => !live.has(orderId));
    await inBatches(gone, async (orderId) => {
      await deleteEvent(accessToken, connection.calendar_id, orderId);
      await db.query("DELETE FROM calendar_events WHERE staff_id = $1 AND order_id = $2", [staffId, orderId]);
      removed += 1;
    });

    await db.query("UPDATE calendar_connections SET last_synced_at = now(), last_error = NULL WHERE staff_id = $1", [staffId]);
    return { staffId, written, removed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar sync failed.";
    // A withdrawn token is not going to start working again: drop it, so
    // the pane says "connect again" and later syncs stop trying.
    const revoked = error instanceof RefreshRevokedError;
    await db
      .query(
        `UPDATE calendar_connections SET last_error = $2${revoked ? ", refresh_token = NULL" : ""} WHERE staff_id = $1`,
        [staffId, message],
      )
      .catch(() => undefined);
    console.error(`Calendar sync for staff ${staffId} failed:`, error);
    return { staffId, written, removed, error: message };
  }
}

/**
 * Where an event's "open in Gems" link points: the production address when
 * Vercel says what it is, so an event written by a preview deployment still
 * links to the real app, else the address of the request that started it.
 */
export function appUrlFor(origin: string): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : origin;
}

/**
 * Runs a sync after the response has gone, from any route that changes
 * orders. The save answers at its usual speed and the calendar catches up
 * a few seconds later — the "update on change" the calendar was asked for,
 * with no queue: a sync reconciles everything, so two saves in quick
 * succession just mean the second sync finds less to do. Failures are
 * logged and recorded on the connection, never surfaced to the save.
 */
export function scheduleCalendarSync(origin: string): void {
  after(async () => {
    try {
      await syncCalendars({ appUrl: appUrlFor(origin) });
    } catch (error) {
      console.error("Scheduled calendar sync failed:", error);
    }
  });
}

/** The address an admin's account carries, to pre-select it on Google's picker. */
export async function staffEmail(staffId: number): Promise<string | undefined> {
  try {
    const { rows } = await getDb().query<{ email: string | null }>("SELECT email FROM staff WHERE id = $1", [staffId]);
    return rows[0]?.email ?? undefined;
  } catch {
    return undefined;
  }
}
