import { describe, it } from "node:test";
import { expect } from "expect";
import { recordFinding } from "../commands/inspection-commands.ts";
import { buildReadyToQuoteCase } from "../commands/test-helpers.ts";
import { getVehicleNow } from "./vehicle-now.ts";
import { buildQueryContext, inspectorCtx } from "./query-test-helpers.ts";

describe("getVehicleNow — DATATEK_R0_D sección 9 (prioridad)", () => {
  it("unknown: a vehicle with no inspection data at all", () => {
    // A vehicle that only just got registered — no case built for it here.
    const scenario = buildReadyToQuoteCase("now-unknown");
    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getVehicleNow(scenario.state, ctx, "vehicle-does-not-exist");
    expect(result.status).toBe("unknown");
    expect(result.observedAt).toBeNull();
    expect(result.noFindingsIsNotHealthy).toBe(true);
    expect(result.globalHealthScore).toBeNull();
  });

  it("no_current_alerts: completed inspection, no findings — never claims 'healthy'", () => {
    const scenario = buildReadyToQuoteCase("now-clean");
    const ctx = buildQueryContext({
      audience: "pass",
      actorId: scenario.customerId,
      now: new Date("2026-08-05T00:00:00.000Z"),
    });
    const result = getVehicleNow(scenario.state, ctx, scenario.vehicleId);
    expect(result.status).toBe("no_current_alerts");
    expect(result.detail).toMatch(/revisión de frenos/i);
    expect(result.headline.toLowerCase()).not.toContain("saludable");
    expect(result.noFindingsIsNotHealthy).toBe(true);
  });

  it("action_required: a customer-visible safety_critical finding wins over everything else", () => {
    const scenario = buildReadyToQuoteCase("now-critical");
    const finding = recordFinding(scenario.state, inspectorCtx("now-critical-finding"), {
      caseId: scenario.caseId,
      description: "Manguera de freno con fuga visible",
      urgency: "safety_critical",
      visibility: "customer",
    });
    if (!finding.ok) throw new Error("setup failed");

    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getVehicleNow(finding.nextState, ctx, scenario.vehicleId);
    expect(result.status).toBe("action_required");
    expect(result.headline).toBe("Manguera de freno con fuga visible");
    expect(result.observedAt).toBe(finding.data.occurredAt);
  });

  it("attention: a customer-visible 'attention' finding without a critical one", () => {
    const scenario = buildReadyToQuoteCase("now-attention");
    const finding = recordFinding(scenario.state, inspectorCtx("now-attention-finding"), {
      caseId: scenario.caseId,
      description: "Desgaste moderado en pastillas traseras",
      urgency: "attention",
      visibility: "customer",
    });
    if (!finding.ok) throw new Error("setup failed");

    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getVehicleNow(finding.nextState, ctx, scenario.vehicleId);
    expect(result.status).toBe("attention");
    expect(result.headline).toBe("Desgaste moderado en pastillas traseras");
  });

  it("an INTERNAL critical finding never surfaces to pass/guest, but does to pro", () => {
    const scenario = buildReadyToQuoteCase("now-internal");
    const finding = recordFinding(scenario.state, inspectorCtx("now-internal-finding"), {
      caseId: scenario.caseId,
      description: "Nota interna: revisar proveedor de pastillas",
      urgency: "safety_critical",
      visibility: "internal",
    });
    if (!finding.ok) throw new Error("setup failed");

    const passCtx = buildQueryContext({
      audience: "pass",
      actorId: scenario.customerId,
      now: new Date("2026-08-05T00:00:00.000Z"),
    });
    const passResult = getVehicleNow(finding.nextState, passCtx, scenario.vehicleId);
    expect(passResult.status).not.toBe("action_required");
    expect(passResult.status).toBe("no_current_alerts");

    const proCtx = buildQueryContext({ audience: "pro", actorId: "u-advisor-dtek" });
    const proResult = getVehicleNow(finding.nextState, proCtx, scenario.vehicleId);
    expect(proResult.status).toBe("action_required");
  });

  it("stale: a completed inspection older than the freshness window", () => {
    const scenario = buildReadyToQuoteCase("now-stale");
    // The fixture inspection completes around 2026-08-03 (buildReadyToQuoteCase's
    // fixed appointment date) — evaluate "now" far enough in the future to
    // cross the staleness threshold.
    const ctx = buildQueryContext({
      audience: "pass",
      actorId: scenario.customerId,
      now: new Date("2027-06-01T00:00:00.000Z"),
    });
    const result = getVehicleNow(scenario.state, ctx, scenario.vehicleId);
    expect(result.status).toBe("stale");
  });
});
