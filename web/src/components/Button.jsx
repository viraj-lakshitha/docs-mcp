import { Spinner } from "./Spinner.jsx";

// Design-system button. variant: "default" | "primary" | "danger" | "bare"
// size: "sm" | "md" | "lg"; block stretches full width; loading shows a
// spinner and disables the control. Pass as="a" (with href) to render a real
// link styled as a button — important for navigation CTAs (right-click/open
// in new tab, no-JS fallback, crawlability) rather than a button + location.href.
export function Button({
  as: Tag = "button",
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

  const isDisabled = disabled || loading;
  const extra = Tag === "a" ? { "aria-disabled": isDisabled || undefined } : { disabled: isDisabled };

  return (
    <Tag className={classes} {...extra} {...rest}>
      {loading && <Spinner />}
      {children}
    </Tag>
  );
}
