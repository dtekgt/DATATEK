import { forwardRef } from "react";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "tap-target focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-400)]",
  secondary:
    "bg-[var(--color-surface-700)] text-[var(--color-paper-50)] hover:bg-[var(--color-surface-800)] border border-white/10",
  ghost: "bg-transparent text-[var(--color-paper-50)] hover:bg-white/5",
  danger: "bg-[var(--color-danger-400)] text-[var(--color-ink-950)] hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span aria-hidden className="animate-pulse">
          …
        </span>
      ) : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", size = "md", label, icon, className, ...props },
  ref,
) {
  const iconSizes: Record<Size, string> = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-12 w-12" };
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], iconSizes[size], "px-0", className)}
      {...props}
    >
      {icon}
    </button>
  );
});

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  size?: Size;
}

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = "secondary", size = "md", className, children, ...props },
  ref,
) {
  return (
    <a ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </a>
  );
});
