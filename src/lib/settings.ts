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
