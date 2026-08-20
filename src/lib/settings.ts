import bcrypt from "bcryptjs";
import { getDb } from "./db";
import {
  ZERO_PRICES,
  type PricedOption,
  type PriceKey,
  type Prices,
  type ProductionStage,
} from "./orderTypes";

export interface Flavor {
  id: number;
  name: string;
  colorGlow: string;
  colorBase: string;
  colorShadow: string;
  isAlcoholic: boolean;
  archivedAt: string | null;
}

export interface PackageType {
  id: number;
  name: string;
  unitsPerPackage: number;
  archivedAt: string | null;
}

export interface PaymentMethod {
  id: number;
  name: string;
  archivedAt: string | null;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  archivedAt: string | null;
}

export interface StaffAccount {
  id: number;
  name: string;
  username: string;
}

interface FlavorRow {
  id: number;
  name: string;
  color_glow: string;
  color_base: string;
  color_shadow: string;
  is_alcoholic: boolean;
  archived_at: string | null;
}

interface PackageTypeRow {
  id: number;
  name: string;
  units_per_package: number;
  archived_at: string | null;
}

interface NamedRow {
  id: number;
  name: string;
  archived_at: string | null;
}

/**
 * Every owner-managed list archives rather than deletes.
 *
 * An order references its package type and an expense its category, so a
 * hard delete would either orphan those rows or cascade and take real
 * history with it. Archiving takes the value out of every picker and
 * leaves what already used it exactly as recorded — which is why each
 * getter takes `includeArchived`: a *lookup* resolving stored rows needs
 * them, a *picker* offering a choice does not.
 */
function mapPackageType(row: PackageTypeRow): PackageType {
  return {
    id: row.id,
    name: row.name,
    unitsPerPackage: row.units_per_package,
    archivedAt: row.archived_at,
  };
}

function mapNamed(row: NamedRow): { id: number; name: string; archivedAt: string | null } {
  return { id: row.id, name: row.name, archivedAt: row.archived_at };
}

/** `WHERE` clause hiding archived rows, or nothing at all. */
function liveOnly(includeArchived: boolean): string {
  return includeArchived ? "" : " WHERE archived_at IS NULL";
}

/** Marks one row archived. The table name is fixed by the caller, never user input. */
async function archiveRow(table: string, id: number): Promise<void> {
  const db = getDb();
  await db.query(`UPDATE ${table} SET archived_at = now() WHERE id = $1`, [id]);
}

interface StaffRow {
  id: number;
  name: string;
  username: string;
}

function mapFlavor(row: FlavorRow): Flavor {
  return {
    id: row.id,
    name: row.name,
    colorGlow: row.color_glow,
    colorBase: row.color_base,
    colorShadow: row.color_shadow,
    isAlcoholic: row.is_alcoholic,
    archivedAt: row.archived_at,
  };
}

export async function getFlavors(includeArchived = false): Promise<Flavor[]> {
  const db = getDb();
  const { rows } = await db.query<FlavorRow>(
    includeArchived
      ? "SELECT * FROM flavors ORDER BY name"
      : "SELECT * FROM flavors WHERE archived_at IS NULL ORDER BY name",
  );
  return rows.map(mapFlavor);
}

