import { describe, it } from "node:test";
import { expect } from "expect";
import { createMeasurement, equalsMeasurement } from "./measurement.ts";
import { DomainInvariantError } from "./errors.ts";

describe("Measurement value object", () => {
  it("creates a valid measurement with an explicit unit", () => {
    const m = createMeasurement(3.1, "mm");
    expect(m.value).toBe(3.1);
    expect(m.unit).toBe("mm");
  });

  it("rejects a negative value", () => {
    expect(() => createMeasurement(-1, "mm")).toThrow(DomainInvariantError);
  });

  it("rejects a missing/blank unit — never inferred", () => {
    expect(() => createMeasurement(3, "")).toThrow(DomainInvariantError);
    expect(() => createMeasurement(3, "   ")).toThrow(DomainInvariantError);
  });

  it("compares by value and unit", () => {
    expect(equalsMeasurement(createMeasurement(3, "mm"), createMeasurement(3, "mm"))).toBe(true);
    expect(equalsMeasurement(createMeasurement(3, "mm"), createMeasurement(3, "cm"))).toBe(false);
  });
});
