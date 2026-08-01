import { cn } from "../utils/cn";

export interface MoneyTextProps {
  /** Amount in minor units is NOT assumed; this is a display-only fixture value. */
  amount: number;
  currency?: string;
  locale?: string;
  className?: string;
}

/** Formats a monetary amount with tabular numerals. Never renders a price
 * without the caller having already resolved/declared its pricing modality —
 * see `PricingBasisBadge`, which MUST accompany any customer-facing price. */
export function MoneyText({
  amount,
  currency = "GTQ",
  locale = "es-GT",
  className,
}: MoneyTextProps) {
  const formatted = new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  return <span className={cn("tabular-nums font-medium", className)}>{formatted}</span>;
}

export interface DateTimeTextProps {
  value: string | Date;
  locale?: string;
  timeZone?: string;
  mode?: "date" | "datetime" | "relative";
  className?: string;
}

export function DateTimeText({
  value,
  locale = "es-GT",
  timeZone = "America/Guatemala",
  mode = "date",
  className,
}: DateTimeTextProps) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return <span className={cn("text-muted-400 italic", className)}>fecha desconocida</span>;
  }
  if (mode === "relative") {
    const diffMs = date.getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return <span className={cn("tabular-nums", className)}>{rtf.format(diffDays, "day")}</span>;
  }
  const options: Intl.DateTimeFormatOptions =
    mode === "datetime"
      ? { dateStyle: "medium", timeStyle: "short", timeZone }
      : { dateStyle: "medium", timeZone };
  return (
    <time dateTime={date.toISOString()} className={cn("tabular-nums", className)}>
      {new Intl.DateTimeFormat(locale, options).format(date)}
    </time>
  );
}

export interface OdometerTextProps {
  km: number | null;
  readAt?: string | Date;
  locale?: string;
  className?: string;
}

/** A kilometraje without a reading date is not enough to promise maintenance
 * (ley 41). When `readAt` is missing the value renders with a caveat. */
export function OdometerText({ km, readAt, locale = "es-GT", className }: OdometerTextProps) {
  if (km === null) {
    return <span className={cn("text-muted-400 italic", className)}>kilometraje desconocido</span>;
  }
  const formatted = `${new Intl.NumberFormat(locale).format(km)} km`;
  if (!readAt) {
    return (
      <span className={cn("tabular-nums", className)} title="Sin fecha de lectura confirmada">
        {formatted} <span className="text-muted-400 text-xs">(sin fecha de lectura)</span>
      </span>
    );
  }
  return <span className={cn("tabular-nums", className)}>{formatted}</span>;
}

export interface MeasurementTextProps {
  value: number;
  unit: string;
  precision?: number;
  className?: string;
}

export function MeasurementText({ value, unit, precision = 1, className }: MeasurementTextProps) {
  return (
    <span className={cn("tabular-nums", className)}>
      {value.toFixed(precision)} {unit}
    </span>
  );
}
