import Link from "next/link";
import { redirect } from "next/navigation";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
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
        <div className={styles.spread}>
          <div className={styles.intro}>
            <h1>
              Panel <em>nauki</em>
            </h1>
            <p>
              Otwórz zestaw i przypomnij sobie odpowiedź, zanim odwrócisz
              fiszkę.
            </p>
            <a className={styles.start} href="/study">
              Przejdź do nauki
            </a>
          </div>
          <figure className={styles.print}>
            <img
              src="/ejiri.webp"
              width="1100"
              height="736"
              alt="Podmuch wiatru porywa kartki nad drogą. W oddali widać górę Fudżi."
            />
            <figcaption>
              <span>
                Katsushika Hokusai, <cite>Ejiri w prowincji Suruga</cite>
              </span>
              <a href="https://www.metmuseum.org/art/collection/search/55735">
                The Met
              </a>
            </figcaption>
          </figure>
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
