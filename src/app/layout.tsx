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
