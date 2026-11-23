import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

export function AuthFrame({
  title,
  children,
  showLogo = true,
}: {
  title: string;
  children: ReactNode;
  showLogo?: boolean;
}) {
  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      {showLogo && (
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            r.
          </span>
          recallio
        </Link>
      )}
      <main id="main" tabIndex={-1} className={styles.panel}>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
