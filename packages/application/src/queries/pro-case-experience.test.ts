import { describe, it } from "node:test";
import { expect } from "expect";
import { getProCaseExperience } from "./pro-case-experience.ts";
import {
  buildQueryContext,
  buildNewCase,
  buildFrozenQuoteScenario,
  buildPreparedNotSentScenario,
  buildPreparedAndSentScenario,
  buildAcceptedScenario,
  buildRejectedScenario,
} from "./query-test-helpers.ts";
import { buildReadyToQuoteCase } from "../commands/test-helpers.ts";

const proCtx = buildQueryContext({ audience: "pro", actorId: "u-advisor-dtek" });

describe("getProCaseExperience — DATATEK_R0_D sección 15 (una sola siguiente acción)", () => {
  it("returns null for a case that does not exist", () => {
    const scenario = buildNewCase("proexp-missing");
    expect(getProCaseExperience(scenario.state, proCtx, "case-does-not-exist")).toBeNull();
  });

  it("new: 'Hacer triage del caso'", () => {
    const scenario = buildNewCase("proexp-new");
    const result = getProCaseExperience(scenario.state, proCtx, scenario.caseId);
    expect(result?.status).toBe("new");
    expect(result?.nextAction.primaryAction).toBe("Hacer triage del caso");
    expect(result?.nextAction.evidenceCompleteness).toBe(0);
    expect(result?.quoteTotal).toBeNull();
    expect(result?.blockers).toEqual([]);
  });

  it("inspection completed, no quote yet: 'Crear cotización'", () => {
    const scenario = buildReadyToQuoteCase("proexp-noquote");
    const result = getProCaseExperience(scenario.state, proCtx, scenario.caseId);
    expect(result?.status).toBe("inspection");
    expect(result?.nextAction.primaryAction).toBe("Crear cotización");
    expect(result?.nextAction.evidenceCompleteness).toBe(1);
  });

  it("frozen quote, not yet requested: 'Preparar solicitud de autorización'", () => {
    const scenario = buildFrozenQuoteScenario("proexp-frozen");
    const result = getProCaseExperience(scenario.state, proCtx, scenario.caseId);
    expect(result?.status).toBe("inspection");
    expect(result?.nextAction.primaryAction).toBe("Preparar solicitud de autorización");
    expect(result?.quoteTotal).toEqual({ amount: 570, currency: "GTQ" });
  });

  it("request prepared but not sent: 'Enviar solicitud de autorización'", () => {
    const scenario = buildPreparedNotSentScenario("proexp-prepared");
    const result = getProCaseExperience(scenario.state, proCtx, scenario.caseId);
    expect(result?.status).toBe("waiting_authorization");
    expect(result?.nextAction.primaryAction).toBe("Enviar solicitud de autorización");
    expect(result?.nextAction.dueAt).toBeTruthy();
  });

  it("request sent, awaiting decision: 'Esperar la decisión del cliente (o reenviar el enlace)'", () => {
    const scenario = buildPreparedAndSentScenario("proexp-sent");
    const result = getProCaseExperience(scenario.state, proCtx, scenario.caseId);
    expect(result?.status).toBe("waiting_authorization");
    expect(result?.nextAction.primaryAction).toBe(
      "Esperar la decisión del cliente (o reenviar el enlace)",
    );
  });

  it("decided (accepted): 'Siguiente etapa: Planificada (reparación) — R1', quote total still visible", () => {
    const scenario = buildAcceptedScenario("proexp-ready");
    const result = getProCaseExperience(scenario.state, proCtx, scenario.caseId);
    expect(result?.status).toBe("ready");
    expect(result?.nextAction.primaryAction).toBe("Siguiente etapa: Planificada (reparación) — R1");
    expect(result?.quoteTotal).toEqual({ amount: 570, currency: "GTQ" });
    // The stage rail marks `ready` as current, everything after it planned.
    const currentStage = result?.stages.find((s) => s.current);
    expect(currentStage?.id).toBe("ready");
    const inspectionStage = result?.stages.find((s) => s.id === "inspection");
    expect(inspectionStage?.completedAt).toBeTruthy();
  });

  it("decided (rejected): 'Caso cerrado — cliente no autorizó'", () => {
    const scenario = buildRejectedScenario("proexp-closed");
    const result = getProCaseExperience(scenario.state, proCtx, scenario.caseId);
    expect(result?.status).toBe("closed");
    expect(result?.nextAction.primaryAction).toBe("Caso cerrado — cliente no autorizó");
  });
});
