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
import {
  loadActorTenancySnapshot,
  resolveOrganizationBySlug,
  loadOrganizationsByIds,
  loadOrganizationBranches,
} from "@datatek/database";
import { getPostgresPool, isPostgresEnabled } from "./commands-engine";
import { getSupabaseServerClient } from "./supabase-server";

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

/** Equivalente real de `resolveWebSession` — mismo contrato
 * (`WebSessionResolution`), pero `actorId` es el UUID de una sesión real de
 * Supabase Auth y la tenencia sale de Postgres real
 * (`loadActorTenancySnapshot`) en vez de `TENANCY_SNAPSHOT` fixture.
 * `resolveOrganizationCapabilities`/`resolveAccessBoundaryState` no
 * cambian — reciben el mismo `TenancySnapshot`, solo que cargado de
 * verdad. */
async function resolveRealWebSession(
  actorId: string | null,
  orgSlug: string,
  requiredPermission: OrganizationPermission | undefined,
  now: Date = new Date(),
): Promise<WebSessionResolution> {
  if (!actorId) {
    return {
      actorId: null,
      actorDisplayName: "Invitado",
      organizationId: null,
      organizationSlug: null,
      availableOrganizations: [],
      branchScope: [],
      availableBranches: [],
      permissions: [],
      accessState: resolveAccessBoundaryState({ sessionStatus: "unauthenticated" }),
    };
  }

  const pool = getPostgresPool();
  const [snapshot, org] = await Promise.all([
    loadActorTenancySnapshot(pool, actorId),
    resolveOrganizationBySlug(pool, orgSlug),
  ]);

  const activeOrgIds = snapshot.memberships
    .filter((m) => m.status === "active")
    .map((m) => m.organizationId);
  const availableOrgsRaw = await loadOrganizationsByIds(pool, activeOrgIds);
  const availableOrganizations = availableOrgsRaw.map((o) => ({
    id: o.id,
    slug: o.slug,
    label: o.name,
    meta: "",
  }));

  const actorProfile = snapshot.profiles.find((p) => p.userId === actorId);

  if (!org) {
    const accessState = resolveAccessBoundaryState({
      sessionStatus: "authenticated",
      organization: {
        organizationId: orgSlug,
        resolution: { membershipStatus: "missing", membershipId: null, permissions: [], branchScope: [] },
      },
    });
    return {
      actorId,
      actorDisplayName: actorProfile?.displayName ?? actorId,
      organizationId: null,
      organizationSlug: null,
      availableOrganizations,
      branchScope: [],
      availableBranches: [],
      permissions: [],
      accessState,
    };
  }

  const resolution = resolveOrganizationCapabilities(actorId, org.id, now, snapshot);
  const accessState = resolveAccessBoundaryState({
    sessionStatus: "authenticated",
    organization: { organizationId: org.id, resolution, requiredPermission },
  });
  const availableBranches =
    resolution.membershipStatus === "active"
      ? await loadOrganizationBranches(pool, actorId, org.id)
      : [];

  return {
    actorId,
    actorDisplayName: actorProfile?.displayName ?? actorId,
    organizationId: org.id,
    organizationSlug: org.slug,
    availableOrganizations,
    branchScope: resolution.branchScope,
    availableBranches,
    permissions: resolution.permissions,
    accessState,
  };
}

/** Server-only. Con `DATATEK_PERSISTENCE=postgres` lee la sesión real de
 * Supabase Auth (`supabase.auth.getUser()`); si no, lee la cookie fixture
 * `dtek_actor` como siempre. Nunca cae a query string ni header en
 * ninguno de los dos caminos. */
export async function getWebSession(
  orgSlug: string,
  requiredPermission?: OrganizationPermission,
): Promise<WebSessionResolution> {
  if (isPostgresEnabled()) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return resolveRealWebSession(user?.id ?? null, orgSlug, requiredPermission);
  }

  const { cookies } = await import("next/headers");
  const store = await cookies();
  const actorId = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  return resolveWebSession(actorId, orgSlug, requiredPermission);
}
