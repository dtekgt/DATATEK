import { describe, it } from "node:test";
import { expect } from "expect";
import { recordFinding, createMaintenanceRecommendation } from "../commands/inspection-commands.ts";
import { buildReadyToQuoteCase } from "../commands/test-helpers.ts";
import { getNextService } from "./next-service.ts";
import { buildQueryContext, inspectorCtx } from "./query-test-helpers.ts";

describe("getNextService — DATATEK_R0_D sección 3.1", () => {
  it("returns null for a vehicle with no recommendations yet — never invents a due date", () => {
    const scenario = buildReadyToQuoteCase("next-none");
    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getNextService(scenario.state, ctx, scenario.vehicleId);
    expect(result).toBeNull();
  });

  it("picks the more urgent recommendation (overdue over upcoming) and describes it from the linked finding", () => {
    const scenario = buildReadyToQuoteCase("next-pick");
    const finding = recordFinding(scenario.state, inspectorCtx("next-pick-finding"), {
      caseId: scenario.caseId,
      description: "Pastillas delanteras cerca del límite",
      urgency: "attention",
      visibility: "customer",
    });
    if (!finding.ok) throw new Error("setup failed");

    const upcoming = createMaintenanceRecommendation(
      finding.nextState,
      inspectorCtx("next-pick-upcoming"),
      {
        caseId: scenario.caseId,
        vehicleId: scenario.vehicleId,
        triggerKind: "date",
        dueAt: "2027-01-01T00:00:00.000Z",
        basisKind: "manufacturer",
        status: "upcoming",
      },
    );
    if (!upcoming.ok) throw new Error("setup failed");

    const overdue = createMaintenanceRecommendation(
      upcoming.nextState,
      inspectorCtx("next-pick-overdue"),
      {
        caseId: scenario.caseId,
        vehicleId: scenario.vehicleId,
        findingId: finding.data.id,
        triggerKind: "odometer",
        dueOdometerKm: 80000,
        basisKind: "inspection",
        status: "overdue",
      },
    );
    if (!overdue.ok) throw new Error("setup failed");

    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getNextService(overdue.nextState, ctx, scenario.vehicleId);
    expect(result).not.toBeNull();
    expect(result?.label).toBe("Pastillas delanteras cerca del límite");
    expect(result?.dueOdometerKm).toBe(80000);
    expect(result?.basis).toBe("Hallazgo de inspección");
  });

  it("without a linked finding, falls back to a generic label — never fabricates specifics", () => {
    const scenario = buildReadyToQuoteCase("next-generic");
    const rec = createMaintenanceRecommendation(scenario.state, inspectorCtx("next-generic-rec"), {
      caseId: scenario.caseId,
      vehicleId: scenario.vehicleId,
      triggerKind: "whichever_first",
      dueAt: "2027-02-01T00:00:00.000Z",
      dueOdometerKm: 90000,
      basisKind: "manufacturer",
      status: "due_soon",
    });
    if (!rec.ok) throw new Error("setup failed");

    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getNextService(rec.nextState, ctx, scenario.vehicleId);
    expect(result?.label).toBe("Próximo servicio recomendado");
    expect(result?.triggerKind).toBe("whichever_first");
    expect(result?.basis).toBe("Recomendación del fabricante");
  });
});
