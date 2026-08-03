import type { ReactNode } from "react";
import type { PlannedDetail } from "@datatek/domain";
import { Clock3, Lock, ShieldOff, AlertOctagon, Wifi, WifiOff } from "lucide-react";
import { Skeleton } from "../primitives/surfaces";
import { Button } from "../primitives/buttons";
import { cn } from "../utils/cn";

export function LoadingState({
  label = "Cargando información…",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-white/15 p-8 text-center">
      {icon}
      <p className="text-base font-medium text-[var(--color-paper-50)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-[var(--color-muted-400)]">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Algo no funcionó",
  description = "No pudimos completar esta acción. Ningún dato se perdió.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger-400)]/30 p-8 text-center"
    >
      <AlertOctagon className="h-6 w-6 text-[var(--color-danger-400)]" aria-hidden />
      <p className="text-base font-medium">{title}</p>
      <p className="max-w-sm text-sm text-[var(--color-muted-400)]">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export interface ForbiddenStateProps {
  reason?: string;
  requiredPermission?: string;
}

export function ForbiddenState({
  reason = "No tienes acceso a esta sección todavía.",
  requiredPermission,
}: ForbiddenStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-white/10 p-8 text-center">
      <ShieldOff className="h-6 w-6 text-[var(--color-warning-400)]" aria-hidden />
      <p className="text-base font-medium">Acceso restringido</p>
      <p className="max-w-sm text-sm text-[var(--color-muted-400)]">{reason}</p>
      {requiredPermission ? (
        <TechnicalDetailDisclosure summary="Detalle técnico">
          Permiso requerido: <code>{requiredPermission}</code>
        </TechnicalDetailDisclosure>
      ) : null}
    </div>
  );
}

export interface PlannedFeatureStateProps {
  title: string;
  detail: PlannedDetail;
  /**
   * Elemento del título. Por defecto `p`, porque esta tarjeta también se usa
   * DENTRO de páginas que ya tienen su propio encabezado.
   *
   * Cuando la tarjeta ES el contenido completo de una ruta —el caso de las 28
   * rutas `planned`, que renderizan sólo `<PlannedRoute>`— quien la usa pasa
   * `"h1"`: si no, esa página se queda literalmente sin ningún encabezado
   * propio, y navegar por encabezados con lector de pantalla no encuentra
   * nada. Ver R0-E Fase 4.
   */
  titleAs?: "p" | "h1";
}

/** Ley 29: una feature futura se oculta o usa `PlannedFeatureState`; nunca
 * simula éxito. Explica propósito, dependencia, release, datos y por qué está
 * deshabilitada — nunca solo "próximamente". */
export function PlannedFeatureState({ title, detail, titleAs = "p" }: PlannedFeatureStateProps) {
  const Title = titleAs;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-dashed border-white/15 p-6">
      <div className="flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-[var(--color-info-400)]" aria-hidden />
        <Title className="text-base font-medium">{title}</Title>
        <span className="ml-auto rounded-full border border-white/20 px-2 py-0.5 text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
          Planificado · {detail.release}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--color-muted-400)]">Propósito</dt>
          <dd>{detail.purpose}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-400)]">Depende de</dt>
          <dd>{detail.dependency}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-400)]">Qué datos usará</dt>
          <dd>{detail.dataToBeUsed}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-400)]">Por qué está deshabilitado</dt>
          <dd>{detail.whyDisabled}</dd>
        </div>
      </dl>
    </div>
  );
}

export interface ConflictStateProps {
  title?: string;
  description: string;
  onRefresh?: () => void;
}

export function ConflictState({
  title = "Esta información cambió",
  description,
  onRefresh,
}: ConflictStateProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--color-warning-400)]/30 bg-[var(--color-warning-400)]/5 p-4">
      <p className="text-sm font-medium text-[var(--color-warning-400)]">{title}</p>
      <p className="text-sm text-[var(--color-muted-400)]">{description}</p>
      {onRefresh ? (
        <Button variant="secondary" size="sm" onClick={onRefresh} className="self-start">
          Actualizar
        </Button>
      ) : null}
    </div>
  );
}

export interface CommandResultProps {
  status: "success" | "error" | "noop";
  message: string;
}

/** Never claims success for an action with no backend. Use `status: "noop"`
 * for anything R0-B cannot actually execute. */
export function CommandResult({ status, message }: CommandResultProps) {
  const tone =
    status === "success"
      ? "text-[var(--color-success-400)]"
      : status === "error"
        ? "text-[var(--color-danger-400)]"
        : "text-[var(--color-muted-400)]";
  return (
    <p role="status" className={cn("text-sm font-medium", tone)}>
      {message}
    </p>
  );
}

export interface ConnectionStatusProps {
  online: boolean;
}

export function ConnectionStatus({ online }: ConnectionStatusProps) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        online
          ? "border-[var(--color-success-400)]/40 text-[var(--color-success-400)]"
          : "border-[var(--color-warning-400)]/40 text-[var(--color-warning-400)]",
      )}
    >
      {online ? (
        <Wifi className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
      )}
      {online ? "En línea" : "Sin conexión — datos guardados localmente no se envían"}
    </span>
  );
}

export interface TechnicalDetailDisclosureProps {
  summary: string;
  children: ReactNode;
}

/** Ley 44: el lenguaje cotidiano aparece primero; el detalle técnico queda
 * disponible bajo demanda. Native <details> gives free keyboard support. */
export function TechnicalDetailDisclosure({ summary, children }: TechnicalDetailDisclosureProps) {
  return (
    <details className="rounded-[var(--radius-control)] border border-white/10 p-3 text-sm">
      <summary className="focus-ring cursor-pointer font-medium text-[var(--color-muted-400)]">
        {summary}
      </summary>
      <div className="mt-2 text-[var(--color-paper-50)]">{children}</div>
    </details>
  );
}

export interface FriendlyErrorStateProps {
  whatHappened: string;
  whatStaysIntact: string;
  whatToDoNext: string;
  onRetry?: () => void;
}

/** Ley 46: todo error dice qué ocurrió, qué quedó intacto y qué puede hacerse
 * después. */
export function FriendlyErrorState({
  whatHappened,
  whatStaysIntact,
  whatToDoNext,
  onRetry,
}: FriendlyErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger-400)]/30 p-6"
    >
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-5 w-5 text-[var(--color-danger-400)]" aria-hidden />
        <p className="text-base font-medium">Qué ocurrió</p>
      </div>
      <p className="text-sm text-[var(--color-paper-50)]">{whatHappened}</p>
      <p className="text-sm">
        <span className="font-medium text-[var(--color-success-400)]">Qué quedó intacto: </span>
        <span className="text-[var(--color-muted-400)]">{whatStaysIntact}</span>
      </p>
      <p className="text-sm">
        <span className="font-medium text-[var(--color-info-400)]">Qué puedes hacer: </span>
        <span className="text-[var(--color-muted-400)]">{whatToDoNext}</span>
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="self-start">
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function LockedBadge({ label = "Requiere acceso elevado" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2 py-0.5 text-xs text-[var(--color-muted-400)]">
      <Lock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
