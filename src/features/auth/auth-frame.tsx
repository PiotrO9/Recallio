import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

export function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.shell}>
      <Link className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          r.
        </span>
        recallio
      </Link>
      <section className={styles.panel}>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
