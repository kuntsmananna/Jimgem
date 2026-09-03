import type { MetadataRoute } from "next";

/**
 * What the phone needs to keep Jimgem on a home screen.
 *
 * `start_url` is `/orders`, not `/`: the Dashboard is a laptop screen, and
 * the phone exists for looking an order up, booking one on the spot and
 * logging an expense — so the icon opens where that work is.
 *
 * The colours are the app's own: cream both for the splash ground and for
 * the browser chrome, which is the same value `viewport.themeColor`
 * states in the layout. Stated twice because they answer to different
 * things — the manifest dresses an installed app, the meta tag dresses a
 * tab — and there is nowhere either could read the other.
 *
 * Deliberately no service worker. Offline was out of scope from the
 * start, and a stale cache in front of a database two people are editing
 * at once is a way to show one of them yesterday's orders.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gems — Cocktail OS",
    short_name: "Gems",
    description: "Orders, expenses and clients for Gems Cocktail Bites",
    start_url: "/orders",
    display: "standalone",
    background_color: "#F4EBE7",
    theme_color: "#F4EBE7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
       * The maskable one is drawn smaller on purpose. Android crops these
       * to whatever shape the launcher uses, and only the inner 80%
       * *circle* is guaranteed to survive — which a 1.385:1 wordmark fits
       * at 0.649 of the canvas, its diagonal being 1.233 times its width.
       * See `scripts/make-icons.mjs`, which renders all four.
       */
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
