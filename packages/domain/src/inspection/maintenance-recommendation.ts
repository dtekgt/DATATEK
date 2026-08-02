// Maintenance recommendation invariants — DATATEK_R0_A sección 4.15, literal:
//
//   "date requiere due_at; odometer requiere due_odometer_km;
//   whichever_first requiere ambos; condition requiere explicación; el
//   kilometraje no puede ser negativo; toda recomendación registra
//   procedencia y actor; unknown no inventa vencimiento."
import type { MaintenanceTriggerKind } from "../../generated/spec.constants.ts";
import { DomainInvariantError } from "../value-objects/errors.ts";

export type MaintenanceBasisKind = "manufacturer" | "inspection" | "service_history" | "technician";

export interface MaintenanceRecommendationDraft {
  triggerKind: MaintenanceTriggerKind;
  dueAt: string | null;
  dueOdometerKm: number | null;
  customerExplanation: string | null;
}

const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** Pure validation — throws `DomainInvariantError` on the first violated
 * rule. Callers (the `CreateMaintenanceRecommendation` command) catch and
 * translate this into a stable `CommandError` the same way every other
 * command in this codebase wraps a domain value-object constructor. */
export function assertValidMaintenanceRecommendationDraft(
  draft: MaintenanceRecommendationDraft,
): void {
  if (draft.dueOdometerKm != null && draft.dueOdometerKm < 0) {
    throw new DomainInvariantError("due_odometer_km no puede ser negativo", "dueOdometerKm");
  }

  switch (draft.triggerKind) {
    case "date":
      if (!NON_EMPTY(draft.dueAt)) {
        throw new DomainInvariantError("trigger_kind='date' requiere due_at", "dueAt");
      }
      if (draft.dueOdometerKm != null) {
        throw new DomainInvariantError(
          "trigger_kind='date' no debe llevar due_odometer_km (usa whichever_first para ambos)",
          "dueOdometerKm",
        );
      }
      return;
    case "odometer":
      if (draft.dueOdometerKm == null) {
        throw new DomainInvariantError(
          "trigger_kind='odometer' requiere due_odometer_km",
          "dueOdometerKm",
        );
      }
      if (NON_EMPTY(draft.dueAt)) {
        throw new DomainInvariantError(
          "trigger_kind='odometer' no debe llevar due_at (usa whichever_first para ambos)",
          "dueAt",
        );
      }
      return;
    case "whichever_first":
      if (!NON_EMPTY(draft.dueAt) || draft.dueOdometerKm == null) {
        throw new DomainInvariantError(
          "trigger_kind='whichever_first' requiere due_at y due_odometer_km",
          "dueAt",
        );
      }
      return;
    case "condition":
      if (!NON_EMPTY(draft.customerExplanation)) {
        throw new DomainInvariantError(
          "trigger_kind='condition' requiere customer_explanation",
          "customerExplanation",
        );
      }
      return;
  }
}
