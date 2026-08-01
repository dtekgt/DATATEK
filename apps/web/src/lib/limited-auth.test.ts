import { describe, it } from "node:test";
import { expect } from "expect";
import { resolveLimitedAuthState } from "./limited-auth";

describe("resolveLimitedAuthState", () => {
  it("maps known demo tokens to their mandated states", () => {
    expect(resolveLimitedAuthState("demo-token")).toBe("context");
    expect(resolveLimitedAuthState("demo-token-expired")).toBe("expired");
  });

  it("treats any unrecognized token as invalid — never echoes it back", () => {
    expect(resolveLimitedAuthState("anything-else")).toBe("invalid");
    expect(resolveLimitedAuthState("")).toBe("invalid");
  });
});
