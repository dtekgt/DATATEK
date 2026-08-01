import type {
  CaseProofSummaryViewModel,
  ImmediateDecisionViewModel,
  NextServiceViewModel,
  OperationalNextActionViewModel,
  VehicleNowViewModel,
} from "@datatek/application";
import type { PriceModality } from "@datatek/application";
import type { VehicleNowStatus, ServicePriceMode } from "@datatek/domain";
import type { ReactNode } from "react";
import { AlertTriangle, CircleHelp, CircleCheck, Clock3, TriangleAlert } from "lucide-react";
import { Badge, Card } from "../primitives/surfaces";
import { LinkButton } from "../primitives/buttons";
import { DateTimeText, MoneyText, OdometerText } from "../primitives/text";
import { cn } from "../utils/cn";

const nowStatusConfig: Record<
  VehicleNowStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info"; icon: ReactNode }
> = {
  action_required: {
    label: "Acción requerida",
    tone: "danger",
    icon: <TriangleAlert className="h-4 w-4" aria-hidden />,
  },
  attention: {
    label: "Atención",
    tone: "warning",
    icon: <AlertTriangle className="h-4 w-4" aria-hidden />,
  },
  no_current_alerts: {
    label: "Sin alertas actuales",
    tone: "success",
    icon: <CircleCheck className="h-4 w-4" aria-hidden />,
  },
  unknown: {
    label: "Desconocido",
    tone: "neutral",
    icon: <CircleHelp className="h-4 w-4" aria-hidden />,
  },
  stale: {
    label: "Dato desactualizado",
    tone: "info",
    icon: <Clock3 className="h-4 w-4" aria-hidden />,
  },
};

/** Distingue "desconocido" de "sin alertas actuales" (ley 32: sin hallazgos
 * no equivale a saludable). Nunca muestra un porcentaje global de salud. */
export function VehicleNowCard({ vm }: { vm: VehicleNowViewModel }) {
  const config = nowStatusConfig[vm.status];
  return (
    <Card data-testid="vehicle-now-card">
      <div className="flex items-center gap-2">
        {config.icon}
        <Badge tone={config.tone}>{config.label}</Badge>
        {vm.demo ? <Badge tone="neutral">DEMO DATA</Badge> : null}
      </div>
      <p className="mt-2 text-base font-semibold">{vm.headline}</p>
      {vm.detail ? <p className="mt-1 text-sm text-[var(--color-muted-400)]">{vm.detail}</p> : null}
      <p className="mt-2 text-xs text-[var(--color-muted-400)]">
        Fuente: {vm.source}
        {vm.observedAt ? (
          <>
            {" "}
            · <DateTimeText value={vm.observedAt} mode="relative" />
          </>
        ) : (
          " · sin fecha registrada"
        )}
      </p>
    </Card>
  );
}

export interface ImmediateDecisionStackProps {
  vm: ImmediateDecisionViewModel;
  /** Enforced hard cap. Never override above 3 (ley 33). */
  max?: 3;
}

export function ImmediateDecisionStack({ vm, max = 3 }: ImmediateDecisionStackProps) {
  const shown = vm.decisions.slice(0, max);
  const hiddenCount = vm.decisions.length - shown.length;
  if (shown.length === 0) {
    return <p className="text-sm text-[var(--color-muted-400)]">Sin decisiones pendientes.</p>;
  }
  return (
    <div
      data-testid="immediate-decision-stack"
      data-total={vm.decisions.length}
      data-shown={shown.length}
    >
      <ul className="flex flex-col gap-2">
        {shown.map((d) => (
          <li
            key={d.id}
            className="rounded-[var(--radius-control)] border border-white/10 p-3 text-sm"
          >
            <p className="font-medium">{d.title}</p>
            <p className="text-[var(--color-muted-400)]">{d.description}</p>
            {d.dueBy ? (
              <p className="mt-1 text-xs text-[var(--color-warning-400)]">
                Vence <DateTimeText value={d.dueBy} mode="relative" />
              </p>
            ) : null}
            <LinkButton href={d.href} size="sm" variant="secondary" className="mt-2">
              Ver detalle
            </LinkButton>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--color-muted-400)]">
          {hiddenCount} decisión(es) adicional(es) disponible(s) en el expediente.
        </p>
      ) : null}
    </div>
  );
}

