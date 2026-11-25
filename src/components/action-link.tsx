"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

function LinkLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="link-loading" role="status">
      Otwieranie…
    </span>
  ) : (
    children
  );
}

export function ActionLink({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      <LinkLabel>{children}</LinkLabel>
    </Link>
  );
}
