/**
 * Hide mode's cookie (see `HideMode.tsx`). Client-safe, like `vatView.ts`:
 * the root layout reads it on the server and the switch writes it in the
 * browser, and the two must agree on one name.
 */
export const HIDE_MODE_COOKIE = "jimgem-hide";

export const parseHideMode = (value: string | undefined): boolean => value === "1";
