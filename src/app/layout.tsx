import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: "Gems — Cocktail OS",
  description: "Internal dashboard for Gems Cocktail Bites",
  /*
   * iOS reads almost none of the web manifest, so the two things that
   * make "Add to Home Screen" behave are stated here instead: its own
   * icon, and `appleWebApp` — which emits `apple-mobile-web-app-capable`,
   * the tag that decides whether the icon opens a full-screen app or just
   * a Safari tab. The status bar is `default` rather than translucent
   * because the app's own ground is cream and white text would vanish
   * into it.
   */
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Gems", statusBarStyle: "default" },
  /*
   * `appleWebApp.capable` emits the *standard* `mobile-web-app-capable`
   * (checked in the build output), which Safari has honoured only since
   * iOS 15.4. The prefixed name is what every version before that reads,
   * and there is no way to test an old iPhone from here — so both are
   * stated rather than assuming which one the owner's phone wants.
   */
  other: { "apple-mobile-web-app-capable": "yes" },
};

/**
 * Stated rather than left to Next's default, because two of these are
 * decisions rather than boilerplate.
 *
 * `viewportFit: "cover"` lets the page use the full width of a phone with
 * rounded corners and a home indicator; anything that must clear those
 * reads `env(safe-area-inset-*)` itself.
 *
 * `maximumScale` is deliberately **not** set. Locking zoom is the usual
 * way to stop iOS magnifying the page when a small field is focused, and
 * it does that by taking pinch-to-zoom away from everyone — including
 * from reading a Hebrew customer name in 11px type. The field sizes are
 * fixed instead (see `.input` in globals.css).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4EBE7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolageGrotesque.variable}`}>
      <body>{children}</body>
    </html>
  );
}
