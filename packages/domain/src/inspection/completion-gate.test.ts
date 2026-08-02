import { describe, it } from "node:test";
import { expect } from "expect";
import {
  evaluateBrakesCompletionGate,
  type RecordedBrakeResult,
  type RecordedBrakeMeasurement,
} from "./completion-gate.ts";
import { BRAKES_TEMPLATE_ITEMS, brakesTemplateRequiredSlots } from "./brakes-template.ts";

const ACTOR = "u-inspector-dtek";
const AT = "2026-08-01T10:00:00.000Z";

/** Builds a fully-populated, passing set of results/measurements for every
 * required slot of the template — the baseline every negative test mutates
 * away from. */
function buildCompleteFixture(): {
  results: RecordedBrakeResult[];
  measurements: RecordedBrakeMeasurement[];
} {
  const results: RecordedBrakeResult[] = [];
  const measurements: RecordedBrakeMeasurement[] = [];
  for (const slot of brakesTemplateRequiredSlots()) {
    results.push({
      itemKey: slot.itemKey,
      axle: slot.axle,
      side: slot.side,
      condition: "pass",
      notes: null,
      actorId: ACTOR,
      measuredAt: AT,
    });
    const itemDef = BRAKES_TEMPLATE_ITEMS.find((i) => i.key === slot.itemKey);
    if (itemDef?.requiresMeasurement) {
      measurements.push({
        itemKey: slot.itemKey,
        axle: slot.axle,
        side: slot.side,
        unit: itemDef.measurementUnit,
        value: 6,
      });
    }
  }
  return { results, measurements };
}

describe("CompleteInspection gate — R0-A sección 7.4", () => {
  it("passes a fully-populated, coherent inspection", () => {
    const { results, measurements } = buildCompleteFixture();
    const gate = evaluateBrakesCompletionGate({
      results,
      measurements,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(true);
    expect(gate.reasons).toHaveLength(0);
  });

  it("fails when a required field is missing entirely", () => {
    const { results, measurements } = buildCompleteFixture();
    const gate = evaluateBrakesCompletionGate({
      results: results.filter(
        (r) => !(r.itemKey === "caliper_condition" && r.axle === "front" && r.side === "left"),
      ),
      measurements,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("Falta el campo requerido"))).toBe(true);
  });

  it("fails when a measurement-required item has no unit", () => {
    const { results, measurements } = buildCompleteFixture();
    const withoutUnit = measurements.map((m) =>
      m.itemKey === "pad_thickness_inner" && m.axle === "front" && m.side === "left"
        ? { ...m, unit: null }
        : m,
    );
    const gate = evaluateBrakesCompletionGate({
      results,
      measurements: withoutUnit,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("no tiene unidad explícita"))).toBe(true);
  });

  it("fails when actor or measuredAt is missing", () => {
    const { results, measurements } = buildCompleteFixture();
    const withoutActor = results.map((r) =>
      r.itemKey === "pedal_result" ? { ...r, actorId: null } : r,
    );
    const gate = evaluateBrakesCompletionGate({
      results: withoutActor,
      measurements,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("actor o momento"))).toBe(true);
  });

  it("fails when template version is no longer active", () => {
    const { results, measurements } = buildCompleteFixture();
    const gate = evaluateBrakesCompletionGate({
      results,
      measurements,
      templateVersionStillActive: false,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("ya no está vigente"))).toBe(true);
  });

  it("fails when required evidence is unconfirmed", () => {
    const { results, measurements } = buildCompleteFixture();
    const gate = evaluateBrakesCompletionGate({
      results,
      measurements,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: true,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("evidencia requerida"))).toBe(true);
  });

  it("fails when not_inspected has no reason", () => {
    const { results, measurements } = buildCompleteFixture();
    const withoutReason = results.map((r) =>
      r.itemKey === "hoses_condition" && r.axle === "rear" && r.side === "right"
        ? { ...r, condition: "not_inspected" as const, notes: null }
        : r,
    );
    const gate = evaluateBrakesCompletionGate({
      results: withoutReason,
      measurements,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("sin motivo/contexto"))).toBe(true);
  });

  it("passes when not_applicable has context, exempting it from measurement", () => {
    const { results, measurements } = buildCompleteFixture();
    const withContext = results.map((r) =>
      r.itemKey === "pad_thickness_inner" && r.axle === "rear" && r.side === "left"
        ? {
            ...r,
            condition: "not_applicable" as const,
            notes: "Eje sin pastillas removibles en esta variante.",
          }
        : r,
    );
    const withoutMeasurement = measurements.filter(
      (m) => !(m.itemKey === "pad_thickness_inner" && m.axle === "rear" && m.side === "left"),
    );
    const gate = evaluateBrakesCompletionGate({
      results: withContext,
      measurements: withoutMeasurement,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(true);
  });

  it("fails on an axle/side-incoherent result (vehicle-scope item carrying axle/side)", () => {
    const { results, measurements } = buildCompleteFixture();
    const incoherent = results.map((r) =>
      r.itemKey === "pedal_result" ? { ...r, axle: "front" as const, side: "left" as const } : r,
    );
    const gate = evaluateBrakesCompletionGate({
      results: incoherent,
      measurements,
      templateVersionStillActive: true,
      hasUnconfirmedRequiredEvidence: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes("eje/lado incoherente"))).toBe(true);
  });
});
