import { describe, it } from "node:test";
import { expect } from "expect";
import {
  buildAudienceCacheKey,
  minimizeActorLabelForCustomer,
  projectCaseProofSummaryForCustomer,
  type CaseProofSummaryInternal,
} from "./audience";

describe("buildAudienceCacheKey", () => {
  it("separates audience, tenant and scope so Control and Pass never collide", () => {
    const proKey = buildAudienceCacheKey({
      audience: "pro",
      organizationId: "org-dtek",
      scope: "case-1",
    });
    const passKey = buildAudienceCacheKey({
      audience: "pass",
      organizationId: "org-dtek",
      scope: "case-1",
    });
    expect(proKey).not.toBe(passKey);
  });
});

describe("minimizeActorLabelForCustomer", () => {
  it("never exposes the full internal name to a customer audience", () => {
    const label = minimizeActorLabelForCustomer("Ana María Pérez López", "Asesora");
    expect(label).toBe("Ana · Asesora");
    expect(label).not.toContain("Pérez López");
  });
});

describe("projectCaseProofSummaryForCustomer", () => {
  it("drops internal notes and counts, keeping only customer-visible facts", () => {
    const internal: CaseProofSummaryInternal = {
      audience: "pro",
      caseId: "case-1",
      internalNotes: ["cliente conflictivo", "revisar precio interno"],
      evidenceCount: 12,
      facts: [{ label: "Frenos delanteros", detail: "Desgaste 40%", observedAt: null }],
    };
    const customer = projectCaseProofSummaryForCustomer(internal);
    expect(customer).toEqual({
      audience: "pass",
      caseId: "case-1",
      facts: internal.facts,
    });
    expect((customer as unknown as Record<string, unknown>).internalNotes).toBeUndefined();
    expect((customer as unknown as Record<string, unknown>).evidenceCount).toBeUndefined();
  });
});
