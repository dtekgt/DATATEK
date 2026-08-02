import { describe, it } from "node:test";
import { expect } from "expect";
import { createOdometerValue, odometerValueInKm, evaluateOdometerReading } from "./odometer.ts";
import { DomainInvariantError } from "./errors.ts";

describe("Odometer value object", () => {
  it("creates a valid km reading", () => {
    const v = createOdometerValue(84210, "km");
    expect(v.value).toBe(84210);
    expect(v.unit).toBe("km");
  });

  it("rejects negative and fractional values", () => {
    expect(() => createOdometerValue(-1, "km")).toThrow(DomainInvariantError);
    expect(() => createOdometerValue(10.5, "km")).toThrow(DomainInvariantError);
  });

  it("normalizes miles to km for comparison without discarding the original unit", () => {
    const miles = createOdometerValue(100, "mi");
    expect(odometerValueInKm(miles)).toBe(161);
    expect(miles.unit).toBe("mi");
  });

  it("accepts the first-ever reading unconditionally", () => {
    const result = evaluateOdometerReading(null, {
      valueKm: 1000,
      recordedAt: "2026-08-01T10:00:00.000Z",
    });
    expect(result.status).toBe("accepted");
    expect(result.reason).toBeNull();
  });

  it("accepts a plausible later, higher reading", () => {
    const result = evaluateOdometerReading(
      { valueKm: 50000, recordedAt: "2026-07-01T10:00:00.000Z" },
      { valueKm: 50500, recordedAt: "2026-07-15T10:00:00.000Z" },
    );
    expect(result.status).toBe("accepted");
  });

  it("flags a regression (odometer went down) as conflict, never overwriting", () => {
    const result = evaluateOdometerReading(
      { valueKm: 50000, recordedAt: "2026-07-01T10:00:00.000Z" },
      { valueKm: 40000, recordedAt: "2026-07-15T10:00:00.000Z" },
    );
    expect(result.status).toBe("conflict");
    expect(result.reason).toBe("regression");
  });

  it("flags an implausible jump as conflict", () => {
    const result = evaluateOdometerReading(
      { valueKm: 50000, recordedAt: "2026-07-01T10:00:00.000Z" },
      { valueKm: 500000, recordedAt: "2026-07-02T10:00:00.000Z" },
    );
    expect(result.status).toBe("conflict");
    expect(result.reason).toBe("implausible_jump");
  });

  it("flags a backdated reading with a higher value as an out-of-order conflict", () => {
    // A later-entered reading whose recordedAt precedes the last accepted
    // reading, but whose value is still higher, is not a regression — it is
    // a data-entry ordering problem that needs human review either way.
    const result = evaluateOdometerReading(
      { valueKm: 50000, recordedAt: "2026-07-15T10:00:00.000Z" },
      { valueKm: 51000, recordedAt: "2026-07-01T10:00:00.000Z" },
    );
    expect(result.status).toBe("conflict");
    expect(result.reason).toBe("out_of_order_reading");
  });

  it("rejects a negative next reading outright", () => {
    expect(() =>
      evaluateOdometerReading(null, { valueKm: -5, recordedAt: "2026-07-01T10:00:00.000Z" }),
    ).toThrow(DomainInvariantError);
  });
});
