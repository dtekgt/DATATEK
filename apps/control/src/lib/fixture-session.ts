import {
  resolvePlatformCapabilities,
  resolveActiveSupportAccessSession,
  resolveAccessBoundaryState,
  type AccessBoundaryState,
  type SupportAccessSessionRow,
} from "@datatek/auth";
import type { PlatformPermission } from "@datatek/domain";
import {
  buildFixtureTenancySnapshot,
  FIXTURE_ORGANIZATIONS,
  FIXTURE_PROFILES,
} from "@datatek/application";

// R0-C fixture identity for Control. Deliberately a SEPARATE cookie from
// apps/web's `dtek_actor` — Control and public/Pro never share a session
// cookie (sección 5.4, ADR 0004). Real Supabase Auth ships once Docker is
// reachable in a non-sandboxed environment; see
// docs/runbooks/local-auth-seeds.md.
export const CONTROL_SESSION_COOKIE_NAME = "dtek_control_actor";

export const FIXTURE_PLATFORM_ACTOR_OPTIONS = FIXTURE_PROFILES.filter((p) =>
  p.userId.startsWith("u-platform-"),
).map((p) => ({ id: p.userId, label: p.displayName }));

export { FIXTURE_ORGANIZATIONS };

const TENANCY_SNAPSHOT = buildFixtureTenancySnapshot();

export interface ControlSessionResolution {
  actorId: string | null;
  actorDisplayName: string;
  permissions: PlatformPermission[];
  platformMembershipId: string | null;
  accessState: AccessBoundaryState;
}

export interface ControlTenantAccess {
  accessState: AccessBoundaryState;
  activeSupportSession: SupportAccessSessionRow | null;
}

/** Pure resolver — no cookies. Unit-testable without Next.js. */
export function resolveControlSession(
  actorId: string | null,
  requiredPermission: PlatformPermission | undefined,
  now: Date = new Date(),
): ControlSessionResolution {
  const actorProfile = FIXTURE_PROFILES.find((p) => p.userId === actorId);
  const resolution = actorId
    ? resolvePlatformCapabilities(actorId, now, TENANCY_SNAPSHOT)
    : { membershipStatus: "missing" as const, platformMembershipId: null, permissions: [] };

  const accessState = resolveAccessBoundaryState({
    sessionStatus: actorId ? "authenticated" : "unauthenticated",
    platform: {
      resolution,
      requiredPermission,
      activeSupportSession: null,
    },
  });

  return {
    actorId,
    actorDisplayName: actorProfile?.displayName ?? "Invitado",
    permissions: resolution.permissions,
    platformMembershipId: resolution.platformMembershipId,
    accessState,
  };
}

/** Resolves whether the current platform actor may read a specific tenant
 * right now — requires an active, non-expired, non-revoked support access
 * session scoped to that organization (sección 2.5). */
export function resolveControlTenantAccess(
  actorId: string | null,
  organizationId: string,
  now: Date = new Date(),
): ControlTenantAccess {
  const resolution = actorId
    ? resolvePlatformCapabilities(actorId, now, TENANCY_SNAPSHOT)
    : { membershipStatus: "missing" as const, platformMembershipId: null, permissions: [] };

  const activeSupportSession = resolution.platformMembershipId
    ? resolveActiveSupportAccessSession(
        resolution.platformMembershipId,
        organizationId,
        now,
        TENANCY_SNAPSHOT.supportAccessSessions,
      )
    : null;

  const accessState = resolveAccessBoundaryState({
    sessionStatus: actorId ? "authenticated" : "unauthenticated",
    platform: {
      resolution,
      // "platform.access.use" is what an elevated actor exercises to read a
      // tenant — "platform.support.manage" is a separate, higher permission
      // for administering support sessions themselves (only platform_admin
      // has it). Requiring the wrong one here would make platform_support
      // fail on capability_denied before ever reaching the elevation check.
      requiredPermission: "platform.access.use",
      requiresElevationForOrganizationId: organizationId,
      activeSupportSession,
    },
  });

  return { accessState, activeSupportSession };
}

/** Server-only: reads the Control fixture actor cookie. */
export async function getControlSession(
  requiredPermission?: PlatformPermission,
): Promise<ControlSessionResolution> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const actorId = store.get(CONTROL_SESSION_COOKIE_NAME)?.value ?? null;
  return resolveControlSession(actorId, requiredPermission);
}

export async function getControlTenantAccess(organizationId: string): Promise<ControlTenantAccess> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const actorId = store.get(CONTROL_SESSION_COOKIE_NAME)?.value ?? null;
  return resolveControlTenantAccess(actorId, organizationId);
}

export interface ActiveElevationBanner {
  organizationLabel: string;
  ticket: string;
  reason: string;
  expiresAt: string;
}

/** Persistent banner data (sección 5.4: "banner persistente"). Looks across
 * every organization for the actor's first currently-active support
 * session, so the banner surfaces regardless of which Control page is
 * open. */
export function resolveActiveElevationBanner(
  actorId: string | null,
  now: Date = new Date(),
): ActiveElevationBanner | null {
  if (!actorId) return null;
  const platform = resolvePlatformCapabilities(actorId, now, TENANCY_SNAPSHOT);
  if (!platform.platformMembershipId) return null;

  for (const org of FIXTURE_ORGANIZATIONS) {
    const session = resolveActiveSupportAccessSession(
      platform.platformMembershipId,
      org.id,
      now,
      TENANCY_SNAPSHOT.supportAccessSessions,
    );
    if (session) {
      return {
        organizationLabel: org.label,
        ticket: session.ticket,
        reason: session.reason,
        expiresAt: session.expiresAt,
      };
    }
  }
  return null;
}

export async function getActiveElevationBanner(): Promise<ActiveElevationBanner | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const actorId = store.get(CONTROL_SESSION_COOKIE_NAME)?.value ?? null;
  return resolveActiveElevationBanner(actorId);
}
