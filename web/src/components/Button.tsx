import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { Spinner } from "./Spinner.tsx";

type ButtonVariant = "default" | "primary" | "danger" | "bare";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps<Tag extends ElementType> = {
  as?: Tag;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<Tag>, "as" | "size">;

// Design-system button. variant: "default" | "primary" | "danger" | "bare"
// size: "sm" | "md" | "lg"; block stretches full width; loading shows a
// spinner and disables the control. Pass as="a" (with href) to render a real
// link styled as a button — important for navigation CTAs (right-click/open
// in new tab, no-JS fallback, crawlability) rather than a button + location.href.
export function Button<Tag extends ElementType = "button">({
  as,
  variant = "default",
  size = "md",
  block = false,
  active = false,
  loading = false,
  disabled = false,
  className = "",
  children,
  ...rest
}: ButtonProps<Tag>) {
  const Component = (as ?? "button") as ElementType;
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
  const extra = Component === "a" ? { "aria-disabled": isDisabled || undefined } : { disabled: isDisabled };

  return (
    <Component className={classes} {...extra} {...rest}>
      {loading && <Spinner />}
      {children}
    </Component>
  );
}
