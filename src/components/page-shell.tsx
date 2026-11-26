import type { ReactNode } from "react";
import { Masthead } from "./masthead";
export function PageShell({
  children,
  publicEntry = false,
  className,
}: {
  children: ReactNode;
  publicEntry?: boolean;
  className?: string;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      {!publicEntry && <Masthead />}
      <div className="page-shell">
        <main id="main" tabIndex={-1} className={className}>
          {children}
        </main>
      </div>
    </>
  );
}
