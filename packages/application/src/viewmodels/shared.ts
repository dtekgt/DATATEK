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

/** Every fixture-backed view model carries this marker so the UI can render a
 * visible "DEMO DATA" badge and refuse to treat the payload as real. */
export interface DemoMarker {
  demo: true;
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
