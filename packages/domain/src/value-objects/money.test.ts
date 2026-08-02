import { describe, it } from "node:test";
import { expect } from "expect";
import {
  createMoney,
  zeroMoney,
  addMoney,
  subtractMoney,
  isZeroMoney,
  equalsMoney,
  compareMoney,
  formatMoney,
} from "./money.ts";
import { DomainInvariantError } from "./errors.ts";

describe("Money value object", () => {
  it("creates a valid amount in minor units", () => {
    const m = createMoney(15000, "GTQ");
    expect(m.amountMinor).toBe(15000);
    expect(m.currency).toBe("GTQ");
  });

  it("rejects a negative amount", () => {
    expect(() => createMoney(-1, "GTQ")).toThrow(DomainInvariantError);
  });

  it("rejects a non-integer amount (never float)", () => {
    expect(() => createMoney(10.5, "GTQ")).toThrow(DomainInvariantError);
  });

  it("rejects a malformed currency code", () => {
    expect(() => createMoney(100, "gtq")).toThrow(DomainInvariantError);
    expect(() => createMoney(100, "GT")).toThrow(DomainInvariantError);
  });

  it("adds two amounts of the same currency", () => {
    const total = addMoney(createMoney(1000, "GTQ"), createMoney(250, "GTQ"));
    expect(total.amountMinor).toBe(1250);
  });

  it("refuses to add across currencies", () => {
    expect(() => addMoney(createMoney(100, "GTQ"), createMoney(100, "USD"))).toThrow(
      DomainInvariantError,
    );
  });

  it("subtracts without going negative", () => {
    const result = subtractMoney(createMoney(500, "GTQ"), createMoney(200, "GTQ"));
    expect(result.amountMinor).toBe(300);
    expect(() => subtractMoney(createMoney(100, "GTQ"), createMoney(200, "GTQ"))).toThrow(
      DomainInvariantError,
    );
  });

  it("compares and checks equality", () => {
    expect(isZeroMoney(zeroMoney("GTQ"))).toBe(true);
    expect(equalsMoney(createMoney(100, "GTQ"), createMoney(100, "GTQ"))).toBe(true);
    expect(equalsMoney(createMoney(100, "GTQ"), createMoney(100, "USD"))).toBe(false);
    expect(compareMoney(createMoney(100, "GTQ"), createMoney(200, "GTQ"))).toBe(-1);
    expect(compareMoney(createMoney(200, "GTQ"), createMoney(100, "GTQ"))).toBe(1);
    expect(compareMoney(createMoney(100, "GTQ"), createMoney(100, "GTQ"))).toBe(0);
  });

  it("formats for presentation only", () => {
    const text = formatMoney(createMoney(150075, "GTQ"), "es-GT");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});
