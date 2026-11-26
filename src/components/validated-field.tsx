"use client";
import {
  cloneElement,
  useId,
  useState,
  type AriaAttributes,
  type ReactElement,
} from "react";

type FieldProps = Pick<AriaAttributes, "aria-describedby" | "aria-invalid"> & {
  id?: string;
};

export function ValidatedField({
  label,
  hint,
  description,
  children,
}: {
  label: string;
  hint: string;
  description?: string;
  children: ReactElement<FieldProps>;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const fieldId = children.props.id ?? id;
  const describedBy =
    [
      ...new Set(
        [
          ...(children.props["aria-describedby"] ?? "").split(/\s+/),
          description && id + "-hint",
          invalid && id + "-error",
        ].filter(Boolean),
      ),
    ].join(" ") || undefined;
  return (
    <div
      className="validated-field"
      onInvalid={() => setInvalid(true)}
      onInput={(event) => {
        const field = event.target;
        if (
          (field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement) &&
          field.validity.valid
        )
          setInvalid(false);
      }}
    >
      <label htmlFor={fieldId}>
        {label}
        {cloneElement(children, {
          id: fieldId,
          "aria-invalid": invalid || children.props["aria-invalid"],
          "aria-describedby": describedBy,
        })}
      </label>
      {description && <small id={id + "-hint"}>{description}</small>}
      {invalid && (
        <small id={id + "-error"} className="field-error">
          {hint}
        </small>
      )}
    </div>
  );
}
