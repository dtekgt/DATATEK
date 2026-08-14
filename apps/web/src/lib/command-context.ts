// Server-only helper — builds a real `CommandContext` for a Server Action
// invoked by an authenticated Pro (staff) actor, reusing the exact same
// building blocks `apps/web/src/app/api/dev/commands/route.ts` already uses
// (`resolveOrganizationCapabilities` + `buildCommandContext`). Fase 4b needs
// this because Server Actions — unlike that temporary dev route — never
// accept `actorId`/`organizationId` from the request body; both are
// resolved server-side from the fixture session cookie
// (`getWebSession`/`SESSION_COOKIE_NAME`, R0-C), exactly like every other
// real Pro page already does for reads.
import { resolveOrganizationCapabilities } from "@datatek/auth";
import { buildFixtureTenancySnapshot, FIXTURE_ORGANIZATIONS } from "@datatek/application";
import { buildCommandContext, type CommandContext } from "@datatek/application/commands";
import {
  loadActorTenancySnapshot,
  resolveOrganizationBySlug as resolveRealOrgBySlug,
} from "@datatek/database";
import { getPostgresPool, isPostgresEnabled } from "./commands-engine";

const TENANCY_SNAPSHOT = buildFixtureTenancySnapshot();

/** Resolves `orgSlug` -> org id/label against fixture tenancy. Still used
 * by Pass (`pass-actor.ts`, out of Puerta A's scope) regardless of the
 * `DATATEK_PERSISTENCE` gate — `buildStaffCommandContext` below has its own
 * real-Postgres org resolution and does NOT call this when the gate is
 * active. */
export function resolveOrgBySlug(orgSlug: string) {
  return FIXTURE_ORGANIZATIONS.find((o) => o.slug === orgSlug) ?? null;
}

/** Builds a `CommandContext` for a staff actor already resolved by
 * `getWebSession` — never trusts an `actorId`/`organizationId` supplied by
 * client input. Returns `null` only when `orgSlug` does not resolve to a
 * known organization (defensive; every caller already validated this via
 * `getWebSession` before reaching here).
 *
 * Async because the `DATATEK_PERSISTENCE=postgres` path loads the org and
 * the actor's tenancy snapshot from real Postgres (`@datatek/database`) —
 * the fixture path below stays synchronous-shaped but is awaited by every
 * caller regardless, so both paths share one signature. */
export async function buildStaffCommandContext(params: {
  actorId: string;
  orgSlug: string;
  branchId?: string | null;
  now?: Date;
}): Promise<CommandContext | null> {
  const now = params.now ?? new Date();

  if (isPostgresEnabled()) {
    const pool = getPostgresPool();
    const [org, snapshot] = await Promise.all([
      resolveRealOrgBySlug(pool, params.orgSlug),
      loadActorTenancySnapshot(pool, params.actorId),
    ]);
    if (!org) return null;
    const capabilities = resolveOrganizationCapabilities(params.actorId, org.id, now, snapshot);
    return buildCommandContext({
      actorId: params.actorId,
      organizationId: org.id,
      branchId: params.branchId ?? null,
      capabilities,
      idempotencyKey: globalThis.crypto.randomUUID(),
      correlationId: globalThis.crypto.randomUUID(),
      now,
    });
  }

  const org = resolveOrgBySlug(params.orgSlug);
  if (!org) return null;
  const capabilities = resolveOrganizationCapabilities(
    params.actorId,
    org.id,
    now,
    TENANCY_SNAPSHOT,
  );
  return buildCommandContext({
    actorId: params.actorId,
    organizationId: org.id,
    branchId: params.branchId ?? null,
    capabilities,
    idempotencyKey: globalThis.crypto.randomUUID(),
    correlationId: globalThis.crypto.randomUUID(),
    now,
  });
}

const GUEST_ACTOR_ID = "market-guest" as const;

/** Builds a `CommandContext` for an anonymous Market visitor — no session,
 * no membership. Only `createMarketQuoteRequest`/`respondToMarketOffer`
 * (market-request-commands.ts) accept this: neither calls
 * `requirePermission`, so the fabricated `capabilities` below only exists
 * to satisfy the type — see `dtek-invitado-sin-garage`: pedir cuenta antes
 * de la acción principal mata la conversión, así que este flujo nunca pasa
 * por `getWebSession`. Resolves against the same org registry as
 * `resolveOrgBySlug` — Market workshop slugs are identical to org slugs
 * (`FIXTURE_ORGANIZATIONS`), so no separate mapping is needed. */
export function buildGuestCommandContext(params: {
  orgSlug: string;
  now?: Date;
}): CommandContext | null {
  const org = resolveOrgBySlug(params.orgSlug);
  if (!org) return null;
  const now = params.now ?? new Date();
  return buildCommandContext({
    actorId: GUEST_ACTOR_ID,
    organizationId: org.id,
    branchId: null,
    capabilities: { membershipStatus: "missing", membershipId: null, permissions: [], branchScope: [] },
    idempotencyKey: globalThis.crypto.randomUUID(),
    correlationId: globalThis.crypto.randomUUID(),
    now,
  });
}
