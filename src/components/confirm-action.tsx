"use client";
import { useId, useRef } from "react";
export function ConfirmAction({
  label,
  title,
  description,
  confirm = label,
  disabled = false,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirm?: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  return (
    <>
      <button
        type="button"
        className="auth-secondary"
        disabled={disabled}
        onClick={() => ref.current?.showModal()}
      >
        {label}
      </button>
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
            Anuluj
          </button>
          <button
            type="button"
            className="danger-action"
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
