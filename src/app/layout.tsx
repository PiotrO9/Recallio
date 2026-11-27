import type { Metadata } from "next";
import localFont from "next/font/local";
import "@fontsource-variable/manrope";
import "./globals.css";
const manrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--manrope-latin",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: "Recallio", template: "%s · Recallio" },
  icons: {
    icon: {
      url: "/icons/recallio-192.png",
      type: "image/png",
      sizes: "192x192",
    },
  },
  description:
    "Spokojna nauka fiszek we własnym tempie. Twórz własne zestawy i wracaj do zaplanowanych powtórek.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={manrope.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if (location.pathname === "/" && navigator.onLine) {
              window.recallioDatabasesAtNavigation = Promise.resolve()
                .then(() => indexedDB.databases()).catch(() => null);
            }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
