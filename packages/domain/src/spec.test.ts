import { describe, it } from "node:test";
import { expect } from "expect";
import {
  CASE_STATUSES,
  QUOTE_VERSION_STATUSES,
  SERVICE_PRICE_MODES,
  MAINTENANCE_TRIGGER_KINDS,
  EXPERIENCE_SPEC,
  SPEC_VERSION,
} from "../generated/spec.constants";

describe("generated domain spec", () => {
  it("is deterministic and matches the normative counts from R0-A", () => {
    expect(SPEC_VERSION).toBe("r0.1");
    expect(CASE_STATUSES).toHaveLength(15);
    expect(QUOTE_VERSION_STATUSES).toEqual(["draft", "frozen", "superseded", "voided"]);
    expect(SERVICE_PRICE_MODES).toHaveLength(5);
    expect(MAINTENANCE_TRIGGER_KINDS).toEqual(["date", "odometer", "whichever_first", "condition"]);
  });

  it("caps immediate decisions at 3 and forbids a global health score", () => {
    expect(EXPERIENCE_SPEC.max_immediate_decisions).toBe(3);
    expect(EXPERIENCE_SPEC.global_vehicle_health_score).toBe(false);
    expect(EXPERIENCE_SPEC.guest_authorization_requires_account).toBe(false);
  });
});
