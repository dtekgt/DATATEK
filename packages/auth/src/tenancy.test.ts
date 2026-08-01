import { describe, it } from "node:test";
import { expect } from "expect";
import {
  resolveOrganizationCapabilities,
  resolvePlatformCapabilities,
  resolveActiveSupportAccessSession,
  resolveAccessBoundaryState,
  isBranchAllowed,
  neutralResourceNotAvailable,
  type TenancySnapshot,
} from "./tenancy";

const NOW = new Date("2026-08-01T12:00:00.000Z");

function baseSnapshot(overrides: Partial<TenancySnapshot> = {}): TenancySnapshot {
  return {
    profiles: [],
    memberships: [],
    membershipRoles: [],
    roleTemplatePermissions: [],
    branchScopes: [],
    platformMemberships: [],
    platformMembershipRoles: [],
    platformRolePermissions: [],
    supportAccessSessions: [],
    ...overrides,
  };
}

describe("resolveOrganizationCapabilities — permisos aditivos", () => {
  it("unions permissions granted by multiple active roles on one membership", () => {
    const snapshot = baseSnapshot({
      memberships: [
        {
          id: "m1",
          userId: "u1",
          organizationId: "org-dtek",
          status: "active",
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveUntil: null,
        },
      ],
      membershipRoles: [
        { membershipId: "m1", roleTemplateKey: "advisor" },
        { membershipId: "m1", roleTemplateKey: "cashier" },
      ],
      roleTemplatePermissions: [
        { roleTemplateKey: "advisor", permission: "crm.read" },
        { roleTemplateKey: "advisor", permission: "quote.read" },
        { roleTemplateKey: "cashier", permission: "finance.read" },
      ],
    });

    const result = resolveOrganizationCapabilities("u1", "org-dtek", NOW, snapshot);
    expect(result.membershipStatus).toBe("active");
    expect(result.permissions.sort()).toEqual(["crm.read", "finance.read", "quote.read"].sort());
  });
});

describe("resolveOrganizationCapabilities — vigencia", () => {
  const membershipBase = {
    id: "m1",
    userId: "u1",
    organizationId: "org-dtek",
    status: "active" as const,
  };

  it("does not grant anything when now is before effective_from", () => {
    const snapshot = baseSnapshot({
      memberships: [
        { ...membershipBase, effectiveFrom: "2027-01-01T00:00:00.000Z", effectiveUntil: null },
      ],
      membershipRoles: [{ membershipId: "m1", roleTemplateKey: "owner" }],
      roleTemplatePermissions: [{ roleTemplateKey: "owner", permission: "organization.manage" }],
    });
    const result = resolveOrganizationCapabilities("u1", "org-dtek", NOW, snapshot);
    expect(result.membershipStatus).toBe("expired");
    expect(result.permissions).toEqual([]);
  });

  it("does not grant anything after effective_until", () => {
    const snapshot = baseSnapshot({
      memberships: [
        {
          ...membershipBase,
          effectiveFrom: "2025-01-01T00:00:00.000Z",
          effectiveUntil: "2026-01-01T00:00:00.000Z",
        },
      ],
      membershipRoles: [{ membershipId: "m1", roleTemplateKey: "owner" }],
      roleTemplatePermissions: [{ roleTemplateKey: "owner", permission: "organization.manage" }],
    });
    const result = resolveOrganizationCapabilities("u1", "org-dtek", NOW, snapshot);
    expect(result.membershipStatus).toBe("expired");
    expect(result.permissions).toEqual([]);
  });

  it("suspended or revoked memberships grant nothing even while inside the window", () => {
    const snapshot = baseSnapshot({
      memberships: [
        {
          ...membershipBase,
          status: "revoked",
          effectiveFrom: "2025-01-01T00:00:00.000Z",
          effectiveUntil: null,
        },
      ],
      membershipRoles: [{ membershipId: "m1", roleTemplateKey: "owner" }],
      roleTemplatePermissions: [{ roleTemplateKey: "owner", permission: "organization.manage" }],
    });
    const result = resolveOrganizationCapabilities("u1", "org-dtek", NOW, snapshot);
    expect(result.membershipStatus).toBe("revoked");
    expect(result.permissions).toEqual([]);
  });

  it("no membership row at all resolves to missing, not a default org", () => {
    const result = resolveOrganizationCapabilities("u1", "org-dtek", NOW, baseSnapshot());
    expect(result.membershipStatus).toBe("missing");
  });
});

