import type { ReactNode } from "react";
import { Masthead } from "@/components/masthead";
import { EjiriPrint } from "@/components/ejiri-print";
import styles from "./auth.module.css";

export function AuthFrame({
  title,
  children,
  variant = "workspace",
}: {
  title: string;
  children: ReactNode;
  variant?: "workspace" | "auth";
}) {
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      {variant === "workspace" && <Masthead />}
      <main
        id="main"
        tabIndex={-1}
        className={variant === "workspace" ? styles.workspace : styles.entry}
      >
        <div className={styles.panel}>
          <h1>{title}</h1>
          <div className={styles.content}>{children}</div>
        </div>
        {variant === "auth" && <EjiriPrint />}
      </main>
    </div>
  );
}
