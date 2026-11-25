import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { NotebookSheet } from "@/components/notebook";
import styles from "./auth.module.css";

export function AuthFrame({
  title,
  children,
  variant = "workspace",
}: {
  title?: string;
  children: ReactNode;
  variant?: "workspace" | "auth" | "catalog" | "study";
}) {
  const panel = (
    <div className={styles.panel}>
      {title && <h1>{title}</h1>}
      <div className={styles.content}>{children}</div>
    </div>
  );
  return (
    <PageShell publicEntry={variant === "auth"} className={styles[variant]}>
      {variant === "auth" || variant === "workspace" ? (
        <NotebookSheet className={styles.paper}>{panel}</NotebookSheet>
      ) : (
        panel
      )}
    </PageShell>
  );
}
