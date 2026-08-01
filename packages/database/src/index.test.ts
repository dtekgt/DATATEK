import { describe, it } from "node:test";
import { expect } from "expect";
import { notImplementedPort, DATABASE_PORTS_STATUS } from "./index";

describe("notImplementedPort", () => {
  it("throws loudly instead of returning fabricated data", () => {
    expect(() => notImplementedPort("vehicles.findById")).toThrow(/vehicles\.findById/);
  });
});

describe("DATABASE_PORTS_STATUS", () => {
  it("declares this package as placeholder-only in R0-B", () => {
    expect(DATABASE_PORTS_STATUS).toBe("placeholder");
  });
});
