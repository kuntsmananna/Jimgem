/**
 * Writes a display preference — the VAT view, which panes are folded — as a
 * year-long, path-wide cookie. Client-only (`document.cookie`); the server
 * pages read the same cookies back to get the first paint right.
 *
 * One writer so the attributes cannot drift between the three callers.
 */
export function writePrefCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}
