import { describe, it } from "node:test";
import { expect } from "expect";
import { resolveControlSession, resolveControlTenantAccess } from "./fixture-session";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "@datatek/application";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("resolveControlSession", () => {
  it("unauthenticated with no actor cookie", () => {
    const session = resolveControlSession(null, undefined, NOW);
    expect(session.accessState).toEqual({ kind: "unauthenticated" });
  });

  it("an organization owner (not a platform actor) is membership_missing in Control", () => {
    const session = resolveControlSession(
      FIXTURE_ACTOR_IDS.ownerDtek,
      "platform.control.enter",
      NOW,
    );
    expect(session.accessState).toEqual({ kind: "membership_missing" });
  });

  it("platform support enters Control", () => {
    const session = resolveControlSession(
      FIXTURE_ACTOR_IDS.platformSupport,
      "platform.control.enter",
      NOW,
    );
    expect(session.accessState).toEqual({ kind: "allowed" });
  });
});

describe("resolveControlTenantAccess", () => {
  it("platform support without elevation cannot open Taller Demo", () => {
    const access = resolveControlTenantAccess(
      FIXTURE_ACTOR_IDS.platformSupport,
      FIXTURE_ORGANIZATION_IDS.demo,
      NOW,
    );
    expect(access.accessState.kind).toBe("elevation_required");
    expect(access.activeSupportSession).toBeNull();
  });

  it("platform support with the seeded elevation opens DTEK only", () => {
    const dtek = resolveControlTenantAccess(
      FIXTURE_ACTOR_IDS.platformSupport,
      FIXTURE_ORGANIZATION_IDS.dtek,
      NOW,
    );
    expect(dtek.accessState).toEqual({ kind: "allowed" });
    expect(dtek.activeSupportSession?.ticket).toBe("TCK-1042");
  });

  it("platform admin without an elevation session cannot open any tenant either", () => {
    const access = resolveControlTenantAccess(
      FIXTURE_ACTOR_IDS.platformAdmin,
      FIXTURE_ORGANIZATION_IDS.dtek,
      NOW,
    );
    expect(access.accessState.kind).toBe("elevation_required");
  });
});
