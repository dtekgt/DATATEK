import { describe, it } from "node:test";
import { expect } from "expect";
import { SERVICE_PRICE_MODES } from "@datatek/domain";
import { FIXTURE_PRICE_MODALITIES } from "./pricing";
import { FIXTURE_DECISIONS_FOUR } from "./decisions";
import { FIXTURE_VEHICLE_NOW, FIXTURE_MAINTENANCE } from "./vehicles";
import { MAINTENANCE_TRIGGER_KINDS } from "@datatek/domain";

describe("R0-B mandated fixtures", () => {
  it("demonstrates all five service price modes", () => {
    const modes = Object.values(FIXTURE_PRICE_MODALITIES).map((m) => m.mode);
    for (const mode of SERVICE_PRICE_MODES) {
      expect(modes).toContain(mode);
    }
  });

  it("provides four immediate decisions so the UI can prove the max-3 cap", () => {
    expect(FIXTURE_DECISIONS_FOUR).toHaveLength(4);
  });

  it("covers vehicle now statuses attention, unknown and stale", () => {
    const statuses = Object.values(FIXTURE_VEHICLE_NOW).map((f) => f.status);
    expect(statuses).toContain("attention");
    expect(statuses).toContain("unknown");
    expect(statuses).toContain("stale");
  });

  it("covers all four maintenance trigger kinds", () => {
    const triggers = FIXTURE_MAINTENANCE.map((m) => m.trigger);
    for (const kind of MAINTENANCE_TRIGGER_KINDS) {
      expect(triggers).toContain(kind);
    }
  });
});
