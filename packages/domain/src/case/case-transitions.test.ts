import { describe, it } from "node:test";
import { expect } from "expect";
import { resolveCaseTransition, isTerminalCaseStatus } from "./case-transitions.ts";

describe("Case transitions — R0-A sección 5.1", () => {
  it("allows every literal edge of the R0-A table", () => {
    expect(resolveCaseTransition("new", "triage").ok).toBe(true);
    expect(resolveCaseTransition("triage", "waiting_customer").ok).toBe(true);
    expect(resolveCaseTransition("waiting_customer", "triage").ok).toBe(true);
    expect(resolveCaseTransition("triage", "scheduled").ok).toBe(true);
    expect(resolveCaseTransition("scheduled", "received").ok).toBe(true);
    expect(resolveCaseTransition("received", "inspection").ok).toBe(true);
    expect(resolveCaseTransition("inspection", "waiting_authorization").ok).toBe(true);
    expect(resolveCaseTransition("waiting_authorization", "ready").ok).toBe(true);
    expect(resolveCaseTransition("waiting_authorization", "closed").ok).toBe(true);
  });

  it("rejects edges that skip steps", () => {
    const result = resolveCaseTransition("new", "scheduled");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("rejects edges that go backwards outside the documented cycle", () => {
    expect(resolveCaseTransition("inspection", "received").ok).toBe(false);
    expect(resolveCaseTransition("received", "new").ok).toBe(false);
  });

  it("allows cancel from any non-terminal status", () => {
    for (const from of [
      "new",
      "triage",
      "waiting_customer",
      "scheduled",
      "received",
      "inspection",
      "waiting_authorization",
    ] as const) {
      expect(resolveCaseTransition(from, "cancelled").ok).toBe(true);
    }
  });

  it("never allows cancel from a terminal status", () => {
    expect(resolveCaseTransition("closed", "cancelled").ok).toBe(false);
    expect(resolveCaseTransition("cancelled", "cancelled").ok).toBe(false);
  });

  it("never reopens a terminal case into any other status", () => {
    expect(resolveCaseTransition("closed", "triage").ok).toBe(false);
    expect(resolveCaseTransition("cancelled", "new").ok).toBe(false);
  });

  it("identifies terminal statuses", () => {
    expect(isTerminalCaseStatus("closed")).toBe(true);
    expect(isTerminalCaseStatus("cancelled")).toBe(true);
    expect(isTerminalCaseStatus("triage")).toBe(false);
  });
});
