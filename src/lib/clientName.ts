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
 * `inner` appears in `outer` where a word starts — `לוי` in `מאיה לוי`,
 * not `הן` inside `כהן`. Both already normalised, so a word boundary is a
 * single space.
 */
function startsAWord(outer: string, inner: string): boolean {
  return outer.startsWith(inner) || outer.includes(` ${inner}`);
}

/** Normalise both names once and test them both ways round. */
function eitherWay(a: string, b: string, test: (outer: string, inner: string) => boolean): boolean {
  const [x, y] = [normalizeClientName(a), normalizeClientName(b)];
  if (!x || !y) return false;
  return test(x, y) || test(y, x);
}

/**
 * What the order form's client suggestions offer as a name is typed: one
 * name anywhere inside the other, from the first letter. Looser than a
 * near match on purpose — a search should find `ילדו` in `בילדוטס`, while
 * a duplicate warning should not.
 */
export function nameContains(a: string, b: string): boolean {
  return eitherWay(a, b, (outer, inner) => outer.includes(inner));
}

/**
 * Two names that look like the same client without being the same name:
 * one is the other with words added — `בילדוטס` against `בילדוטס בע"מ`.
 * Matched at the start of a word rather than anywhere, so a common
 * syllable buried mid-word (`כהן`, `בית`) does not flag half the list.
 * Offered for confirmation, never applied on its own. No minimum length:
 * a stored `BK` beside a stored `BK Events` is exactly the pair a person
 * should be shown.
 */
export function looksLikeSameClient(a: string, b: string): boolean {
  return eitherWay(a, b, (outer, inner) => outer !== inner && startsAWord(outer, inner));
}

/** Letters typed before a name being typed is compared as a near match. */
const MIN_TYPED_LETTERS = 3;

/**
 * A name still being typed looks like a client already on file. Waits for
 * three letters of the *typed* name — spaces not counted — because one
 * letter starts a word in half the list and the warning came up on the
 * first keystroke of every new name (v0.90.1, the owner's report). The
 * stored name has no minimum: typing `BK Events` should still point at a
 * client called `BK`.
 */
export function typedNameLooksLike(typed: string, stored: string): boolean {
  if (normalizeClientName(typed).replace(/ /g, "").length < MIN_TYPED_LETTERS) return false;
  return looksLikeSameClient(typed, stored);
}
