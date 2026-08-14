import bcrypt from "bcryptjs";
import { getDb } from "./db";

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
}

export interface PaymentMethod {
  id: number;
  name: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
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
}

interface NamedRow {
  id: number;
  name: string;
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
  const db = getDb();
  await db.query("UPDATE flavors SET archived_at = now() WHERE id = $1", [id]);
}

export async function getPackageTypes(): Promise<PackageType[]> {
  const db = getDb();
  const { rows } = await db.query<PackageTypeRow>("SELECT * FROM package_types ORDER BY id");
  return rows.map((r) => ({ id: r.id, name: r.name, unitsPerPackage: r.units_per_package }));
}

export async function createPackageType(input: { name: string; unitsPerPackage: number }): Promise<PackageType> {
  const db = getDb();
  const { rows } = await db.query<PackageTypeRow>(
    "INSERT INTO package_types (name, units_per_package) VALUES ($1, $2) RETURNING *",
    [input.name, input.unitsPerPackage],
  );
  return { id: rows[0].id, name: rows[0].name, unitsPerPackage: rows[0].units_per_package };
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
  return { id: rows[0].id, name: rows[0].name, unitsPerPackage: rows[0].units_per_package };
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
}

export type ContentPresetInput = Omit<ContentPreset, "id">;

interface PresetRow {
  id: number;
  name: string;
  package_type_id: number;
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
       INSERT INTO content_presets (name, package_type_id) VALUES ($1, $2) RETURNING *
     ), new_flavors AS (
       INSERT INTO content_preset_flavors (preset_id, flavor_id, share, position)
       SELECT new_preset.id, t.flavor_id, t.share, t.pos
       FROM new_preset, unnest($3::int[], $4::numeric[], $5::int[]) AS t(flavor_id, share, pos)
       RETURNING 1
     )
     SELECT * FROM new_preset`,
    [input.name, input.packageTypeId, ...toPresetFlavorArrays(input.flavors)],
  );
  return { id: rows[0].id, name: rows[0].name, packageTypeId: rows[0].package_type_id, flavors: input.flavors };
}

export async function updateContentPreset(id: number, input: ContentPresetInput): Promise<ContentPreset> {
  const db = getDb();
  const { rows } = await db.query<PresetRow>(
    `WITH updated_preset AS (
       UPDATE content_presets SET name = $1, package_type_id = $2 WHERE id = $3 RETURNING *
     ), deleted_flavors AS (
       DELETE FROM content_preset_flavors WHERE preset_id = $3 RETURNING 1
     ), new_flavors AS (
       INSERT INTO content_preset_flavors (preset_id, flavor_id, share, position)
       SELECT $3, t.flavor_id, t.share, t.pos
       FROM unnest($4::int[], $5::numeric[], $6::int[]) AS t(flavor_id, share, pos)
       -- Forces the delete to run first, same reasoning as orders.ts's
       -- updateOrder: unrelated data-modifying CTEs have no defined order.
       WHERE (SELECT count(*) FROM deleted_flavors) >= 0
       RETURNING 1
     )
     SELECT * FROM updated_preset`,
    [input.name, input.packageTypeId, id, ...toPresetFlavorArrays(input.flavors)],
  );
  return { id: rows[0].id, name: rows[0].name, packageTypeId: rows[0].package_type_id, flavors: input.flavors };
}

/** Presets archive rather than delete, for the same reason flavors do. */
export async function archiveContentPreset(id: number): Promise<void> {
  const db = getDb();
  await db.query("UPDATE content_presets SET archived_at = now() WHERE id = $1", [id]);
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
}

interface OrderTypeRow {
  id: number;
  name: string;
  color: string;
}

export async function getOrderTypes(): Promise<OrderType[]> {
  const db = getDb();
  const { rows } = await db.query<OrderTypeRow>(
    "SELECT id, name, color FROM order_types WHERE archived_at IS NULL ORDER BY position, id",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

export async function createOrderType(input: { name: string; color: string }): Promise<OrderType> {
  const db = getDb();
  const { rows } = await db.query<OrderTypeRow>(
    `INSERT INTO order_types (name, color, position)
     VALUES ($1, $2, (SELECT coalesce(max(position), -1) + 1 FROM order_types))
     RETURNING id, name, color`,
    [input.name, input.color],
  );
  return { id: rows[0].id, name: rows[0].name, color: rows[0].color };
}

/**
 * Renaming a type also renames it on every order that used it — orders
 * match by name, so leaving them behind would silently untype them.
 */
export async function updateOrderType(
  id: number,
  input: { name: string; color: string },
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
     UPDATE order_types SET name = $1, color = $2
     WHERE id = $3 AND (SELECT count(*) FROM renamed) >= 0
     RETURNING id, name, color`,
    [input.name, input.color, id],
  );
  return { id: rows[0].id, name: rows[0].name, color: rows[0].color };
}

/** Archived, not deleted: orders keep their text and simply lose the colour. */
export async function archiveOrderType(id: number): Promise<void> {
  const db = getDb();
  await db.query("UPDATE order_types SET archived_at = now() WHERE id = $1", [id]);
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("SELECT * FROM payment_methods ORDER BY id");
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function createPaymentMethod(name: string): Promise<PaymentMethod> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("INSERT INTO payment_methods (name) VALUES ($1) RETURNING *", [name]);
  return { id: rows[0].id, name: rows[0].name };
}

export async function updatePaymentMethod(id: number, name: string): Promise<PaymentMethod> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("UPDATE payment_methods SET name = $1 WHERE id = $2 RETURNING *", [name, id]);
  return { id: rows[0].id, name: rows[0].name };
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("SELECT * FROM expense_categories ORDER BY id");
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("INSERT INTO expense_categories (name) VALUES ($1) RETURNING *", [name]);
  return { id: rows[0].id, name: rows[0].name };
}

export async function updateExpenseCategory(id: number, name: string): Promise<ExpenseCategory> {
  const db = getDb();
  const { rows } = await db.query<NamedRow>("UPDATE expense_categories SET name = $1 WHERE id = $2 RETURNING *", [name, id]);
  return { id: rows[0].id, name: rows[0].name };
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
