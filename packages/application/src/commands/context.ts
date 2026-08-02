// Command context — DATATEK_R0_D sección 3: "Cada comando recibe el
// contexto definido en R0-C y devuelve errores de dominio estables."
//
// This is exactly the shape `apps/web/src/lib/fixture-session.ts` (R0-C)
// already resolves via `resolveWebSession`/`resolveOrganizationCapabilities`
// — this file adds nothing new to identity/tenancy, it only names the
// bundle a command needs plus the two fields R0-C did not need yet
// (idempotency key, correlation id) because R0-C had no mutating commands.
import type { OrganizationCapabilityResolution } from "@datatek/auth";
import type { OrganizationPermission } from "@datatek/domain";
import { isBranchAllowed } from "@datatek/auth";

export interface CommandContext {
  /** auth.users id of the actor performing the command. Never trusted from
   * a request body — the HTTP boundary resolves this the same way
   * `getWebSession` does (cookie/session), never a client-supplied field. */
  actorId: string;
  organizationId: string;
  /** Branch the actor is acting within, or `null` when the command is not
   * branch-scoped. */
  branchId: string | null;
  /** R0-C's real resolution — membership status, additive permissions, and
   * branch scope. A command never re-derives this; it only reads it. */
  capabilities: OrganizationCapabilityResolution;
  /** Caller-supplied idempotency key. Commands are idempotent per
   * (organizationId, commandName, idempotencyKey) — DATATEK_R0_D sección 14
   * lists this pattern as required starting `0085`; R0-D Fase 1 wires the
   * mechanism into the fixture engine now so later waves only add the
   * `idempotency_keys` table, not new call sites. */
  idempotencyKey: string;
  correlationId: string;
  now: Date;
}

export type CommandErrorCode =
  | "MEMBERSHIP_INACTIVE"
  | "FORBIDDEN"
  | "BRANCH_DENIED"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOKEN_INVALID";

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  field?: string;
  permission?: OrganizationPermission;
  branchId?: string;
}

export function membershipInactiveError(
  status: OrganizationCapabilityResolution["membershipStatus"],
): CommandError {
  return {
    code: "MEMBERSHIP_INACTIVE",
    message: `No hay membresía activa en esta organización (estado: ${status}).`,
  };
}

export function forbiddenError(permission: OrganizationPermission): CommandError {
  return {
    code: "FORBIDDEN",
    message: `Falta el permiso requerido: ${permission}.`,
    permission,
  };
}

export function branchDeniedError(branchId: string): CommandError {
  return {
    code: "BRANCH_DENIED",
    message: "La sucursal indicada no está dentro del alcance de la membresía.",
    branchId,
  };
}

export function validationError(message: string, field?: string): CommandError {
  return { code: "VALIDATION", message, field };
}

export function notFoundError(
  message: string = "El recurso no está disponible para esta sesión.",
): CommandError {
  return { code: "NOT_FOUND", message };
}

export function conflictError(message: string): CommandError {
  return { code: "CONFLICT", message };
}

/** DATATEK_R0_A sección 10.2: "el frontend recibe errores neutrales; no se
 * distingue públicamente entre token inexistente, expirado o revocado."
 * `VerifyAuthorizationAccess` and `RecordAuthorization` (secure-link path)
 * return exactly this — same code, same message — whether the token does
 * not exist, expired, was revoked, is locked out after 5 failed attempts,
 * was already used, or the presented secret simply does not match. Never
 * construct a bespoke message for one of those cases; always call this. */
export function tokenInvalidError(): CommandError {
  return {
    code: "TOKEN_INVALID",
    message: "El enlace de autorización no es válido, expiró o ya no está disponible.",
  };
}

/** Convenience constructor — mirrors exactly the fields
 * `resolveWebSession`/`resolveOrganizationCapabilities` (R0-C,
 * `apps/web/src/lib/fixture-session.ts`) already produce, plus the two
 * fields commands add (idempotency key, correlation id). */
export function buildCommandContext(params: {
  actorId: string;
  organizationId: string;
  branchId?: string | null;
  capabilities: OrganizationCapabilityResolution;
  idempotencyKey: string;
  correlationId: string;
  now?: Date;
}): CommandContext {
  return {
    actorId: params.actorId,
    organizationId: params.organizationId,
    branchId: params.branchId ?? null,
    capabilities: params.capabilities,
    idempotencyKey: params.idempotencyKey,
    correlationId: params.correlationId,
    now: params.now ?? new Date(),
  };
}

/** Every command's first line of defense. Returns `null` when the actor may
 * proceed, or the stable error to return otherwise. Mirrors exactly what
 * `resolveAccessBoundaryState` (R0-C, `@datatek/auth`) checks for a
 * server-rendered page, applied here to a mutating command instead. */
export function requirePermission(
  ctx: CommandContext,
  permission: OrganizationPermission,
): CommandError | null {
  if (ctx.capabilities.membershipStatus !== "active") {
    return membershipInactiveError(ctx.capabilities.membershipStatus);
  }
  if (ctx.branchId != null && !isBranchAllowed(ctx.capabilities.branchScope, ctx.branchId)) {
    return branchDeniedError(ctx.branchId);
  }
  if (!ctx.capabilities.permissions.includes(permission)) {
    return forbiddenError(permission);
  }
  return null;
}