export async function createFlavor(input: {
  name: string;
  colorGlow: string;
  colorBase: string;
  colorShadow: string;
  isAlcoholic: boolean;
}): Promise<Flavor> {
  const db = getDb();
  const { rows } = await db.query<FlavorRow>(
    `INSERT INTO flavors (name, color_glow, color_base, color_shadow, is_alcoholic)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.colorGlow, input.colorBase, input.colorShadow, input.isAlcoholic],
  );
  return mapFlavor(rows[0]);
}

export async function updateFlavor(
  id: number,
  input: { name: string; colorGlow: string; colorBase: string; colorShadow: string; isAlcoholic: boolean },
): Promise<Flavor> {
  const db = getDb();
  const { rows } = await db.query<FlavorRow>(
    `UPDATE flavors SET name = $1, color_glow = $2, color_base = $3, color_shadow = $4, is_alcoholic = $5
     WHERE id = $6 RETURNING *`,
    [input.name, input.colorGlow, input.colorBase, input.colorShadow, input.isAlcoholic, id],
  );
  return mapFlavor(rows[0]);
}

/** Flavors archive, never hard-delete — existing orders/chips keep the original name and color. */
export async function archiveFlavor(id: number): Promise<void> {
  await archiveRow("flavors", id);
}

export async function getPackageTypes(includeArchived = false): Promise<PackageType[]> {
  const db = getDb();
  const { rows } = await db.query<PackageTypeRow>(
    `SELECT * FROM package_types${liveOnly(includeArchived)} ORDER BY id`,
  );
  return rows.map(mapPackageType);
}

export async function archivePackageType(id: number): Promise<void> {
  await archiveRow("package_types", id);
}

export async function createPackageType(input: { name: string; unitsPerPackage: number }): Promise<PackageType> {
  const db = getDb();
  const { rows } = await db.query<PackageTypeRow>(
    "INSERT INTO package_types (name, units_per_package) VALUES ($1, $2) RETURNING *",
    [input.name, input.unitsPerPackage],
  );
  return mapPackageType(rows[0]);
}

export async function updatePackageType(
  id: number,
  input: { name: string; unitsPerPackage: number },
): Promise<PackageType> {
  const db = getDb();
  const { rows } = await db.query<PackageTypeRow>(
    "UPDATE package_types SET name = $1, units_per_package = $2 WHERE id = $3 RETURNING *",
    [input.name, input.unitsPerPackage, id],
  );
  return mapPackageType(rows[0]);
}

/**
 * A saved "package type + flavour recipe" the owner maintains in Settings
 * and applies in one click in the order form ("Mix small"). Shares are
 * percentages of the package, not units, so one preset serves any
 * quantity — see schema.sql's content_presets.
 */
export interface ContentPreset {
  id: number;
  name: string;
  packageTypeId: number;
  flavors: { flavorId: number; share: number }[];
  /**
   * What one package of this costs. Copied onto an order line when the
   * preset is applied, so changing it here never reprices an order that
   * is already booked. Null prices that line per unit instead.
   */
  price: number | null;
}

export type ContentPresetInput = Omit<ContentPreset, "id">;

interface PresetRow {
  id: number;
  name: string;
  package_type_id: number;
  price: string | null;
}

interface PresetFlavorRow {
  preset_id: number;
  flavor_id: number;
  share: string;
  position: number;
}

function nestPresets(presetRows: PresetRow[], flavorRows: PresetFlavorRow[]): ContentPreset[] {
  const byPreset = new Map<number, { flavorId: number; share: number }[]>();
  for (const row of [...flavorRows].sort((a, b) => a.position - b.position)) {
    const list = byPreset.get(row.preset_id) ?? [];
    // NUMERIC arrives as a string from node-postgres-style drivers.
    list.push({ flavorId: row.flavor_id, share: Number(row.share) });
    byPreset.set(row.preset_id, list);
  }
  return presetRows.map((row) => ({
    id: row.id,
    name: row.name,
    packageTypeId: row.package_type_id,
    price: row.price === null ? null : Number(row.price),
    flavors: byPreset.get(row.id) ?? [],
  }));
}

export async function getContentPresets(): Promise<ContentPreset[]> {
  const db = getDb();
  const [{ rows: presetRows }, { rows: flavorRows }] = await Promise.all([
    db.query<PresetRow>("SELECT * FROM content_presets WHERE archived_at IS NULL ORDER BY id"),
    db.query<PresetFlavorRow>(
      `SELECT f.* FROM content_preset_flavors f
       JOIN content_presets p ON p.id = f.preset_id
       WHERE p.archived_at IS NULL`,
    ),
  ]);
  return nestPresets(presetRows, flavorRows);
}

function toPresetFlavorArrays(flavors: ContentPresetInput["flavors"]) {
  return [flavors.map((f) => f.flavorId), flavors.map((f) => f.share), flavors.map((_, i) => i)];
}

export async function createContentPreset(input: ContentPresetInput): Promise<ContentPreset> {
  const db = getDb();
  const { rows } = await db.query<PresetRow>(
    `WITH new_preset AS (
       INSERT INTO content_presets (name, package_type_id, price) VALUES ($1, $2, $3) RETURNING *
     ), new_flavors AS (
       INSERT INTO content_preset_flavors (preset_id, flavor_id, share, position)
       SELECT new_preset.id, t.flavor_id, t.share, t.pos
       FROM new_preset, unnest($4::int[], $5::numeric[], $6::int[]) AS t(flavor_id, share, pos)
       RETURNING 1
     )
     SELECT * FROM new_preset`,
    [input.name, input.packageTypeId, input.price, ...toPresetFlavorArrays(input.flavors)],
  );
  return { ...input, id: rows[0].id };
}

export async function updateContentPreset(id: number, input: ContentPresetInput): Promise<ContentPreset> {
  const db = getDb();
  const { rows } = await db.query<PresetRow>(
    `WITH updated_preset AS (
       UPDATE content_presets SET name = $1, package_type_id = $2, price = $4 WHERE id = $3 RETURNING *
     ), deleted_flavors AS (
       DELETE FROM content_preset_flavors WHERE preset_id = $3 RETURNING 1
     ), new_flavors AS (
       INSERT INTO content_preset_flavors (preset_id, flavor_id, share, position)
       SELECT $3, t.flavor_id, t.share, t.pos
       FROM unnest($5::int[], $6::numeric[], $7::int[]) AS t(flavor_id, share, pos)
       -- Forces the delete to run first, same reasoning as orders.ts's
       -- updateOrder: unrelated data-modifying CTEs have no defined order.
       WHERE (SELECT count(*) FROM deleted_flavors) >= 0
       RETURNING 1
     )
     SELECT * FROM updated_preset`,
    [input.name, input.packageTypeId, id, input.price, ...toPresetFlavorArrays(input.flavors)],
  );
  return { ...input, id: rows[0].id };
}

/** Presets archive rather than delete, for the same reason flavors do. */
export async function archiveContentPreset(id: number): Promise<void> {
  await archiveRow("content_presets", id);
}

/**
 * An event type with its chip colour. Orders reference it by *name*
 * (orders.customer_type stays free text) so a Sheet import can never be
 * rejected by an unknown value — see schema.sql's order_types.
 */
export interface OrderType {
  id: number;
  name: string;
  color: string;
  /** Key into lib/icons.ts's ORDER_TYPE_ICONS. Null falls back to a tag. */
  icon: string | null;
  /**
   * Set once archived. The app layout loads archived types too, so an
   * order that already uses one keeps its colour and icon; the pickers
   * filter them out so nobody can pick one again.
   */
  archivedAt: string | null;
}

interface OrderTypeRow {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  archived_at: string | null;
}

const mapOrderType = (r: OrderTypeRow): OrderType => ({
  id: r.id,
  name: r.name,
  color: r.color,
  icon: r.icon,
  archivedAt: r.archived_at ?? null,
});

export async function getOrderTypes(includeArchived = false): Promise<OrderType[]> {
  const db = getDb();
  const { rows } = await db.query<OrderTypeRow>(
    `SELECT id, name, color, icon, archived_at FROM order_types${liveOnly(includeArchived)} ORDER BY position, id`,
  );
  return rows.map(mapOrderType);
}

export async function createOrderType(input: {
  name: string;
  color: string;
  icon: string | null;
}): Promise<OrderType> {
  const db = getDb();
  const { rows } = await db.query<OrderTypeRow>(
    `INSERT INTO order_types (name, color, icon, position)
     VALUES ($1, $2, $3, (SELECT coalesce(max(position), -1) + 1 FROM order_types))
     RETURNING id, name, color, icon, archived_at`,
    [input.name, input.color, input.icon],
  );
  return mapOrderType(rows[0]);
}

/**
 * Renaming a type also renames it on every order that used it — orders
 * match by name, so leaving them behind would silently untype them.
 */
export async function updateOrderType(
  id: number,
  input: { name: string; color: string; icon: string | null },
): Promise<OrderType> {
  const db = getDb();
  const { rows } = await db.query<OrderTypeRow>(
    `WITH old AS (
       SELECT name FROM order_types WHERE id = $3
     ), renamed AS (
       UPDATE orders SET customer_type = $1
       WHERE customer_type = (SELECT name FROM old) AND $1 <> (SELECT name FROM old)
       RETURNING 1
     )
     UPDATE order_types SET name = $1, color = $2, icon = $4
     WHERE id = $3 AND (SELECT count(*) FROM renamed) >= 0
     RETURNING id, name, color, icon, archived_at`,
    [input.name, input.color, id, input.icon],
  );
  return mapOrderType(rows[0]);
}

/** Archived, not deleted: orders keep their text and simply lose the colour. */
export async function archiveOrderType(id: number): Promise<void> {
  await archiveRow("order_types", id);
}

export async function getPaymentMethods(includeArchived = false): Promise<PaymentMethod[]> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>(
    `SELECT * FROM payment_methods${liveOnly(includeArchived)} ORDER BY id`,
  );
  return rows.map(mapNamed);
}

export async function archivePaymentMethod(id: number): Promise<void> {
  await archiveRow("payment_methods", id);
}

export async function createPaymentMethod(name: string): Promise<PaymentMethod> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("INSERT INTO payment_methods (name) VALUES ($1) RETURNING *", [name]);
  return mapNamed(rows[0]);
}

export async function updatePaymentMethod(id: number, name: string): Promise<PaymentMethod> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("UPDATE payment_methods SET name = $1 WHERE id = $2 RETURNING *", [name, id]);
  return mapNamed(rows[0]);
}

export async function getExpenseCategories(includeArchived = false): Promise<ExpenseCategory[]> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>(
    `SELECT * FROM expense_categories${liveOnly(includeArchived)} ORDER BY id`,
  );
  return rows.map(mapNamed);
}

export async function archiveExpenseCategory(id: number): Promise<void> {
  await archiveRow("expense_categories", id);
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("INSERT INTO expense_categories (name) VALUES ($1) RETURNING *", [name]);
  return mapNamed(rows[0]);
}

export async function updateExpenseCategory(id: number, name: string): Promise<ExpenseCategory> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("UPDATE expense_categories SET name = $1 WHERE id = $2 RETURNING *", [name, id]);
  return mapNamed(rows[0]);
}

export async function getStaff(): Promise<StaffAccount[]> {
  const db = getDb();
  const { rows } = await db.query<StaffRow>("SELECT id, name, username FROM staff ORDER BY id");
  return rows.map((r) => ({ id: r.id, name: r.name, username: r.username }));
}

/** No self-service signup — exactly 2 founder accounts, created/edited by hand via Settings. No delete. */
export async function createStaff(input: { name: string; username: string; password: string }): Promise<StaffAccount> {
  const db = getDb();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const { rows } = await db.query<StaffRow>(
    "INSERT INTO staff (name, username, password_hash) VALUES ($1, $2, $3) RETURNING id, name, username",
    [input.name, input.username, passwordHash],
  );
  return { id: rows[0].id, name: rows[0].name, username: rows[0].username };
}

export async function resetStaffPassword(id: number, password: string): Promise<void> {
  const db = getDb();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.query("UPDATE staff SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
}

export async function updateStaffName(id: number, name: string): Promise<StaffAccount> {
  const db = getDb();
  const { rows } = await db.query<StaffRow>("UPDATE staff SET name = $1 WHERE id = $2 RETURNING id, name, username", [
    name,
    id,
  ]);
  return { id: rows[0].id, name: rows[0].name, username: rows[0].username };
}

/**
 * The owner's standard rates, as a complete map.
 *
 * Missing keys fall back to zero rather than being absent, so callers
 * never have to check — a rate nobody has set prices nothing, which is
 * the honest answer and keeps `repriceOrder` total.
 */
export async function getPrices(): Promise<Prices> {
  const db = getDb();
  const { rows } = await db.query<{ key: string; amount: string }>("SELECT key, amount FROM prices");
  const prices = { ...ZERO_PRICES };
  for (const row of rows) {
    if (row.key in prices) prices[row.key as PriceKey] = Number(row.amount);
  }
  return prices;
}

/**
 * Upserts one rate. The key set is fixed in code (see `PriceKey`), so the
 * insert half only ever fires on a database seeded before that key
 * existed.
 */
export async function updatePrice(key: PriceKey, amount: number): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO prices (key, amount, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`,
    [key, amount],
  );
}

