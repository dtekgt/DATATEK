import { describe, it } from "node:test";
import { expect } from "expect";
import {
  resolveOrganizationCapabilities,
  resolvePlatformCapabilities,
  resolveActiveSupportAccessSession,
} from "@datatek/auth";
import {
  buildFixtureTenancySnapshot,
  FIXTURE_ACTOR_IDS,
  FIXTURE_ORGANIZATION_IDS,
} from "./tenancy";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("fixture tenancy graph — aislamiento DTEK / Taller Demo", () => {
  const snapshot = buildFixtureTenancySnapshot();

  it("owner DTEK resolves active membership with organization.manage inside DTEK", () => {
    const result = resolveOrganizationCapabilities(
      FIXTURE_ACTOR_IDS.ownerDtek,
      FIXTURE_ORGANIZATION_IDS.dtek,
      NOW,
      snapshot,
    );
    expect(result.membershipStatus).toBe("active");
    expect(result.permissions).toContain("organization.manage");
    expect(result.branchScope).toBe("all");
  });

  it("owner DTEK has no membership at all inside Taller Demo — a known UUID does not help", () => {
    const result = resolveOrganizationCapabilities(
      FIXTURE_ACTOR_IDS.ownerDtek,
      FIXTURE_ORGANIZATION_IDS.demo,
      NOW,
      snapshot,
    );
    expect(result.membershipStatus).toBe("missing");
    expect(result.permissions).toEqual([]);
  });

  it("owner Taller Demo has no membership inside DTEK", () => {
    const result = resolveOrganizationCapabilities(
      FIXTURE_ACTOR_IDS.ownerDemo,
      FIXTURE_ORGANIZATION_IDS.dtek,
      NOW,
      snapshot,
    );
    expect(result.membershipStatus).toBe("missing");
  });

  it("owner DTEK gains zero platform permissions from an organization role", () => {
    const platform = resolvePlatformCapabilities(FIXTURE_ACTOR_IDS.ownerDtek, NOW, snapshot);
    expect(platform.membershipStatus).toBe("missing");
    expect(platform.permissions).toEqual([]);
  });

  it("platform support has platform.control.enter but no permission inside any organization", () => {
    const platform = resolvePlatformCapabilities(FIXTURE_ACTOR_IDS.platformSupport, NOW, snapshot);
    expect(platform.permissions).toContain("platform.control.enter");

    const org = resolveOrganizationCapabilities(
      FIXTURE_ACTOR_IDS.platformSupport,
      FIXTURE_ORGANIZATION_IDS.dtek,
      NOW,
      snapshot,
    );
    expect(org.membershipStatus).toBe("missing");
  });

  it("platform support's seeded elevation covers DTEK but not Taller Demo", () => {
    const dtekSession = resolveActiveSupportAccessSession(
      "pmem-support",
      FIXTURE_ORGANIZATION_IDS.dtek,
      NOW,
      snapshot.supportAccessSessions,
    );
    expect(dtekSession?.id).toBe("sas-support-dtek");

    const demoSession = resolveActiveSupportAccessSession(
      "pmem-support",
      FIXTURE_ORGANIZATION_IDS.demo,
      NOW,
      snapshot.supportAccessSessions,
    );
    expect(demoSession).toBeNull();
  });

  it("advisor/inspector/mechanic/cashier are scoped to a single DTEK branch, not 'all'", () => {
    const advisor = resolveOrganizationCapabilities(
      FIXTURE_ACTOR_IDS.advisorDtek,
      FIXTURE_ORGANIZATION_IDS.dtek,
      NOW,
      snapshot,
    );
    expect(advisor.branchScope).not.toBe("all");
    expect(Array.isArray(advisor.branchScope) && advisor.branchScope.length).toBe(1);
  });
});
