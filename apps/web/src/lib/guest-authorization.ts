// Server-only helper — builds a `CommandContext` for an UNAUTHENTICATED
// guest deciding an authorization via `/a/[token]` (DATATEK_R0_A sección
// 10.1 "enlace seguro"; `EXPERIENCE_SPEC.guest_authorization_requires_account
// = false`).
//
// `VerifyAuthorizationAccess` and the `secure_link` branch of
// `RecordAuthorization` never call `requirePermission` (see the header
// comment on packages/application/src/commands/authorization-commands.ts) —
// the token itself is the only gate, so `actorId`/`capabilities` below are
// never used to grant anything. `organizationId` DOES matter: it flows into
// the internal `TransitionCase` call `RecordAuthorization` makes on the
// guest's behalf (`systemCaseTransitionContext`), so it must match the
// token's real organization or the case status transition silently no-ops
// (see that function's comment in authorization-commands.ts). It is
// resolved by reading the token's own PUBLIC `id` component — documented in
// docs/domain/authorization-security.md as "comparable a un key id, no
// secreto por sí mismo" — against the engine's own state, never guessed and
// never trusting anything the guest's request claims about which
// organization it belongs to.
import { buildCommandContext, type CommandContext } from "@datatek/application/commands";
import { getCommandsEngine } from "./commands-engine";

export function buildGuestCommandContext(
  plainToken: string,
  now: Date = new Date(),
): CommandContext {
  const dot = plainToken.indexOf(".");
  const tokenId = dot > 0 ? plainToken.slice(0, dot) : plainToken;
  const tokenRow = getCommandsEngine()
    .getState()
    .authorizationAccessTokens.find((t) => t.id === tokenId);

  return buildCommandContext({
    // Never a real auth.users id — there is none for an unauthenticated
    // guest. `resolveToken` (authorization-commands.ts) overrides the
    // effective decision actor with the token's own
    // `audienceCustomerId` once it resolves successfully; this value is
    // only a placeholder for the shape `CommandContext` requires.
    actorId: tokenRow?.audienceCustomerId ?? "guest",
    organizationId: tokenRow?.organizationId ?? "unknown-organization",
    capabilities: {
      membershipStatus: "missing",
      membershipId: null,
      permissions: [],
      branchScope: [],
    },
    idempotencyKey: globalThis.crypto.randomUUID(),
    correlationId: globalThis.crypto.randomUUID(),
    now,
  });
}
