import { Spinner } from "./Spinner.jsx";

// Design-system button. variant: "default" | "primary" | "danger" | "bare"
// size: "sm" | "md" | "lg"; block stretches full width; loading shows a
// spinner and disables the control.
export function Button({
  variant = "default",
  size = "md",
  block = false,
  active = false,
  loading = false,
  disabled = false,
  className = "",
  children,
  ...rest
}) {
  const classes = [
    "btn",
    variant !== "default" && `btn--${variant}`,
    size !== "md" && `btn--${size}`,
    block && "btn--block",
    active && "active",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}
