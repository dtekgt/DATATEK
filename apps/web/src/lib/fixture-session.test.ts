import { describe, it } from "node:test";
import { expect } from "expect";
import { resolveWebSession } from "./fixture-session";
import { FIXTURE_ACTOR_IDS } from "@datatek/application";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("resolveWebSession", () => {
  it("returns unauthenticated when there is no actor cookie", () => {
    const session = resolveWebSession(null, "dtek-servicios", undefined, NOW);
    expect(session.accessState).toEqual({ kind: "unauthenticated" });
    expect(session.availableOrganizations).toEqual([]);
  });

  it("owner DTEK sees normal (allowed) content inside dtek-servicios", () => {
    const session = resolveWebSession(
      FIXTURE_ACTOR_IDS.ownerDtek,
      "dtek-servicios",
      "organization.read",
      NOW,
    );
    expect(session.accessState).toEqual({ kind: "allowed" });
    expect(session.organizationSlug).toBe("dtek-servicios");
    expect(session.branchScope).toBe("all");
  });

  it("owner DTEK gets membership_missing when trying taller-demo — isolation holds even with the exact slug", () => {
    const session = resolveWebSession(
      FIXTURE_ACTOR_IDS.ownerDtek,
      "taller-demo",
      "organization.read",
      NOW,
    );
    expect(session.accessState).toEqual({ kind: "membership_missing" });
    expect(session.permissions).toEqual([]);
  });

  it("only lists organizations the actor actually has an active membership in", () => {
    const session = resolveWebSession(
      FIXTURE_ACTOR_IDS.ownerDtek,
      "dtek-servicios",
      undefined,
      NOW,
    );
    const slugs = session.availableOrganizations.map((o) => o.slug);
    expect(slugs).toEqual(["dtek-servicios"]);
  });

  it("denies a required permission the mechanic role does not have", () => {
    const session = resolveWebSession(
      FIXTURE_ACTOR_IDS.mechanicDtek,
      "dtek-servicios",
      "membership.manage",
      NOW,
    );
    expect(session.accessState).toEqual({
      kind: "capability_denied",
      permission: "membership.manage",
    });
  });
});
