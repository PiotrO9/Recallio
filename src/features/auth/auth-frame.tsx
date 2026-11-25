import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { EjiriPrint } from "@/components/ejiri-print";
import styles from "./auth.module.css";

export function AuthFrame({
  title,
  children,
  variant = "workspace",
}: {
  title: string;
  children: ReactNode;
  variant?: "workspace" | "auth" | "catalog" | "study";
}) {
  return (
    <PageShell publicEntry={variant === "auth"} className={styles[variant]}>
      <div className={styles.panel}>
        <h1>{title}</h1>
        <div className={styles.content}>{children}</div>
      </div>
      {variant === "auth" && <EjiriPrint />}
    </PageShell>
  );
}
