import type {
  BrakeCondition,
  CaseStatus,
  MaintenanceStatus,
  MaintenanceTriggerKind,
  Provenance,
  ServicePriceMode,
  VehicleNowStatus,
  Visibility,
} from "@datatek/domain";

/** Every view model in this shape family carries this marker so the UI can
 * render a visible "DEMO DATA" badge and refuse to treat the payload as
 * real. `true` for every static fixture adapter (`adapters/*.ts`) — always,
 * unconditionally, by construction. `false` for every query contract
 * (`queries/*.ts`, R0-D Fase 4a/4b) reading real `CrmVehicleState` — a case
 * built through the real command engine is real within this demo's own
 * scope (sección "Reglas que no puedes romper": "los datos reales del motor
 * NO llevan ese rotulo"), even though nothing here is persisted to
 * Postgres yet. Widened from a `true` literal (R0-B/Fase 4a) to `boolean`
 * in Fase 4b once a real, engine-backed page (`VehicleNowCard` on `/pass`)
 * exposed the literal-`true` version's actual bug: every query response
 * satisfied the marker's type by unconditionally setting `demo: true`,
 * which made a genuinely real vehicle status render the SAME "DEMO DATA"
 * badge as the static fixture it replaced. */
export interface DemoMarker {
  demo: boolean;
}

export interface Fact<T> {
  value: T;
  provenance: Provenance;
  /** ISO 8601. A fact without a timestamp cannot claim freshness (ley 41). */
  observedAt: string | null;
  source: string;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface PriceModality {
  mode: ServicePriceMode;
  amount?: Money;
  amountFrom?: Money;
  amountTo?: Money;
  note?: string;
}

export interface StageRailStage {
  id: CaseStatus;
  label: string;
  completedAt: string | null;
  current: boolean;
  /** Stages after authorization that have not happened yet render as
   * "Planificado", never as if they already occurred. */
  planned: boolean;
}

export interface OperationalNextAction {
  primaryAction: string;
  assignee: string | null;
  assigneeReason: string | null; // e.g. "Sin asignar"
  dueAt: string | null;
  waitingSince: string | null;
  blocker: { description: string; resolvableBy: string } | null;
  evidenceCompleteness: number; // 0..1
}

export interface CaseBlocker {
  id: string;
  description: string;
  resolvableBy: string;
  raisedAt: string;
}

export interface EvidenceItem {
  id: string;
  label: string;
  kind: "photo" | "video" | "document" | "measurement";
  provenance: Provenance;
  visibility: Visibility;
  capturedAt: string | null;
}

export interface BrakeMeasurement {
  axle: "front" | "rear";
  condition: BrakeCondition;
  padMm: number | null;
  note: string | null;
}

export interface MaintenanceItem {
  id: string;
  label: string;
  trigger: MaintenanceTriggerKind;
  status: MaintenanceStatus;
  dueDate: string | null;
  dueOdometerKm: number | null;
  basis: string;
}

export interface VehicleNowFact {
  status: VehicleNowStatus;
  headline: string;
  detail: string | null;
  source: string;
  observedAt: string | null;
}
