import type { CaseWorkspaceViewModel } from "@datatek/application";
import type { CaseBlocker, OperationalNextAction, StageRailStage } from "@datatek/application";
import { Badge, Card } from "../primitives/surfaces";
import { DateTimeText, MoneyText } from "../primitives/text";
import { Kicker, PageTitle } from "../primitives/typography";
import { cn } from "../utils/cn";

export interface CaseHeaderProps {
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: string;
  friendlyStatus: string;
}

export function CaseHeader({ code, customerName, vehicleLabel, friendlyStatus }: CaseHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div>
        <Kicker>{code}</Kicker>
        <PageTitle className="mt-1">{customerName}</PageTitle>
        <p className="mt-1 text-sm text-[var(--color-muted-400)]">{vehicleLabel}</p>
      </div>
      <Badge tone="info" className="ml-auto">
        {friendlyStatus}
      </Badge>
    </div>
  );
}

export interface CaseStageRailProps {
  stages: StageRailStage[];
}

/** Consultable stage rail: one stage central, previous ones collapsible,
 * future stages after authorization always labelled "Planificado". */
export function CaseStageRail({ stages }: CaseStageRailProps) {
  return (
    <ol aria-label="Etapas del caso" className="flex flex-col gap-1">
      {stages.map((stage) => (
        <li
          key={stage.id}
          className={cn(
            "flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm",
            stage.current && "bg-[var(--color-brand-500)]/10 font-medium",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              stage.current
                ? "bg-[var(--color-brand-400)]"
                : stage.completedAt
                  ? "bg-[var(--color-success-400)]"
                  : "bg-white/20",
            )}
          />
          <span className="flex-1">{stage.label}</span>
          {stage.completedAt ? (
            <DateTimeText
              value={stage.completedAt}
              className="text-xs text-[var(--color-muted-400)]"
            />
          ) : stage.planned ? (
            <Badge tone="neutral">Planificado</Badge>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export interface CaseNextActionProps {
  action: OperationalNextAction;
}

/** Sección 7: una acción primaria única, responsable o razón explícita,
 * vencimiento o tiempo de espera, bloqueo opcional y completitud de respaldo. */
export function CaseNextActionCard({ action }: CaseNextActionProps) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
        Siguiente acción
      </p>
      <p className="mt-1 text-base font-semibold">{action.primaryAction}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--color-muted-400)]">Responsable</dt>
          <dd>{action.assignee ?? action.assigneeReason ?? "Sin asignar"}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-400)]">Vencimiento</dt>
          <dd>
            {action.dueAt ? <DateTimeText value={action.dueAt} mode="datetime" /> : "Sin definir"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-400)]">Bloqueo</dt>
          <dd>
            {action.blocker
              ? `${action.blocker.description} (resuelve: ${action.blocker.resolvableBy})`
              : "Ninguno"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-400)]">Respaldo completo</dt>
          <dd className="tabular-nums">{Math.round(action.evidenceCompleteness * 100)}%</dd>
        </div>
      </dl>
    </Card>
  );
}

export function CaseBlockersList({ blockers }: { blockers: CaseBlocker[] }) {
  if (blockers.length === 0) {
    return <p className="text-sm text-[var(--color-muted-400)]">Sin bloqueos activos.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {blockers.map((b) => (
        <li
          key={b.id}
          className="rounded-[var(--radius-control)] border border-[var(--color-warning-400)]/30 p-3 text-sm"
        >
          <p>{b.description}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-400)]">
            Puede resolverlo: {b.resolvableBy}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CaseQuoteTotal({ total }: { total: { amount: number; currency: string } | null }) {
  if (!total)
    return (
      <p className="text-sm text-[var(--color-muted-400)]">Sin cotización congelada todavía.</p>
    );
  return (
    <p className="text-lg font-semibold">
      <MoneyText amount={total.amount} currency={total.currency} />
    </p>
  );
}

export type { CaseWorkspaceViewModel };
