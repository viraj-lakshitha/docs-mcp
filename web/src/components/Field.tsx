import { useId, type InputHTMLAttributes, type ReactNode } from "react";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children?: (id: string, className: string) => ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "children">;

// Labeled form field: label + input + hint/error, with invalid styling.
// Extra input props (type, value, onChange, autoComplete, ...) pass through.
export function Field({ label, hint, error, children, ...inputProps }: FieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {children ? (
        children(id, error ? "input input--invalid" : "input")
      ) : (
        <input id={id} className={error ? "input input--invalid" : "input"} {...inputProps} />
      )}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}
