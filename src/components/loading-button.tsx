import type { ComponentPropsWithRef } from "react";

type Props = ComponentPropsWithRef<"button"> & {
  loading: boolean;
  loadingLabel?: string;
};

export function LoadingButton({
  loading,
  loadingLabel,
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
