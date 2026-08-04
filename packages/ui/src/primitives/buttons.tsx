import { forwardRef } from "react";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

// Cápsula, no rectángulo: es la regla de forma de la marca. El hover levanta
// 2px y nunca escala — el design system es explícito en que no hay rebotes.
// `disabled:translate-y-0` evita que un botón inhabilitado igual se mueva.
const base =
  "tap-target focus-ring inline-flex items-center justify-center gap-2.5 rounded-[var(--radius-control)] text-[13px] font-[550] tracking-[-0.01em] transition-[transform,background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:hover:translate-y-0";

const variants: Record<Variant, string> = {
  // El primario es un degradado del rojo caliente al rojo base con sombra
  // teñida — la marca no usa un relleno plano para la acción principal.
  primary:
    "border border-transparent bg-[image:linear-gradient(135deg,var(--color-brand-400),var(--color-brand-500))] text-white shadow-[0_12px_34px_rgba(227,32,37,0.22)]",
  secondary:
    "border border-[var(--line-strong)] bg-white/[0.035] text-[var(--color-paper-50)] hover:border-[var(--color-brand-500)]/50",
  ghost:
    "border border-transparent bg-transparent text-[var(--color-muted-400)] hover:text-[var(--color-paper-50)] hover:bg-white/5",
  // Contorno, no relleno. Un `danger` relleno junto a un `primary` relleno
  // pone dos acciones primarias en la misma pantalla — prohibido por el NO-GO
  // de R0 y por la regla de un solo acento del design system. En la pantalla
  // de autorización eso es concreto: "Autorizar todo" y "Rechazar" competían
  // por el mismo peso visual justo donde el cliente decide un gasto.
  danger:
    "border border-[var(--color-danger-400)]/50 bg-transparent text-[var(--color-danger-400)] hover:border-[var(--color-danger-400)] hover:bg-[var(--color-danger-400)]/10",
};

const sizes: Record<Size, string> = {
  sm: "h-[var(--control-h-sm)] px-4",
  md: "h-[var(--control-h)] px-[22px]",
  lg: "h-[var(--control-h-lg)] px-7",
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
  // Cuadrado y del mismo alto que su hermano con texto, para que una fila
  // mixta de botones no quede escalonada.
  const iconSizes: Record<Size, string> = {
    sm: "h-[var(--control-h-sm)] w-[var(--control-h-sm)]",
    md: "h-[var(--control-h)] w-[var(--control-h)]",
    lg: "h-[var(--control-h-lg)] w-[var(--control-h-lg)]",
  };
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
