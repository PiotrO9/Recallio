import type { Metadata } from "next";
import "@fontsource-variable/manrope";
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
