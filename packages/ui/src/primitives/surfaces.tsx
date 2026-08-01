import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-[var(--color-surface-800)] text-[var(--color-paper-50)]", className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-white/8 bg-[var(--color-surface-800)] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        className,
      )}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-control)] border border-white/8 bg-[var(--color-surface-700)] p-4",
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("border-t border-white/8", className)} {...props} />;
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "brand" | "success" | "warning" | "info" | "danger";
}

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-white/10 text-[var(--color-paper-50)]",
  brand: "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]",
  success: "bg-[var(--color-success-400)]/15 text-[var(--color-success-400)]",
  warning: "bg-[var(--color-warning-400)]/15 text-[var(--color-warning-400)]",
  info: "bg-[var(--color-info-400)]/15 text-[var(--color-info-400)]",
  danger: "bg-[var(--color-danger-400)]/15 text-[var(--color-danger-400)]",
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export interface StatusPillProps {
  label: string;
  tone: NonNullable<BadgeProps["tone"]>;
  icon?: ReactNode;
  /** Color is never the only signal — pass a short label, not just a dot. */
  className?: string;
}

export function StatusPill({ label, tone, icon, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone === "success" &&
          "border-[var(--color-success-400)]/40 text-[var(--color-success-400)]",
        tone === "warning" &&
          "border-[var(--color-warning-400)]/40 text-[var(--color-warning-400)]",
        tone === "danger" && "border-[var(--color-danger-400)]/40 text-[var(--color-danger-400)]",
        tone === "info" && "border-[var(--color-info-400)]/40 text-[var(--color-info-400)]",
        tone === "brand" && "border-[var(--color-brand-400)]/40 text-[var(--color-brand-400)]",
        tone === "neutral" && "border-white/20 text-[var(--color-paper-50)]",
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

export interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, size = 36, className }: AvatarProps) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[var(--color-surface-700)] text-xs font-semibold text-[var(--color-paper-50)]",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--radius-control)] bg-white/8", className)}
      {...props}
    />
  );
}