describe("branch scope", () => {
  it("no scope rows never defaults to universal access", () => {
    expect(isBranchAllowed([], "branch-norte")).toBe(false);
  });

  it("an explicit 'all' scope row grants every branch", () => {
    expect(isBranchAllowed("all", "branch-norte")).toBe(true);
  });

  it("an explicit branch list only grants the listed branches", () => {
    expect(isBranchAllowed(["branch-central"], "branch-central")).toBe(true);
    expect(isBranchAllowed(["branch-central"], "branch-norte")).toBe(false);
  });

  it("no branch requested is allowed regardless of scope (branch-agnostic reads)", () => {
    expect(isBranchAllowed([], null)).toBe(true);
  });
});

describe("platform roles separados — owner no implica plataforma", () => {
  it("an organization owner role grants zero platform permissions", () => {
    const snapshot = baseSnapshot({
      memberships: [
        {
          id: "m1",
          userId: "u1",
          organizationId: "org-dtek",
          status: "active",
          effectiveFrom: "2025-01-01T00:00:00.000Z",
          effectiveUntil: null,
        },
      ],
      membershipRoles: [{ membershipId: "m1", roleTemplateKey: "owner" }],
      roleTemplatePermissions: [{ roleTemplateKey: "owner", permission: "organization.manage" }],
    });
    const platformResult = resolvePlatformCapabilities("u1", NOW, snapshot);
    expect(platformResult.membershipStatus).toBe("missing");
    expect(platformResult.permissions).toEqual([]);
  });

  it("a platform membership grants nothing inside any organization", () => {
    const snapshot = baseSnapshot({
      platformMemberships: [
        {
          id: "p1",
          userId: "u2",
          status: "active",
          effectiveFrom: "2025-01-01T00:00:00.000Z",
          effectiveUntil: null,
        },
      ],
      platformMembershipRoles: [
        { platformMembershipId: "p1", platformRoleTemplateKey: "platform_admin" },
      ],
      platformRolePermissions: [
        { platformRoleTemplateKey: "platform_admin", permission: "platform.organization.manage" },
      ],
    });
    const orgResult = resolveOrganizationCapabilities("u2", "org-dtek", NOW, snapshot);
    expect(orgResult.membershipStatus).toBe("missing");
    expect(orgResult.permissions).toEqual([]);
  });
});

describe("support access session — expiración", () => {
  const platformMembershipId = "p1";
  const organizationId = "org-dtek";

  it("an active session inside its window resolves", () => {
    const session = {
      id: "s1",
      platformMembershipId,
      organizationId,
      ticket: "TCK-1",
      reason: "Investigar folio 4021",
      scope: "read_only" as const,
      status: "active" as const,
      startsAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-08-01T23:59:59.000Z",
      revokedAt: null,
    };
    const found = resolveActiveSupportAccessSession(platformMembershipId, organizationId, NOW, [
      session,
    ]);
    expect(found?.id).toBe("s1");
  });

  it("a session past expires_at no longer works", () => {
    const session = {
      id: "s2",
      platformMembershipId,
      organizationId,
      ticket: "TCK-2",
      reason: "Investigar folio 4021",
      scope: "read_only" as const,
      status: "active" as const,
      startsAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-02T00:00:00.000Z",
      revokedAt: null,
    };
    const found = resolveActiveSupportAccessSession(platformMembershipId, organizationId, NOW, [
      session,
    ]);
    expect(found).toBeNull();
  });

  it("a revoked session no longer works even inside its window", () => {
    const session = {
      id: "s3",
      platformMembershipId,
      organizationId,
      ticket: "TCK-3",
      reason: "Investigar folio 4021",
      scope: "read_only" as const,
      status: "revoked" as const,
      startsAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-08-02T00:00:00.000Z",
      revokedAt: "2026-08-01T06:00:00.000Z",
    };
    const found = resolveActiveSupportAccessSession(platformMembershipId, organizationId, NOW, [
      session,
    ]);
    expect(found).toBeNull();
  });

  it("a session scoped to a different organization is not returned", () => {
    const session = {
      id: "s4",
      platformMembershipId,
      organizationId: "org-taller-demo",
      ticket: "TCK-4",
      reason: "otro tenant",
      scope: "read_only" as const,
      status: "active" as const,
      startsAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-08-02T00:00:00.000Z",
      revokedAt: null,
    };
    const found = resolveActiveSupportAccessSession(platformMembershipId, organizationId, NOW, [
      session,
    ]);
    expect(found).toBeNull();
  });
});

