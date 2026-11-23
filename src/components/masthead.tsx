import Link from "next/link";

export function Masthead({ email }: { email?: string | null }) {
  return (
    <header className="masthead">
      <Link href="/" className="brand" title="Panel nauki">
        <span className="brand-mark">r.</span>
        recallio
      </Link>
      <Link href="/account" className="account-link">
        <strong>Moje konto</strong>
        {email && <span>{email}</span>}
      </Link>
    </header>
  );
}
