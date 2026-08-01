import { describe, it } from "node:test";
import { expect } from "expect";
import { ROLE_FIXTURES, expectDemoMarker } from "./index";

describe("ROLE_FIXTURES", () => {
  it("declares a fixture for every actor role including guest", () => {
    expect(Object.keys(ROLE_FIXTURES).sort()).toEqual(
      ["conductor", "control", "guest", "proveedor", "taller"].sort(),
    );
  });
});

describe("expectDemoMarker", () => {
  it("does not throw for a properly marked fixture", () => {
    expect(() => expectDemoMarker({ demo: true })).not.toThrow();
  });
});
