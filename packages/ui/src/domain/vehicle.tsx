import type {
  BrakeMeasurement,
  EvidenceItem,
  MaintenanceItem,
  TimelineEntry,
} from "@datatek/application";
import type { Provenance, Visibility } from "@datatek/domain";
import { Badge, Card } from "../primitives/surfaces";
import { DateTimeText, OdometerText } from "../primitives/text";
import { cn } from "../utils/cn";

export interface VehicleIdentityCardProps {
  label: string;
  plate: string;
  odometerKm: number | null;
  odometerReadAt: string | null;
}

export function VehicleIdentityCard({
  label,
  plate,
  odometerKm,
  odometerReadAt,
}: VehicleIdentityCardProps) {
  return (
    <Card>
      <p className="text-base font-semibold">{label}</p>
      <p className="text-sm text-[var(--color-muted-400)]">Placa {plate}</p>
      <p className="mt-2 text-sm">
        <OdometerText km={odometerKm} readAt={odometerReadAt ?? undefined} />
      </p>
    </Card>
  );
}

export function VehicleTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-400)]">Sin eventos verificables todavía.</p>
    );
  }
  return (
    <ol className="flex flex-col gap-3 border-l border-white/10 pl-4">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[var(--color-brand-400)]"
          />
          <p className="text-sm font-medium">{e.title}</p>
          <p className="text-xs text-[var(--color-muted-400)]">
            <DateTimeText value={e.date} /> · <DataProvenanceBadge provenance={e.provenance} />
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted-400)]">{e.description}</p>
        </li>
      ))}
    </ol>
  );
}

export interface VehicleContextRailProps {
  /** Code name `VehicleContextRail`; presented to users as "VehicleNowNextBar" (sección 6). */
  vehicleLabel: string;
  statusHeadline: string;
  statusSource: string;
  statusObservedAt: string | null;
  compact?: boolean;
}

/** Never renders a global health percentage. Sticky compact rail for
 * Garage/Casos/Citas per sección 7. */
export function VehicleContextRail({
  vehicleLabel,
  statusHeadline,
  statusSource,
  statusObservedAt,
  compact = false,
}: VehicleContextRailProps) {
  return (
    <div
      data-component="VehicleContextRail"
      data-presented-as="VehicleNowNextBar"
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] bg-[var(--surface-panel)] shadow-[var(--neu-raised-sm)]",
        compact ? "px-3 py-2 text-sm" : "p-4",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{vehicleLabel}</p>
        <p className="truncate text-xs text-[var(--color-muted-400)]">
          {statusHeadline} · {statusSource}
          {statusObservedAt ? (
            <>
              {" "}
              · <DateTimeText value={statusObservedAt} mode="relative" />
            </>
          ) : (
            " · sin fecha registrada"
          )}
        </p>
      </div>
    </div>
  );
}

const maintenanceStatusTone: Record<
  MaintenanceItem["status"],
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  upcoming: "neutral",
  due_soon: "info",
  due: "warning",
  overdue: "danger",
  unknown: "neutral",
};

export function MaintenanceRadar({ items }: { items: MaintenanceItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-white/8 p-3"
        >
          <div>
            <p className="text-sm font-medium">{item.label}</p>
            <p className="text-xs text-[var(--color-muted-400)]">{item.basis}</p>
            <p className="mt-1 text-xs text-[var(--color-muted-400)]">
              {item.dueDate ? <DateTimeText value={item.dueDate} /> : null}
              {item.dueDate && item.dueOdometerKm ? " · " : null}
              {item.dueOdometerKm ? <OdometerText km={item.dueOdometerKm} readAt="known" /> : null}
              {!item.dueDate && !item.dueOdometerKm ? "Según condición observada" : null}
            </p>
          </div>
          <Badge tone={maintenanceStatusTone[item.status]}>{item.status}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function InspectionChecklist({ items }: { items: BrakeMeasurement[] }) {
  const toneByCondition: Record<
    BrakeMeasurement["condition"],
    "success" | "warning" | "danger" | "neutral"
  > = {
    pass: "success",
    attention: "warning",
    fail: "danger",
    not_inspected: "neutral",
    not_applicable: "neutral",
  };
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((m, idx) => (
        <li key={idx} className="rounded-[var(--radius-control)] border border-white/8 p-3 text-sm">
          <p className="font-medium capitalize">
            Eje {m.axle === "front" ? "delantero" : "trasero"}
          </p>
          <Badge tone={toneByCondition[m.condition]} className="mt-1">
            {m.condition}
          </Badge>
          {m.padMm !== null ? (
            <p className="mt-1 text-xs text-[var(--color-muted-400)]">{m.padMm} mm</p>
          ) : null}
          {m.note ? <p className="mt-1 text-xs text-[var(--color-muted-400)]">{m.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function MeasurementField({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-input)] border border-white/10 px-3 py-2 text-sm">
      <span className="text-[var(--color-muted-400)]">{label}</span>
      <span className="tabular-nums font-medium">
        {value} {unit}
      </span>
    </div>
  );
}

export function EvidenceGallery({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--color-muted-400)]">Sin evidencia visible todavía.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-[var(--radius-control)] border border-white/8 p-3 text-sm"
        >
          <p className="font-medium">{item.label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <DataProvenanceBadge provenance={item.provenance} />
            <VisibilityBadge visibility={item.visibility} />
          </div>
          {item.capturedAt ? (
            <p className="mt-1 text-xs text-[var(--color-muted-400)]">
              <DateTimeText value={item.capturedAt} mode="datetime" />
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const provenanceLabels: Record<Provenance, string> = {
  observed: "Observado",
  measured: "Medido",
  reported: "Reportado",
  estimated: "Estimado",
  derived: "Derivado",
};

export function DataProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return <Badge tone="info">{provenanceLabels[provenance]}</Badge>;
}

const visibilityLabels: Record<Visibility, string> = {
  internal: "Interno",
  customer: "Cliente",
  shared_case: "Compartido del caso",
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return <Badge tone="neutral">{visibilityLabels[visibility]}</Badge>;
}
