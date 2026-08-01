import {
  resolveOrganizationCapabilities,
  resolveAccessBoundaryState,
  type AccessBoundaryState,
  type OrganizationCapabilityResolution,
} from "@datatek/auth";
import type { OrganizationPermission } from "@datatek/domain";
import {
  buildFixtureTenancySnapshot,
  FIXTURE_ORGANIZATIONS,
  FIXTURE_BRANCHES,
  FIXTURE_ACTOR_IDS,
  FIXTURE_PROFILES,
} from "@datatek/application";

// R0-C fixture identity — Supabase Auth local is written and seed-ready
// (see supabase/seeds/local_actors.sql and
// docs/runbooks/local-auth-seeds.md) but this sandbox has no Docker
// runtime, so it cannot issue real sessions here. This module resolves the
// exact same `AccessBoundaryState`/`OrganizationCapabilityResolution`
// shapes a real Supabase session would produce, from a cookie-selected
// fixture actor instead of a JWT. Swapping the cookie read below for a real
// `supabase.auth.getUser()` call is the only change R0-D needs — every
// downstream consumer (ProShell, AccessBoundary, page loaders) is already
// wired to these types.

export const SESSION_COOKIE_NAME = "dtek_actor";
export const DEFAULT_FIXTURE_ACTOR_ID = FIXTURE_ACTOR_IDS.ownerDtek;

export const FIXTURE_ACTOR_OPTIONS = FIXTURE_PROFILES.filter(
  (p) => !p.userId.startsWith("u-platform-"),
).map((p) => ({ id: p.userId, label: p.displayName }));

export { FIXTURE_ORGANIZATIONS, FIXTURE_BRANCHES };

const TENANCY_SNAPSHOT = buildFixtureTenancySnapshot();

export interface WebSessionResolution {
  actorId: string | null;
  actorDisplayName: string;
  organizationId: string | null;
  organizationSlug: string | null;
  /** Every organization this actor currently has an active membership in —
   * feeds OrganizationSwitcher. Never the full fixture org list. */
  availableOrganizations: { id: string; slug: string; label: string; meta: string }[];
  branchScope: OrganizationCapabilityResolution["branchScope"];
  availableBranches: { id: string; label: string }[];
  permissions: OrganizationPermission[];
  accessState: AccessBoundaryState;
}

/** Pure resolver — no cookies, no Next.js. Unit-testable in isolation and
 * reused by the (thin) cookie-reading wrapper below. */
export function resolveWebSession(
  actorId: string | null,
  orgSlug: string,
  requiredPermission: OrganizationPermission | undefined,
  now: Date = new Date(),
): WebSessionResolution {
  const org = FIXTURE_ORGANIZATIONS.find((o) => o.slug === orgSlug) ?? null;

  const availableOrganizations = actorId
    ? FIXTURE_ORGANIZATIONS.filter(
        (o) =>
          resolveOrganizationCapabilities(actorId, o.id, now, TENANCY_SNAPSHOT).membershipStatus ===
          "active",
      )
    : [];

  const actorProfile = FIXTURE_PROFILES.find((p) => p.userId === actorId);

  if (!actorId || !org) {
    const accessState = resolveAccessBoundaryState({
      sessionStatus: actorId ? "authenticated" : "unauthenticated",
      ...(actorId && org === null
        ? {
            organization: {
              organizationId: orgSlug,
              resolution: {
                membershipStatus: "missing",
                membershipId: null,
                permissions: [],
                branchScope: [],
              },
            },
          }
        : {}),
    });
    return {
      actorId,
      actorDisplayName: actorProfile?.displayName ?? "Invitado",
      organizationId: null,
      organizationSlug: null,
      availableOrganizations,
      branchScope: [],
      availableBranches: [],
      permissions: [],
      accessState,
    };
  }

  const resolution = resolveOrganizationCapabilities(actorId, org.id, now, TENANCY_SNAPSHOT);
  const accessState = resolveAccessBoundaryState({
    sessionStatus: "authenticated",
    organization: {
      organizationId: org.id,
      resolution,
      requiredPermission,
    },
  });

  return {
    actorId,
    actorDisplayName: actorProfile?.displayName ?? actorId,
    organizationId: org.id,
    organizationSlug: org.slug,
    availableOrganizations,
    branchScope: resolution.branchScope,
    availableBranches: FIXTURE_BRANCHES[org.id] ?? [],
    permissions: resolution.permissions,
    accessState,
  };
}

/** Server-only: reads the fixture actor cookie. Never falls back to a query
 * string or header — the only implicit signal this sandbox allows itself is
 * an httpOnly cookie set by the fixture `/login` form. */
export async function getWebSession(
  orgSlug: string,
  requiredPermission?: OrganizationPermission,
): Promise<WebSessionResolution> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const actorId = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  return resolveWebSession(actorId, orgSlug, requiredPermission);
}
