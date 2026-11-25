"use client";
import { useId, useState, type ReactNode } from "react";
export function ValidatedField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  const id = useId(),
    [invalid, setInvalid] = useState(false);
  return (
    <label
      onInvalid={(event) => {
        const input = event.target;
        if (
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement
        ) {
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", id);
          setInvalid(true);
        }
      }}
      onInput={(event) => {
        const input = event.target;
        if (
          (input instanceof HTMLInputElement ||
            input instanceof HTMLTextAreaElement) &&
          input.validity.valid
        ) {
          input.removeAttribute("aria-invalid");
          input.removeAttribute("aria-describedby");
          setInvalid(false);
        }
      }}
    >
      {label}
      {children}
      {invalid && (
        <small id={id} className="field-error">
          {hint}
        </small>
      )}
    </label>
  );
}
