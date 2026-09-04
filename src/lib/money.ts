/**
 * How money is written, everywhere: shekels, no agorot.
 *
 * `maximumFractionDigits: 0` already rounds, which is why the callers that
 * wrapped their value in `Math.round` and the ones that didn't always
 * produced the same string — one of those was going to drift eventually.
 *
 * Client-safe (pure, no imports), so a Client Component can use it — see
 * CLAUDE.md on which `src/lib/**` modules may cross that line.
 */
const shekels = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * `-₪6,300`, not `₪-6,300`.
 *
 * `Intl` puts the minus in front of the digits, so concatenating the symbol
 * ahead of its output strands the sign between the two — which is how every
 * loss in the app read until someone looked at a Biz Plan month. The symbol
 * belongs to the number, and the sign belongs to the whole thing.
 *
 * A value a few agorot below zero rounds to `-0`, which reads as a loss
 * that is not there; that one keeps the sign off.
 */
function withSign(formatted: string): string {
  if (!formatted.startsWith("-")) return `₪${formatted}`;
  const body = formatted.slice(1);
  return /[1-9]/.test(body) ? `-₪${body}` : `₪${body}`;
}

export function currency(amount: number): string {
  return withSign(shekels.format(amount));
}

/**
 * The same, but keeping agorot where there are any — ₪12,344.67, and
 * ₪12,344 when the number is round, so a column of whole shekels stays
 * quiet. Expenses are entered from receipts and are the one place in the
 * app where the fraction is real; everything else is priced in shekels.
 */
const exact = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function currencyExact(amount: number): string {
  return withSign(exact.format(amount));
}

/** The same formatter without the sign, for counts and units. */
export function count(value: number): string {
  return shekels.format(value);
}
