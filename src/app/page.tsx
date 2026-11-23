import Link from "next/link";
import { redirect } from "next/navigation";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";
import styles from "./dashboard.module.css";

export default async function Home() {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login");

  return (
    <div className={styles.workspace}>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <header className={styles.header}>
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            r.
          </span>
          recallio
        </span>
        <Link href="/account" className={styles.account}>
          <strong>Moje konto</strong>
          {account.email && <span>{account.email}</span>}
        </Link>
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        <h1>Panel nauki</h1>
        <section className={styles.study}>
          <h2>Powtórki</h2>
          <a className={styles.start} href="/study">
            Przejdź do nauki
          </a>
        </section>
        <section className={styles.library}>
          <h2>Biblioteka</h2>
          <Link href="/decks">
            <strong>Moje zestawy</strong>
            <span>Dodawaj zestawy i edytuj fiszki.</span>
          </Link>
          <Link href="/import">
            <strong>Importuj CSV</strong>
            <span>Wczytaj fiszki z pliku.</span>
          </Link>
        </section>
      </main>
    </div>
  );
}
