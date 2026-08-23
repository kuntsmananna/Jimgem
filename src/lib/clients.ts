import { getDb } from "./db";
import { getOrders } from "./orders";
import { orderNet, orderTotal, type Order } from "./orderTypes";
import { normalizeClientName } from "./clientName";
import type { VatView } from "./vatView";

/**
 * A client, and the only place a SUMIT customer id lives.
 *
 * SUMIT's `/accounting/customers/` has create and update but **no list and
 * no search**, so a customer over there can only be found again by an id
 * stored here when it was created. That constraint is the whole reason
 * this is a table rather than a view over `orders.customer`.
 */
export interface Client {
  id: number;
  name: string;
  phone: string;
  email: string;
  /** The id SUMIT returned, or null while the client has never transacted. */
  sumitCustomerId: number | null;
  notes: string;
  /**
   * How they found us — Instagram, a Google search, a friend, a wedding
   * they ate at. Free text, like `orders.customer` and
   * `expenses.business`: the real answer is usually a sentence, and a list
   * would force it into whichever bucket is nearest.
   */
  source: string;
  archivedAt: string | null;
}

export interface ClientInput {
  name: string;
  phone: string;
  email: string;
  source: string;
  notes: string;
}

/** A client with what their orders come to — see `getClientsWithStats`. */
export interface ClientWithStats extends Client {
  orderCount: number;
  /** In the caller's VAT convention, summed per order. */
  totalSpent: number;
  /** "YYYY-MM-DD" of their most recent order, or null if they have none. */
  lastOrderDate: string | null;
  firstOrderDate: string | null;
}

interface ClientRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  sumit_customer_id: string | number | null;
  notes: string | null;
  source: string | null;
  archived_at: string | null;
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    // BIGINT comes back as a string from the driver; a customer id is an
    // identifier, but everything that consumes it wants a number.
    sumitCustomerId: row.sumit_customer_id === null ? null : Number(row.sumit_customer_id),
    notes: row.notes ?? "",
    source: row.source ?? "",
    archivedAt: row.archived_at,
  };
}

/**
 * `includeArchived` matters here for the same reason it does everywhere
 * else: a *picker* wants live clients, a *lookup* resolving orders already
 * stored needs the archived ones too, or an archived client's orders lose
 * their name.
 */
export async function getClients(includeArchived = false): Promise<Client[]> {
  const db = getDb();
  const { rows } = await db.query<ClientRow>(
    `SELECT * FROM clients ${includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY name`,
  );
  return rows.map(mapClient);
}

/**
 * Every client with what they have ordered.
 *
 * Totalled in JS from the orders themselves rather than in SQL, because
 * what an order is worth is `orderTotal` — jelly plus extras, less the
 * discount, VAT applied by the order's own mode — and that arithmetic
 * lives in one place. Summed **per order**, never divided out of a total:
 * these months straddle the date the business registered, so one divisor
 * would be wrong for every exempt order.
 */
export async function getClientsWithStats(vatView: VatView = "gross"): Promise<ClientWithStats[]> {
  const [clients, orders] = await Promise.all([getClients(true), getOrders()]);
  const valueOf = vatView === "net" ? orderNet : orderTotal;

  const byClient = new Map<number, Order[]>();
  for (const order of orders) {
    if (order.clientId === null) continue;
    const list = byClient.get(order.clientId) ?? [];
    list.push(order);
    byClient.set(order.clientId, list);
  }

  return clients.map((client) => {
    const theirs = byClient.get(client.id) ?? [];
    const dates = theirs.map((order) => order.date).filter(Boolean).sort();
    return {
      ...client,
      orderCount: theirs.length,
      totalSpent: theirs.reduce((sum, order) => sum + valueOf(order), 0),
      firstOrderDate: dates[0] ?? null,
      lastOrderDate: dates.at(-1) ?? null,
    };
  });
}

export async function createClient(input: ClientInput): Promise<Client> {
  const db = getDb();
  const { rows } = await db.query<ClientRow>(
    `INSERT INTO clients (name, phone, email, source, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      input.name.trim(),
      input.phone.trim() || null,
      input.email.trim() || null,
      input.source.trim() || null,
      input.notes.trim() || null,
    ],
  );
  return mapClient(rows[0]);
}

export async function updateClient(id: number, input: ClientInput): Promise<Client> {
  const db = getDb();
  const { rows } = await db.query<ClientRow>(
    `UPDATE clients SET name = $1, phone = $2, email = $3, source = $4, notes = $5 WHERE id = $6 RETURNING *`,
    [
      input.name.trim(),
      input.phone.trim() || null,
      input.email.trim() || null,
      input.source.trim() || null,
      input.notes.trim() || null,
      id,
    ],
  );
  return mapClient(rows[0]);
}

/**
 * Archived, never deleted — the same rule every owner-managed list
 * follows. An order points at its client, so a hard delete would either
 * orphan those rows or cascade and take real history with it.
 */
export async function archiveClient(id: number, archived: boolean): Promise<void> {
  const db = getDb();
  await db.query(`UPDATE clients SET archived_at = ${archived ? "now()" : "NULL"} WHERE id = $1`, [id]);
}

/**
 * The client for a name, creating one if nothing matches.
 *
 * Matched on the normalized name, so "בילדוטס" and "בילדוטס " are the same
 * client and a stray space cannot quietly open a second file on someone.
 * A *near* match is deliberately not accepted here: it goes to the Clients
 * page to be confirmed by a person.
 */
export async function findOrCreateClientByName(name: string, phone = ""): Promise<Client> {
  const wanted = normalizeClientName(name);
  if (!wanted) throw new Error("A client needs a name.");
  const existing = (await getClients(true)).find((client) => normalizeClientName(client.name) === wanted);
  if (existing) return existing;
  return createClient({ name, phone, email: "", source: "", notes: "" });
}

/** Stores the id SUMIT handed back, which is the only way to find them again. */
export async function setSumitCustomerId(id: number, sumitCustomerId: number): Promise<void> {
  const db = getDb();
  await db.query("UPDATE clients SET sumit_customer_id = $1 WHERE id = $2", [sumitCustomerId, id]);
}
