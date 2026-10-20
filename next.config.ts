import type { NextConfig } from "next";

/*
 * Standard response headers, on every route.
 *
 * Each closes something a dashboard holding a business's money and its
 * clients' phone numbers has no use for:
 * - framing (`frame-ancestors`, and `X-Frame-Options` for older browsers):
 *   nobody embeds this app, and a page that can be framed can be overlaid
 *   with a decoy and clicked through — "mark paid", "delete";
 * - MIME sniffing, so an upload or a response is read as the type it says;
 * - the referrer, which would otherwise hand an order's URL to any site
 *   it links out to;
 * - powerful features. The motion sensors stay allowed for this origin,
 *   because Jelly mode reads them on a phone; nothing else is wanted.
 *
 * Deliberately **not a full Content-Security-Policy**: Next's own inline
 * bootstrap scripts need a per-request nonce for `script-src`, which means
 * rendering every page dynamically — a bigger change than a header, worth
 * its own release. The directives here are the ones that cannot break a
 * script. No HSTS either: Vercel already sends it for its domains, and on
 * a custom domain the right max-age is the owner's call to make once.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self)",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
