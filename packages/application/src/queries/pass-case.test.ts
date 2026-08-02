import { describe, it } from "node:test";
import { expect } from "expect";
import { getPassCase } from "./pass-case.ts";
import { buildQueryContext, buildPreparedAndSentScenario } from "./query-test-helpers.ts";

describe("getPassCase — DATATEK_R0_D sección 3.1 (no-enumeración entre clientes)", () => {
  it("returns the case for its own customer, reflecting the real waiting_authorization status", () => {
    const sent = buildPreparedAndSentScenario("pass-case-ok");
    const ctx = buildQueryContext({ audience: "pass", actorId: sent.customerId });

    const result = getPassCase(sent.state, ctx, sent.caseId);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("waiting_authorization");
    expect(result?.friendlyStatus).toBe("Esperando autorización");
    expect(result?.proofSummaryId).toBe(sent.caseId);
  });

  it("returns null for a different customer's case (never leaks cross-customer data)", () => {
    const sent = buildPreparedAndSentScenario("pass-case-other");
    const ctx = buildQueryContext({ audience: "pass", actorId: "some-other-customer-id" });

    const result = getPassCase(sent.state, ctx, sent.caseId);
    expect(result).toBeNull();
  });

  it("a guest audience is held to the same ownership check as pass", () => {
    const sent = buildPreparedAndSentScenario("pass-case-guest");
    const ctx = buildQueryContext({ audience: "guest", actorId: "not-the-right-customer" });

    const result = getPassCase(sent.state, ctx, sent.caseId);
    expect(result).toBeNull();
  });

  it("a pro audience is not restricted by actorId (staff sees any case in the org)", () => {
    const sent = buildPreparedAndSentScenario("pass-case-pro");
    const ctx = buildQueryContext({ audience: "pro", actorId: "u-advisor-dtek" });

    const result = getPassCase(sent.state, ctx, sent.caseId);
    expect(result).not.toBeNull();
    expect(result?.caseId).toBe(sent.caseId);
  });

  it("returns null for a case id that does not exist", () => {
    const sent = buildPreparedAndSentScenario("pass-case-missing");
    const ctx = buildQueryContext({ audience: "pass", actorId: sent.customerId });
    expect(getPassCase(sent.state, ctx, "case-does-not-exist")).toBeNull();
  });
});
