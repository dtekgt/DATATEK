import type { MaintenanceTriggerKind, ServicePriceMode, VehicleNowStatus } from "@datatek/domain";
import type { DemoMarker, Money, OperationalNextAction, PriceModality } from "./shared";

/** Canonical experience view models (R0-A sección 13.1 / R0-B sección 9).
 * These filter and present already-authorized facts. They never grant
 * access and never replace policy checks. */

export interface VehicleNowViewModel extends DemoMarker {
  vehicleId: string;
  status: VehicleNowStatus;
  headline: string;
  detail: string | null;
  source: string;
  observedAt: string | null;
  /** Ley 32: "sin hallazgos" no equivale a "vehículo saludable". */
  noFindingsIsNotHealthy: true;
  /** Never a global health percentage (R0-B sección 6, VehicleContextRail). */
  globalHealthScore: null;
}

export interface NextServiceViewModel extends DemoMarker {
  vehicleId: string;
  label: string;
  triggerKind: MaintenanceTriggerKind;
  dueDate: string | null;
  dueOdometerKm: number | null;
  condition: string | null;
  basis: string;
}

export interface ImmediateDecision {
  id: string;
  title: string;
  description: string;
  dueBy: string | null;
  href: string;
}

export interface ImmediateDecisionViewModel extends DemoMarker {
  vehicleId: string;
  /** Full set as known to the system — MAY exceed 3. The UI component
   * (`ImmediateDecisionStack`) enforces the max-3 display rule; this view
   * model intentionally keeps the raw count so a fixture can prove the
   * enforcement (ley 33). */
  decisions: ImmediateDecision[];
}

export interface OperationalNextActionViewModel extends DemoMarker {
  caseId: string;
  action: OperationalNextAction;
}

export interface ProofFact {
  id: string;
  label: string;
  detail: string;
}

export interface CaseProofSummaryViewModel extends DemoMarker {
  caseId: string;
  facts: ProofFact[];
  evidenceCount: number;
  decisionsCount: number;
  /** R0-B never claims a completed operation. */
  completedSuccessfully: false;
}

export interface ServicePricePresentationViewModel extends DemoMarker {
  serviceId: string;
  serviceName: string;
  modality: PriceModality;
}

export function assertPriceHasModality(modality: PriceModality): ServicePriceMode {
  // A price without a declared modality must never render (ley 37).
  return modality.mode;
}

export type { Money };
