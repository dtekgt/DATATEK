import { describe, it } from "node:test";
import { expect } from "expect";
import { effectiveEvidenceVisibility, isEvidenceVisibleToCustomer } from "./visibility.ts";

describe("Evidence visibility — R0-A sección 8.3", () => {
  it("takes the more restrictive of asset ceiling and link visibility", () => {
    expect(effectiveEvidenceVisibility("internal", "customer")).toBe("internal");
    expect(effectiveEvidenceVisibility("customer", "internal")).toBe("internal");
    expect(effectiveEvidenceVisibility("customer", "customer")).toBe("customer");
    expect(effectiveEvidenceVisibility("shared_case", "customer")).toBe("shared_case");
  });

  it("never shows an internal-capped asset to the customer even via a customer-visibility link", () => {
    expect(isEvidenceVisibleToCustomer("internal", "customer")).toBe(false);
  });

  it("shows a customer-capped asset linked with customer visibility", () => {
    expect(isEvidenceVisibleToCustomer("customer", "customer")).toBe(true);
  });

  it("does not treat shared_case as customer-visible", () => {
    expect(isEvidenceVisibleToCustomer("customer", "shared_case")).toBe(false);
  });
});
