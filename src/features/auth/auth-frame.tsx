import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

export function AuthFrame({
  title,
  children,
  linkLogo = true,
}: {
  title: string;
  children: ReactNode;
  linkLogo?: boolean;
}) {
  const logo = (
    <>
      <span className="brand-mark" aria-hidden="true">
        r.
      </span>
      recallio
    </>
  );
  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      {linkLogo ? (
        <Link className="brand" href="/">
          {logo}
        </Link>
      ) : (
        <div className="brand">{logo}</div>
      )}
      <main id="main" tabIndex={-1} className={styles.panel}>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