interface StageRow {
  id: number;
  key: string;
  label: string;
  position: number;
  counts_as_income: boolean;
  is_final: boolean;
  color: string;
  archived_at: string | null;
}

const mapStage = (r: StageRow): ProductionStage => ({
  id: r.id,
  key: r.key,
  label: r.label,
  position: r.position,
  countsAsIncome: r.counts_as_income,
  isFinal: r.is_final,
  color: r.color,
  archivedAt: r.archived_at,
});

/**
 * The owner's production stages, in board order.
 *
 * Archived included where orders are being *resolved* — an order sitting
 * in a stage since retired still has to render its label — and excluded
 * where a stage is being *offered*, same rule as every other list here.
 */
export async function getProductionStages(includeArchived = false): Promise<ProductionStage[]> {
  const db = getDb();
  const { rows } = await db.query<StageRow>(
    `SELECT * FROM production_stages${liveOnly(includeArchived)} ORDER BY position, id`,
  );
  return rows.map(mapStage);
}

/**
 * Adds a stage at the end of the board.
 *
 * The key is derived from the name once, at creation, and never changes —
 * that is what makes renaming a stage free, where order types (which
 * orders reference by name) have to rewrite every order that used one.
 * A collision gets a numeric suffix rather than being rejected: two
 * stages can reasonably want the same word.
 */
