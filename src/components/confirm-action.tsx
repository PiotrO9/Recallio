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
        onClick={(event) => {
          if (needsConfirmation && !needsConfirmation()) {
            onConfirm();
            return;
          }
          event.currentTarget.focus();
          ref.current?.showModal();
        }}
      >
        {label}
      </LoadingButton>
      <dialog
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:enabled",
            );
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (
            (event.shiftKey && event.target === first) ||
            (!event.shiftKey && event.target === last)
          ) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }}
        ref={ref}
        aria-labelledby={id}
        aria-describedby={id + "-description"}
        className="action-dialog"
      >
        <h2 id={id}>{title}</h2>
        <p id={id + "-description"}>{description}</p>
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