describe("resolveAccessBoundaryState — 8 estados", () => {
  it("loading_session wins over everything else", () => {
    expect(resolveAccessBoundaryState({ sessionStatus: "loading" })).toEqual({
      kind: "loading_session",
    });
  });

  it("unauthenticated when there is no session", () => {
    expect(resolveAccessBoundaryState({ sessionStatus: "unauthenticated" })).toEqual({
      kind: "unauthenticated",
    });
  });

  it("membership_missing when the org check finds no membership row", () => {
    const state = resolveAccessBoundaryState({
      sessionStatus: "authenticated",
      organization: {
        organizationId: "org-taller-demo",
        resolution: {
          membershipStatus: "missing",
          membershipId: null,
          permissions: [],
          branchScope: [],
        },
      },
    });
    expect(state).toEqual({ kind: "membership_missing" });
  });

  it("membership_expired when the membership is out of its window", () => {
    const state = resolveAccessBoundaryState({
      sessionStatus: "authenticated",
      organization: {
        organizationId: "org-dtek",
        resolution: {
          membershipStatus: "expired",
          membershipId: "m1",
          permissions: [],
          branchScope: [],
        },
      },
    });
    expect(state).toEqual({ kind: "membership_expired" });
  });

  it("branch_denied when the required branch is outside the scope", () => {
    const state = resolveAccessBoundaryState({
      sessionStatus: "authenticated",
      organization: {
        organizationId: "org-dtek",
        resolution: {
          membershipStatus: "active",
          membershipId: "m1",
          permissions: ["organization.read"],
          branchScope: ["branch-central"],
        },
        requiredBranchId: "branch-norte",
      },
    });
    expect(state).toEqual({ kind: "branch_denied", branchId: "branch-norte" });
  });

  it("capability_denied when the permission is missing", () => {
    const state = resolveAccessBoundaryState({
      sessionStatus: "authenticated",
      organization: {
        organizationId: "org-dtek",
        resolution: {
          membershipStatus: "active",
          membershipId: "m1",
          permissions: ["organization.read"],
          branchScope: "all",
        },
        requiredPermission: "membership.manage",
      },
    });
    expect(state).toEqual({ kind: "capability_denied", permission: "membership.manage" });
  });

  it("elevation_required when Control targets a tenant without an active support session", () => {
    const state = resolveAccessBoundaryState({
      sessionStatus: "authenticated",
      platform: {
        resolution: {
          membershipStatus: "active",
          platformMembershipId: "p1",
          permissions: ["platform.control.enter"],
        },
        requiresElevationForOrganizationId: "org-dtek",
        activeSupportSession: null,
      },
    });
    expect(state).toEqual({ kind: "elevation_required", organizationId: "org-dtek" });
  });

  it("allowed when every gate passes", () => {
    const state = resolveAccessBoundaryState({
      sessionStatus: "authenticated",
      organization: {
        organizationId: "org-dtek",
        resolution: {
          membershipStatus: "active",
          membershipId: "m1",
          permissions: ["organization.read"],
          branchScope: "all",
        },
        requiredPermission: "organization.read",
        requiredBranchId: "branch-central",
      },
    });
    expect(state).toEqual({ kind: "allowed" });
  });
});

describe("neutralResourceNotAvailable", () => {
  it("returns the exact stable shape from sección 7, never confirming existence", () => {
    const error = neutralResourceNotAvailable("req-123");
    expect(error).toEqual({
      code: "RESOURCE_NOT_AVAILABLE",
      message: "El recurso no está disponible para esta sesión.",
      requestId: "req-123",
    });
  });
});
