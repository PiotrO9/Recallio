import Link from "next/link";
import { redirect } from "next/navigation";
import { Masthead } from "@/components/masthead";
import { EjiriPrint } from "@/components/ejiri-print";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";
import styles from "./dashboard.module.css";

export default async function Home() {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login");

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <Masthead email={account.email} />
      <main id="main" tabIndex={-1}>
        <div className={styles.spread}>
          <div className={styles.intro}>
            <h1>
              Panel <em>nauki</em>
            </h1>
            <p>
              Otwórz zestaw i przypomnij sobie odpowiedź, zanim odwrócisz
              fiszkę.
            </p>
            <a className="primary" href="/study">
              Przejdź do nauki
            </a>
          </div>
          <EjiriPrint />
        </div>
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
