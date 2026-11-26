"use client";
import { useId, useRef } from "react";
import { LoadingButton } from "./loading-button";
export function ConfirmAction({
  label,
  title,
  description,
  confirm = label,
  cancelLabel = "Anuluj",
  triggerClassName = "auth-secondary",
  needsConfirmation,
  disabled = false,
  loading = false,
  loadingLabel,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirm?: string;
  cancelLabel?: string;
  triggerClassName?: string;
  needsConfirmation?: () => boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  return (
    <>
      <LoadingButton
        type="button"
        className={triggerClassName}
        disabled={disabled}
        loading={loading}
        loadingLabel={loadingLabel}
        onClick={() =>
          needsConfirmation && !needsConfirmation()
            ? onConfirm()
            : ref.current?.showModal()
        }
      >
        {label}
      </LoadingButton>
      <dialog ref={ref} aria-labelledby={id} className="action-dialog">
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
        <div className="action-row">
          <button
            type="button"
            autoFocus
            className="auth-secondary"
            onClick={() => ref.current?.close()}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="danger-action"
            disabled={disabled || loading}
            onClick={() => {
              ref.current?.close();
              onConfirm();
            }}
          >
            {confirm}
          </button>
        </div>
      </dialog>
    </>
  );
}
