import Link from "next/link";
export function Masthead() {
  return (
    <header className="masthead">
      <Link href="/" className="brand" title="Panel nauki">
        <span aria-hidden="true" className="brand-mark">
          r.
        </span>
        recallio
      </Link>
      <nav aria-label="Nawigacja główna">
        <Link href="/decks">Moje zestawy</Link>
        <Link href="/account">Moje konto</Link>
      </nav>
    </header>
  );
}
