import type { CSSProperties, ReactNode } from "react";
import styles from "./notebook.module.css";

export function deckColor(id?: string) {
  const colors = ["#80639f", "#c27958", "#568579", "#a06f85"];
  const index = id ? parseInt(id.slice(-2), 16) % colors.length : 0;
  return { "--tab-color": colors[index] } as CSSProperties;
}

export function NotebookSheet({
  deckId,
  tab,
  children,
  className = "",
}: {
  deckId?: string;
  tab?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={styles.folder} style={deckColor(deckId)}>
      <div className={styles.tabs}>
        <div className={styles.tab}>{tab}</div>
      </div>
      <div className={styles.sheet + " " + className}>{children}</div>
    </div>
  );
}
