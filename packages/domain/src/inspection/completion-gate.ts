// CompleteInspection gate — DATATEK_R0_A sección 7.4, literal:
//
//   "CompleteInspection falla si: faltan campos requeridos sin razón; una
//   medición no tiene unidad; falta actor o momento; se usó un template no
//   vigente al iniciar; evidencia requerida quedó en intención no
//   confirmada; existe un resultado inválido o un eje/lado incoherente."
//
// Pure function: takes plain records (no engine state, no Postgres row
// shapes) so it is independently unit-testable and reusable by both the
// `CompleteInspection` command and its tests.
import type { BrakeCondition } from "../../generated/spec.constants.ts";
import {
  brakesTemplateRequiredSlots,
  findBrakeItemDef,
  type BrakeAxle,
  type BrakeSide,
} from "./brakes-template.ts";

export interface RecordedBrakeResult {
  itemKey: string;
  axle: BrakeAxle | null;
  side: BrakeSide | null;
  condition: BrakeCondition;
  notes: string | null;
  actorId: string | null;
  measuredAt: string | null;
}

export interface RecordedBrakeMeasurement {
  itemKey: string;
  axle: BrakeAxle | null;
  side: BrakeSide | null;
  unit: string | null;
  value: number | null;
}

export interface CompletionGateInput {
  results: RecordedBrakeResult[];
  measurements: RecordedBrakeMeasurement[];
  /** false when the template version fixed at `StartInspection` has since
   * been retired/superseded — "template no vigente al iniciar". */
  templateVersionStillActive: boolean;
  /** true when at least one evidence item this inspection requires is still
   * an unconfirmed upload intent (never reached `evidence_asset`). */
  hasUnconfirmedRequiredEvidence: boolean;
}

export interface CompletionGateResult {
  ok: boolean;
  reasons: string[];
}

const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;

function describeSlot(slot: {
  itemKey: string;
  axle: BrakeAxle | null;
  side: BrakeSide | null;
}): string {
  return slot.axle && slot.side
    ? `${slot.itemKey}, eje ${slot.axle}, lado ${slot.side}`
    : slot.itemKey;
}

const NEEDS_REASON: readonly BrakeCondition[] = ["not_inspected", "not_applicable"];
/** Conditions under which a measurement-required item is exempt from also
 * needing a recorded measurement — the item was never actually observed. */
const MEASUREMENT_EXEMPT: readonly BrakeCondition[] = ["not_inspected", "not_applicable"];

export function evaluateBrakesCompletionGate(input: CompletionGateInput): CompletionGateResult {
  const reasons: string[] = [];

  if (!input.templateVersionStillActive) {
    reasons.push("La versión de template fijada al iniciar la inspección ya no está vigente.");
  }
  if (input.hasUnconfirmedRequiredEvidence) {
    reasons.push(
      "Existe evidencia requerida que quedó en intención de subida (upload intent) sin confirmar.",
    );
  }

  // --- eje/lado incoherente: cada resultado registrado debe llevar eje+lado
  // exactamente cuando su item lo requiere, ni más ni menos.
  for (const result of input.results) {
    const itemDef = findBrakeItemDef(result.itemKey);
    if (!itemDef) {
      reasons.push(
        `"${result.itemKey}" no pertenece al template de frenos vigente (resultado inválido).`,
      );
      continue;
    }
    const hasAxleSide = result.axle !== null && result.side !== null;
    const hasNeither = result.axle === null && result.side === null;
    if (itemDef.scope === "axle_side" && !hasAxleSide) {
      reasons.push(
        `"${result.itemKey}" requiere eje y lado, pero el resultado no los tiene completos (eje/lado incoherente).`,
      );
    }
    if (itemDef.scope === "vehicle" && !hasNeither) {
      reasons.push(
        `"${result.itemKey}" es de alcance vehículo y no debe llevar eje/lado (eje/lado incoherente).`,
      );
    }
  }

  // --- campos requeridos, unidad, actor/momento, medición.
  const requiredSlots = brakesTemplateRequiredSlots();
  for (const slot of requiredSlots) {
    const result = input.results.find(
      (r) => r.itemKey === slot.itemKey && r.axle === slot.axle && r.side === slot.side,
    );
    if (!result) {
      reasons.push(`Falta el campo requerido: ${describeSlot(slot)}.`);
      continue;
    }
    if (NEEDS_REASON.includes(result.condition) && !NON_EMPTY(result.notes)) {
      reasons.push(
        `"${describeSlot(slot)}" usa condición "${result.condition}" sin motivo/contexto.`,
      );
    }
    if (!result.actorId || !NON_EMPTY(result.measuredAt)) {
      reasons.push(`"${describeSlot(slot)}" no tiene actor o momento (measuredAt) registrado.`);
    }

    const itemDef = findBrakeItemDef(slot.itemKey);
    if (itemDef?.requiresMeasurement && !MEASUREMENT_EXEMPT.includes(result.condition)) {
      const measurement = input.measurements.find(
        (m) => m.itemKey === slot.itemKey && m.axle === slot.axle && m.side === slot.side,
      );
      if (!measurement) {
        reasons.push(`"${describeSlot(slot)}" requiere una medición y no la tiene.`);
      } else if (!NON_EMPTY(measurement.unit)) {
        reasons.push(`La medición de "${describeSlot(slot)}" no tiene unidad explícita.`);
      } else if (measurement.value == null || measurement.value < 0) {
        reasons.push(`La medición de "${describeSlot(slot)}" no tiene un valor válido.`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}
