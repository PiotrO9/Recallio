import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Recallio — odrobinę każdego dnia",
  description:
    "Spokojna nauka fiszek we własnym tempie. Twórz własne zestawy i wracaj do zaplanowanych powtórek.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
