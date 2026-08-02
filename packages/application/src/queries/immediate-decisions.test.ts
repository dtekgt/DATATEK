import { describe, it } from "node:test";
import { expect } from "expect";
import { getImmediateDecisions } from "./immediate-decisions.ts";
import { buildQueryContext, buildPreparedAndSentScenario } from "./query-test-helpers.ts";
import type { AuthorizationRequestRow, CaseRow } from "../commands/state.ts";

describe("getImmediateDecisions — DATATEK_R0_D sección 3.1 / 17 (máximo 3)", () => {
  it("a vehicle with no live authorization request has zero immediate decisions", () => {
    const sent = buildPreparedAndSentScenario("decisions-baseline");
    // A DIFFERENT vehicle than the one with the live request.
    const ctx = buildQueryContext({ audience: "pass", actorId: sent.customerId });
    const result = getImmediateDecisions(sent.state, ctx, "vehicle-with-nothing-pending");
    // Real engine data, never labeled DEMO DATA — see DemoMarker's comment
    // (viewmodels/shared.ts).
    expect(result.demo).toBe(false);
    expect(result.decisions).toHaveLength(0);
  });

  it("one live sent request produces exactly one decision, scoped to the right vehicle/case", () => {
    const sent = buildPreparedAndSentScenario("decisions-one");
    const ctx = buildQueryContext({ audience: "pass", actorId: sent.customerId });
    const result = getImmediateDecisions(sent.state, ctx, sent.vehicleId);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.id).toBe(sent.requestId);
    expect(result.decisions[0]?.href).toBe(`/pass/cases/${sent.caseId}`);
    expect(result.decisions[0]?.dueBy).toBeTruthy();
  });

  it("truncates to EXPERIENCE_SPEC.max_immediate_decisions (3), soonest deadline first", () => {
    const sent = buildPreparedAndSentScenario("decisions-many");

    // Three additional sibling cases + live requests for the SAME customer/
    // vehicle, spliced directly onto state — proving the truncation/sort
    // logic does not require re-running the full command pipeline four
    // times over (the first, realistic request already came from the real
    // engine above).
    const extraCases: CaseRow[] = [1, 2, 3].map((n) => ({
      id: `extra-case-${n}`,
      organizationId: sent.state.cases.find((c) => c.id === sent.caseId)!.organizationId,
      branchId: null,
      folioNumber: 900 + n,
      folioCode: `DTEK-EXTRA-${n}`,
      customerId: sent.customerId,
      vehicleId: sent.vehicleId,
      status: "waiting_authorization",
      sourceIntakeThreadId: null,
      openedAt: "2026-08-01T00:00:00.000Z",
      closedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      createdBy: "u-advisor-dtek",
    }));

    const originalRequest = sent.state.authorizationRequests.find((r) => r.id === sent.requestId)!;
    const extraRequests: AuthorizationRequestRow[] = [1, 2, 3].map((n) => ({
      ...originalRequest,
      id: `extra-request-${n}`,
      caseId: `extra-case-${n}`,
      // Deadlines closer than the original request's, in reverse order, so
      // sorting is actually exercised (not just truncation).
      expiresAt: new Date(Date.parse(originalRequest.expiresAt) - n * 60_000).toISOString(),
    }));

    const state = {
      ...sent.state,
      cases: [...sent.state.cases, ...extraCases],
      authorizationRequests: [...sent.state.authorizationRequests, ...extraRequests],
    };

    const ctx = buildQueryContext({ audience: "pass", actorId: sent.customerId });
    const result = getImmediateDecisions(state, ctx, sent.vehicleId);

    // 4 live requests exist (1 original + 3 extra) — only 3 surface.
    expect(result.decisions).toHaveLength(3);
    // Soonest `dueBy` first: extra-request-3 has the earliest expiresAt.
    expect(result.decisions[0]?.id).toBe("extra-request-3");
    expect(result.decisions[1]?.id).toBe("extra-request-2");
    expect(result.decisions[2]?.id).toBe("extra-request-1");
  });
});
