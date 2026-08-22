/**
 * The comparison key for "is this the same client".
 *
 * Deliberately loose — quotes and geresh/gershayim, punctuation and
 * doubled spaces are all noise in a hand-typed Hebrew business name — but
 * never fuzzy: a near match is *reported* as a near match, for a human to
 * confirm. The probe against the real SUMIT account found 13 of 73 order
 * names matching a customer exactly this way, and another 13 that only a
 * person could confirm (`פנטרה` against `פנטרה אבטחת מידע`).
 *
 * Client-safe: the order form's picker matches as you type, and the server
 * matches when it links.
 */
export function normalizeClientName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/["'`׳״]/g, "")
    .replace(/[\s,.\-–—_/]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Two names that would be the same client. */
export function sameClientName(a: string, b: string): boolean {
  return normalizeClientName(a) === normalizeClientName(b);
}

/**
 * One name looks like a longer form of the other — `בילדוטס` against
 * `בילדוטס בע"מ`. Offered for confirmation, never applied on its own.
 */
export function looksLikeSameClient(a: string, b: string): boolean {
  const [x, y] = [normalizeClientName(a), normalizeClientName(b)];
  if (!x || !y || x === y) return false;
  return x.includes(y) || y.includes(x);
}
