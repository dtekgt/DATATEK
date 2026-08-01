import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "../utils/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const alertIcon: Record<AlertTone, ReactNode> = {
  info: <Info className="h-4 w-4" aria-hidden />,
  success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden />,
  danger: <XCircle className="h-4 w-4" aria-hidden />,
};

const alertTone: Record<AlertTone, string> = {
  info: "border-[var(--color-info-400)]/30 text-[var(--color-info-400)]",
  success: "border-[var(--color-success-400)]/30 text-[var(--color-success-400)]",
  warning: "border-[var(--color-warning-400)]/30 text-[var(--color-warning-400)]",
  danger: "border-[var(--color-danger-400)]/30 text-[var(--color-danger-400)]",
};

export interface InlineAlertProps {
  tone: AlertTone;
  title: string;
  description?: string;
  className?: string;
}

export function InlineAlert({ tone, title, description, className }: InlineAlertProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-control)] border bg-[var(--color-surface-800)] p-3 text-sm",
        alertTone[tone],
        className,
      )}
    >
      {alertIcon[tone]}
      <div className="text-[var(--color-paper-50)]">
        <p className="font-medium">{title}</p>
        {description ? <p className="mt-0.5 text-[var(--color-muted-400)]">{description}</p> : null}
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: string;
  tone: AlertTone;
  title: string;
  description?: string;
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss?: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-control)] border bg-[var(--color-surface-700)] p-3 text-sm shadow-lg",
        alertTone[toast.tone],
      )}
    >
      {alertIcon[toast.tone]}
      <div className="flex-1 text-[var(--color-paper-50)]">
        <p className="font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-[var(--color-muted-400)]">{toast.description}</p>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Cerrar aviso"
          className="focus-ring text-[var(--color-muted-400)]"
          onClick={() => onDismiss(toast.id)}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  emptyLabel?: string;
}

/** Minimal accessible data table. No client-side heavy dependency: sorting and
 * pagination arrive with real data in a later release. */
export function DataTable<T>({ columns, rows, rowKey, caption, emptyLabel }: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-control)] border border-dashed border-white/15 p-6 text-center text-sm text-[var(--color-muted-400)]">
        {emptyLabel ?? "Sin datos todavía."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-control)] border border-white/8">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white/10 text-left text-[var(--color-muted-400)]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("px-3 py-2 font-medium", col.align === "right" && "text-right")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-white/5 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn("px-3 py-2", col.align === "right" && "text-right")}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      role="search"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-700)] p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-2 text-sm">
      <button
        type="button"
        className="focus-ring tap-target rounded-[var(--radius-control)] px-3 disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Anterior
      </button>
      <span aria-live="polite" className="tabular-nums text-[var(--color-muted-400)]">
        Página {page} de {pageCount}
      </span>
      <button
        type="button"
        className="focus-ring tap-target rounded-[var(--radius-control)] px-3 disabled:opacity-40"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}
