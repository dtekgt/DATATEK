import { describe, it } from "node:test";
import { expect } from "expect";
import { buildFixtureCapabilities, hasPermission, isFeatureEnabled } from "./index";

describe("buildFixtureCapabilities", () => {
  it("defaults to a non-elevated fixture session", () => {
    const caps = buildFixtureCapabilities();
    expect(caps.elevated).toBe(false);
    expect(caps.platformRole).toBe("none");
  });

  it("never infers permissions from anything implicit — only from the explicit fixture", () => {
    const caps = buildFixtureCapabilities({ permissions: ["pro.dashboard.read"] });
    expect(hasPermission(caps, "pro.dashboard.read")).toBe(true);
    expect(hasPermission(caps, "control.audit.read")).toBe(false);
  });
});

describe("hasPermission", () => {
  it("treats a null permission requirement as always allowed", () => {
    const caps = buildFixtureCapabilities({ permissions: [] });
    expect(hasPermission(caps, null)).toBe(true);
  });
});

describe("isFeatureEnabled", () => {
  it("treats a null feature flag as always enabled", () => {
    expect(isFeatureEnabled([], null)).toBe(true);
  });

  it("requires an explicit enabled flag entry", () => {
    expect(isFeatureEnabled([{ key: "pro_inbox", enabled: false }], "pro_inbox")).toBe(false);
    expect(isFeatureEnabled([{ key: "pro_inbox", enabled: true }], "pro_inbox")).toBe(true);
  });
});
