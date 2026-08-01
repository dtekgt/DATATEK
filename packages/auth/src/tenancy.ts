// @datatek/auth — R0-C real tenancy/capability resolution.
//
// Every function here is pure: it takes explicit rows (membership, roles,
// branch scopes, elevation sessions) and a clock, and returns a decision.
// Nothing reads cookies, headers, `raw_user_meta_data`, or any other
// implicit signal — DATATEK_R0_C sección 2.1 forbids using editable
// metadata for authorization, and sección 5.1 forbids trusting
// `organization_id`/permissions from the browser.
//
// The same functions back both real Postgres rows (R0-C+ once Supabase is
// reachable) and the in-memory fixtures used by apps/web and apps/control
// in this sandbox (no Docker/Supabase runtime available here — see
// docs/runbooks/local-auth-seeds.md).

import type { OrganizationPermission, PlatformPermission } from "@datatek/domain";

export type MembershipStatus = "active" | "suspended" | "revoked";
export type SupportAccessScope = "read_only" | "read_write_support";
export type SupportAccessStatus = "pending" | "active" | "revoked" | "expired";

export interface UserProfileRow {
  userId: string;
  displayName: string;
  locale: string;
  status: "active" | "disabled";
}

export interface OrganizationMembershipRow {
  id: string;
  userId: string;
  organizationId: string;
  status: MembershipStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface MembershipRoleRow {
  membershipId: string;
  roleTemplateKey: string;
}

export interface RoleTemplatePermissionRow {
  roleTemplateKey: string;
  permission: OrganizationPermission;
}

/** A branch scope row. `branchId: "all"` is the only way to get every branch
 * — omitting rows never means universal access (sección 2.3). */
export interface MembershipBranchScopeRow {
  membershipId: string;
  branchId: string | "all";
}

export interface PlatformMembershipRow {
  id: string;
  userId: string;
  status: MembershipStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface PlatformMembershipRoleRow {
  platformMembershipId: string;
  platformRoleTemplateKey: string;
}

export interface PlatformRolePermissionRow {
  platformRoleTemplateKey: string;
  permission: PlatformPermission;
}

export interface SupportAccessSessionRow {
  id: string;
  platformMembershipId: string;
  organizationId: string;
  ticket: string;
  reason: string;
  scope: SupportAccessScope;
  status: SupportAccessStatus;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/** All the rows needed to resolve any actor's effective access. In R0-C this
 * is the exact shape a server component/loader reads from Postgres (via RLS)
 * or from a fixture; the resolver below never cares which. */
export interface TenancySnapshot {
  profiles: UserProfileRow[];
  memberships: OrganizationMembershipRow[];
  membershipRoles: MembershipRoleRow[];
  roleTemplatePermissions: RoleTemplatePermissionRow[];
  branchScopes: MembershipBranchScopeRow[];
  platformMemberships: PlatformMembershipRow[];
  platformMembershipRoles: PlatformMembershipRoleRow[];
  platformRolePermissions: PlatformRolePermissionRow[];
  supportAccessSessions: SupportAccessSessionRow[];
}

function isWithinWindow(from: string, until: string | null, now: Date): boolean {
  const fromDate = new Date(from);
  if (now.getTime() < fromDate.getTime()) return false;
  if (until === null) return true;
  return now.getTime() < new Date(until).getTime();
}

export interface OrganizationCapabilityResolution {
  membershipStatus: "missing" | "expired" | "suspended" | "revoked" | "active";
  membershipId: string | null;
  /** Union of every permission granted by every active role on the
   * membership (sección 4/10: "permisos aditivos"). Empty when there is no
   * active membership. */
  permissions: OrganizationPermission[];
  /** "all" when an explicit universal-scope row exists; otherwise the exact
   * set of branch IDs the membership can act on. Never inferred from an
   * absent row. */
  branchScope: "all" | string[];
}

/** Resolves an actor's capabilities inside one organization at instant
 * `now`. Membership out of its `effective_from`/`effective_until` window
 * does not grant anything (sección 2.2, sección 10 dominio). */
export function resolveOrganizationCapabilities(
  actorUserId: string,
  organizationId: string,
  now: Date,
  snapshot: Pick<
    TenancySnapshot,
    "memberships" | "membershipRoles" | "roleTemplatePermissions" | "branchScopes"
  >,
): OrganizationCapabilityResolution {
  const membership = snapshot.memberships.find(
    (m) => m.userId === actorUserId && m.organizationId === organizationId,
  );

  if (!membership) {
    return { membershipStatus: "missing", membershipId: null, permissions: [], branchScope: [] };
  }

  if (membership.status === "suspended") {
    return {
      membershipStatus: "suspended",
      membershipId: membership.id,
      permissions: [],
      branchScope: [],
    };
  }
  if (membership.status === "revoked") {
    return {
      membershipStatus: "revoked",
      membershipId: membership.id,
      permissions: [],
      branchScope: [],
    };
  }
  if (!isWithinWindow(membership.effectiveFrom, membership.effectiveUntil, now)) {
    return {
      membershipStatus: "expired",
      membershipId: membership.id,
      permissions: [],
      branchScope: [],
    };
  }

  const roleKeys = snapshot.membershipRoles
    .filter((r) => r.membershipId === membership.id)
    .map((r) => r.roleTemplateKey);

  const permissions = Array.from(
    new Set(
      snapshot.roleTemplatePermissions
        .filter((p) => roleKeys.includes(p.roleTemplateKey))
        .map((p) => p.permission),
    ),
  );

  const scopeRows = snapshot.branchScopes.filter((s) => s.membershipId === membership.id);
  const branchScope: "all" | string[] = scopeRows.some((s) => s.branchId === "all")
    ? "all"
    : scopeRows.map((s) => s.branchId);

  return { membershipStatus: "active", membershipId: membership.id, permissions, branchScope };
}

/** A branch is allowed only when scope is universal or explicitly lists it.
 * No branch requested + no universal scope never defaults to "any". */
export function isBranchAllowed(branchScope: "all" | string[], branchId: string | null): boolean {
  if (branchId === null) return true;
  if (branchScope === "all") return true;
  return branchScope.includes(branchId);
}

export interface PlatformCapabilityResolution {
  membershipStatus: "missing" | "expired" | "suspended" | "revoked" | "active";
  platformMembershipId: string | null;
  permissions: PlatformPermission[];
}

/** Platform capabilities are resolved completely independently of any
 * organization membership — an Owner in DTEK gains nothing here (sección
 * 2.4, sección 10 dominio: "owner no implica plataforma"). */
export function resolvePlatformCapabilities(
  actorUserId: string,
  now: Date,
  snapshot: Pick<
    TenancySnapshot,
    "platformMemberships" | "platformMembershipRoles" | "platformRolePermissions"
  >,
): PlatformCapabilityResolution {
  const membership = snapshot.platformMemberships.find((m) => m.userId === actorUserId);
  if (!membership) {
    return { membershipStatus: "missing", platformMembershipId: null, permissions: [] };
  }
  if (membership.status === "suspended") {
    return {
      membershipStatus: "suspended",
      platformMembershipId: membership.id,
      permissions: [],
    };
  }
  if (membership.status === "revoked") {
    return { membershipStatus: "revoked", platformMembershipId: membership.id, permissions: [] };
  }
  if (!isWithinWindow(membership.effectiveFrom, membership.effectiveUntil, now)) {
    return { membershipStatus: "expired", platformMembershipId: membership.id, permissions: [] };
  }

  const roleKeys = snapshot.platformMembershipRoles
    .filter((r) => r.platformMembershipId === membership.id)
    .map((r) => r.platformRoleTemplateKey);

  const permissions = Array.from(
    new Set(
      snapshot.platformRolePermissions
        .filter((p) => roleKeys.includes(p.platformRoleTemplateKey))
        .map((p) => p.permission),
    ),
  );

  return { membershipStatus: "active", platformMembershipId: membership.id, permissions };
}

/** Finds the active, non-expired, non-revoked elevation for a platform
 * membership on a target organization at instant `now` (sección 2.5). A
 * `status: "active"` row past its `expiresAt`, or with `revokedAt` set,
 * never counts as elevated (sección 10 dominio: "support session
 * expirada"). */
export function resolveActiveSupportAccessSession(
  platformMembershipId: string,
  organizationId: string,
  now: Date,
  sessions: SupportAccessSessionRow[],
): SupportAccessSessionRow | null {
  const candidate = sessions.find(
    (s) =>
      s.platformMembershipId === platformMembershipId &&
      s.organizationId === organizationId &&
      s.status === "active" &&
      s.revokedAt === null &&
      isWithinWindow(s.startsAt, s.expiresAt, now),
  );
  return candidate ?? null;
}

// ---------------------------------------------------------------------------
// AccessBoundary — the 8 states of DATATEK_R0_C sección 9. The component in
// @datatek/ui only renders whichever state this function returns; it never
// decides on its own ("el componente presenta; el servidor decide").
// ---------------------------------------------------------------------------

export type AccessBoundaryState =
  | { kind: "loading_session" }
  | { kind: "unauthenticated" }
  | { kind: "membership_missing" }
  | { kind: "membership_expired" }
  | { kind: "branch_denied"; branchId: string }
  | { kind: "capability_denied"; permission: string }
  | { kind: "elevation_required"; organizationId: string }
  | { kind: "allowed" };

export interface AccessBoundaryContext {
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
  /** Set when the surface requires an organization membership (Pro). Omit
   * for platform-only surfaces (Control without a target tenant). */
  organization?: {
    organizationId: string;
    resolution: OrganizationCapabilityResolution;
    requiredPermission?: OrganizationPermission;
    requiredBranchId?: string | null;
  };
  /** Set when the surface requires a platform membership (Control). */
  platform?: {
    resolution: PlatformCapabilityResolution;
    requiredPermission?: PlatformPermission;
    /** True when this request is trying to read/mutate tenant content and
     * therefore needs an active support access session (sección 2.5). */
    requiresElevationForOrganizationId?: string;
    activeSupportSession: SupportAccessSessionRow | null;
  };
}

export function resolveAccessBoundaryState(ctx: AccessBoundaryContext): AccessBoundaryState {
  if (ctx.sessionStatus === "loading") return { kind: "loading_session" };
  if (ctx.sessionStatus === "unauthenticated") return { kind: "unauthenticated" };

  if (ctx.organization) {
    const { resolution, requiredPermission, requiredBranchId } = ctx.organization;
    if (resolution.membershipStatus === "missing") return { kind: "membership_missing" };
    if (
      resolution.membershipStatus === "expired" ||
      resolution.membershipStatus === "suspended" ||
      resolution.membershipStatus === "revoked"
    ) {
      return { kind: "membership_expired" };
    }
    if (requiredBranchId != null && !isBranchAllowed(resolution.branchScope, requiredBranchId)) {
      return { kind: "branch_denied", branchId: requiredBranchId };
    }
    if (requiredPermission && !resolution.permissions.includes(requiredPermission)) {
      return { kind: "capability_denied", permission: requiredPermission };
    }
  }

  if (ctx.platform) {
    const {
      resolution,
      requiredPermission,
      requiresElevationForOrganizationId,
      activeSupportSession,
    } = ctx.platform;
    if (resolution.membershipStatus === "missing") return { kind: "membership_missing" };
    if (
      resolution.membershipStatus === "expired" ||
      resolution.membershipStatus === "suspended" ||
      resolution.membershipStatus === "revoked"
    ) {
      return { kind: "membership_expired" };
    }
    if (requiredPermission && !resolution.permissions.includes(requiredPermission)) {
      return { kind: "capability_denied", permission: requiredPermission };
    }
    if (requiresElevationForOrganizationId) {
      if (
        !activeSupportSession ||
        activeSupportSession.organizationId !== requiresElevationForOrganizationId
      ) {
        return { kind: "elevation_required", organizationId: requiresElevationForOrganizationId };
      }
    }
  }

  return { kind: "allowed" };
}

/** Section 5.2 step 3 — a slug/UUID for an organization the actor cannot
 * read must never confirm existence. Both "does not exist" and "exists but
 * you cannot see it" collapse into the same stable, neutral response
 * (sección 7). */
export interface NeutralResourceError {
  code: "RESOURCE_NOT_AVAILABLE";
  message: string;
  requestId: string;
}

export function neutralResourceNotAvailable(requestId: string): NeutralResourceError {
  return {
    code: "RESOURCE_NOT_AVAILABLE",
    message: "El recurso no está disponible para esta sesión.",
    requestId,
  };
}
