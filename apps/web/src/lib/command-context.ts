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

const TENANCY_SNAPSHOT = buildFixtureTenancySnapshot();

/** Resolves `orgSlug` -> org id/label — the same lookup every Pro page
 * already does against `FIXTURE_ORGANIZATIONS` (R0-C fixture tenancy). */
export function resolveOrgBySlug(orgSlug: string) {
  return FIXTURE_ORGANIZATIONS.find((o) => o.slug === orgSlug) ?? null;
}

/** Builds a `CommandContext` for a staff actor already resolved by
 * `getWebSession` — never trusts an `actorId`/`organizationId` supplied by
 * client input. Returns `null` only when `orgSlug` does not resolve to a
 * seeded organization (defensive; every caller already validated this via
 * `getWebSession` before reaching here). */
export function buildStaffCommandContext(params: {
  actorId: string;
  orgSlug: string;
  branchId?: string | null;
  now?: Date;
}): CommandContext | null {
  const org = resolveOrgBySlug(params.orgSlug);
  if (!org) return null;
  const now = params.now ?? new Date();
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
