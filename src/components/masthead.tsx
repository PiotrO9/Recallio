"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
export function Masthead() {
  const path = usePathname();
  return (
    <header className="masthead-band">
      <div className="page-shell masthead">
        <Link href="/" className="brand" title="Panel nauki">
          <span aria-hidden="true" className="brand-mark">
            r.
          </span>
          recallio
        </Link>
        <nav aria-label="Nawigacja główna">
          <Link
            href="/decks"
            aria-current={path === "/decks" ? "page" : undefined}
          >
            Moje zestawy
          </Link>
          <Link
            href="/account"
            aria-current={path === "/account" ? "page" : undefined}
          >
            Moje konto
          </Link>
        </nav>
      </div>
    </header>
  );
}