/** Fecha, kilometraje, ambos o condición — nunca una promesa sin base. */
export function NextServiceCard({ vm }: { vm: NextServiceViewModel }) {
  const hasDate = Boolean(vm.dueDate);
  const hasOdometer = vm.dueOdometerKm !== null;
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
        Próximo servicio
      </p>
      <p className="mt-1 text-base font-semibold">{vm.label}</p>
      <p className="mt-2 text-sm">
        {hasDate ? <DateTimeText value={vm.dueDate!} /> : null}
        {hasDate && hasOdometer ? " · " : null}
        {hasOdometer ? <OdometerText km={vm.dueOdometerKm} readAt="known" /> : null}
        {!hasDate && !hasOdometer
          ? (vm.condition ?? "Según condición observada en la última inspección")
          : null}
      </p>
      <p className="mt-2 text-xs text-[var(--color-muted-400)]">{vm.basis}</p>
    </Card>
  );
}

export function OperationalNextActionCard({ vm }: { vm: OperationalNextActionViewModel }) {
  const { action } = vm;
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
        Siguiente acción operativa
      </p>
      <p className="mt-1 text-base font-semibold">{action.primaryAction}</p>
      <p className="mt-1 text-sm text-[var(--color-muted-400)]">
        {action.assignee ?? action.assigneeReason ?? "Sin asignar"}
      </p>
    </Card>
  );
}

/** Never presents fabricated success — completedSuccessfully is always
 * `false` in R0-B (see CaseProofSummaryViewModel). */
export function CaseProofSummary({ vm }: { vm: CaseProofSummaryViewModel }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
        Respaldo del caso
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--color-muted-400)]">Evidencia</dt>
          <dd className="tabular-nums">{vm.evidenceCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-400)]">Decisiones</dt>
          <dd className="tabular-nums">{vm.decisionsCount}</dd>
        </div>
      </dl>
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {vm.facts.map((f) => (
          <li key={f.id}>
            <span className="font-medium">{f.label}: </span>
            <span className="text-[var(--color-muted-400)]">{f.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--color-muted-400)]">
        Este resumen no confirma que el trabajo esté completado.
      </p>
    </Card>
  );
}

const priceModeLabels: Record<ServicePriceMode, string> = {
  fixed: "Precio fijo",
  from: "Desde",
  range: "Rango",
  inspection_required: "Requiere inspección",
  diagnosis_required: "Requiere diagnóstico",
};

/** Impide mostrar un precio sin modalidad (ley 37). This is the ONLY place a
 * price should render — always call with a `PriceModality`. */
export function PricingBasisBadge({
  modality,
  className,
}: {
  modality: PriceModality;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5", className)}>
      <Badge tone={modality.mode === "fixed" ? "success" : "info"}>
        {priceModeLabels[modality.mode]}
      </Badge>
      {modality.amount ? (
        <MoneyText amount={modality.amount.amount} currency={modality.amount.currency} />
      ) : null}
      {modality.amountFrom && !modality.amountTo ? (
        <MoneyText amount={modality.amountFrom.amount} currency={modality.amountFrom.currency} />
      ) : null}
      {modality.amountFrom && modality.amountTo ? (
        <span className="tabular-nums text-sm">
          <MoneyText amount={modality.amountFrom.amount} currency={modality.amountFrom.currency} />
          {" – "}
          <MoneyText amount={modality.amountTo.amount} currency={modality.amountTo.currency} />
        </span>
      ) : null}
      {modality.note ? (
        <span className="text-xs text-[var(--color-muted-400)]">{modality.note}</span>
      ) : null}
    </span>
  );
}