export async function createProductionStage(input: {
  label: string;
  countsAsIncome: boolean;
  isFinal: boolean;
  color: string;
}): Promise<ProductionStage> {
  const db = getDb();
  const base = input.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stage";
  const { rows: taken } = await db.query<{ key: string }>(
    "SELECT key FROM production_stages WHERE key = $1 OR key LIKE $2",
    [base, `${base}-%`],
  );
  const used = new Set(taken.map((r) => r.key));
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}-${n}`;

  const { rows } = await db.query<StageRow>(
    `INSERT INTO production_stages (key, label, position, counts_as_income, is_final, color)
     VALUES ($1, $2, (SELECT coalesce(max(position), -1) + 1 FROM production_stages), $3, $4, $5)
     RETURNING *`,
    [key, input.label, input.countsAsIncome, input.isFinal, input.color],
  );
  return mapStage(rows[0]);
}

export async function updateProductionStage(
  id: number,
  input: { label: string; countsAsIncome: boolean; isFinal: boolean; color: string },
): Promise<ProductionStage> {
  const db = getDb();
  const { rows } = await db.query<StageRow>(
    `UPDATE production_stages
     SET label = $1, counts_as_income = $2, is_final = $3, color = $4
     WHERE id = $5 RETURNING *`,
    [input.label, input.countsAsIncome, input.isFinal, input.color, id],
  );
  return mapStage(rows[0]);
}

export async function archiveProductionStage(id: number): Promise<void> {
  await archiveRow("production_stages", id);
}

interface PricedOptionRow {
  id: number;
  name: string;
  price: string;
  position: number;
  archived_at: string | null;
}

const mapPricedOption = (r: PricedOptionRow): PricedOption => ({
  id: r.id,
  name: r.name,
  price: Number(r.price),
  position: r.position,
  archivedAt: r.archived_at,
});

/*
 * Displays and delivery destinations are recorded identically — a name, a
 * price and a place in the list — so they share one set of queries rather
 * than two copies that would drift. The table name is fixed by the named
 * exports below and is never user input.
 */
async function getPricedOptions(table: string, includeArchived: boolean): Promise<PricedOption[]> {
  const db = getDb();
  const { rows } = await db.query<PricedOptionRow>(
    `SELECT * FROM ${table}${liveOnly(includeArchived)} ORDER BY position, id`,
  );
  return rows.map(mapPricedOption);
}

async function createPricedOption(
  table: string,
  input: { name: string; price: number },
): Promise<PricedOption> {
  const db = getDb();
  const { rows } = await db.query<PricedOptionRow>(
    `INSERT INTO ${table} (name, price, position)
     VALUES ($1, $2, (SELECT coalesce(max(position), -1) + 1 FROM ${table}))
     RETURNING *`,
    [input.name, input.price],
  );
  return mapPricedOption(rows[0]);
}

async function updatePricedOption(
  table: string,
  id: number,
  input: { name: string; price: number },
): Promise<PricedOption> {
  const db = getDb();
  const { rows } = await db.query<PricedOptionRow>(
    `UPDATE ${table} SET name = $1, price = $2 WHERE id = $3 RETURNING *`,
    [input.name, input.price, id],
  );
  return mapPricedOption(rows[0]);
}

/**
 * What an order can be displayed on, each with its own price.
 *
 * Archived included where displays already on an order are being read —
 * the order still owes for them — and excluded where one is being picked,
 * same rule as every other list here.
 */
export const getDisplayOptions = (includeArchived = false) =>
  getPricedOptions("display_options", includeArchived);
export const createDisplayOption = (input: { name: string; price: number }) =>
  createPricedOption("display_options", input);
export const updateDisplayOption = (id: number, input: { name: string; price: number }) =>
  updatePricedOption("display_options", id, input);
export const archiveDisplayOption = (id: number) => archiveRow("display_options", id);

/** Where an order is delivered to. Same archived rule as displays above. */
export const getDeliveryOptions = (includeArchived = false) =>
  getPricedOptions("delivery_options", includeArchived);
export const createDeliveryOption = (input: { name: string; price: number }) =>
  createPricedOption("delivery_options", input);
export const updateDeliveryOption = (id: number, input: { name: string; price: number }) =>
  updatePricedOption("delivery_options", id, input);
export const archiveDeliveryOption = (id: number) => archiveRow("delivery_options", id);

/**
 * Everything that has been archived, across every owner-managed list.
 *
 * One query per table rather than one place per panel: archiving is rare
 * and restoring rarer, so eight "show archived" footers would be eight
 * pieces of clutter to answer a question that gets asked once. Settings'
 * Data tab carries the single recovery list instead.
 */
export interface ArchivedItem {
  /** The `/api/settings/<resource>` segment, for restore and delete. */
  resource: string;
  /** What the list is called, for grouping. */
  listName: string;
  id: number;
  label: string;
  archivedAt: string;
}

const ARCHIVED_SOURCES: { resource: string; listName: string; table: string; labelColumn: string }[] = [
  { resource: "flavors", listName: "Flavors", table: "flavors", labelColumn: "name" },
  { resource: "presets", listName: "Presets", table: "content_presets", labelColumn: "name" },
  { resource: "stages", listName: "Statuses", table: "production_stages", labelColumn: "label" },
  { resource: "order-types", listName: "Order types", table: "order_types", labelColumn: "name" },
  { resource: "package-types", listName: "Package types", table: "package_types", labelColumn: "name" },
  { resource: "displays", listName: "Display", table: "display_options", labelColumn: "name" },
  { resource: "deliveries", listName: "Delivery", table: "delivery_options", labelColumn: "name" },
  { resource: "payment-methods", listName: "Payment methods", table: "payment_methods", labelColumn: "name" },
  { resource: "expense-categories", listName: "Expense categories", table: "expense_categories", labelColumn: "name" },
];

export async function getArchivedItems(): Promise<ArchivedItem[]> {
  const db = getDb();
  const perTable = await Promise.all(
    // Table and column names come from the fixed list above, never from a
    // request — nothing here is interpolated from user input.
    ARCHIVED_SOURCES.map(async (source) => {
      const { rows } = await db.query<{ id: number; label: string; archived_at: string }>(
        `SELECT id, ${source.labelColumn} AS label, archived_at
         FROM ${source.table} WHERE archived_at IS NOT NULL ORDER BY archived_at DESC`,
      );
      return rows.map((row) => ({
        resource: source.resource,
        listName: source.listName,
        id: row.id,
        label: row.label,
        archivedAt: row.archived_at,
      }));
    }),
  );
  return perTable.flat();
}

const TABLE_FOR_RESOURCE = new Map(ARCHIVED_SOURCES.map((s) => [s.resource, s.table]));

/** Puts an archived row back on its list. */
export async function restoreArchived(resource: string, id: number): Promise<void> {
  const table = TABLE_FOR_RESOURCE.get(resource);
  if (!table) throw new Error(`Unknown resource: ${resource}`);
  await getDb().query(`UPDATE ${table} SET archived_at = NULL WHERE id = $1`, [id]);
}

/**
 * Removes an archived row for good.
 *
 * Only ever reachable for something already archived, and the database
 * refuses it if any order or expense still points at the row — which is
 * the whole reason archiving is the default. The caller turns that refusal
 * into an explanation rather than a stack trace.
 */
export async function deleteArchived(resource: string, id: number): Promise<void> {
  const table = TABLE_FOR_RESOURCE.get(resource);
  if (!table) throw new Error(`Unknown resource: ${resource}`);
  await getDb().query(`DELETE FROM ${table} WHERE id = $1 AND archived_at IS NOT NULL`, [id]);
}
