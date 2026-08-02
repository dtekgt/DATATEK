// Authorization request/decision commands — DATATEK_R0_D sección 12,
// DATATEK_R0_A sección 9.3/9.4 and sección 10 (contrato de seguridad de
// `/a/[token]`).
//
// `PrepareAuthorizationRequest`, `MarkAuthorizationRequestSent`,
// `VerifyAuthorizationAccess`, `RecordAuthorization`, `InvalidateAuthorization`.
//
// Token model (sección 10.2): the plaintext string handed back by
// `PrepareAuthorizationRequest` is `${tokenRowId}.${secret}` — `tokenRowId`
// is a public routing component (like a key id), `secret` is the
// high-entropy part. Only `sha256(secret)` is ever persisted
// (`tokenHash`). Looking a presented token up by its `tokenRowId` FIRST is
// what lets an attacker's WRONG guess still increment the correct row's
// attempt counter (instead of the guess matching nothing and never
// counting toward the 5-attempt lockout) — this is what makes the
// "5 intentos y bloqueo" contract requirement actually enforceable against
// repeated guesses of the same link.
//
// `VerifyAuthorizationAccess` and the `secure_link` decision path of
// `RecordAuthorization` are reachable WITHOUT an organization membership on
// purpose — DATATEK_R0_A `EXPERIENCE_SPEC.guest_authorization_requires_account
// = false`. Neither calls `requirePermission`; the token itself is the only
// gate. `PrepareAuthorizationRequest`/`MarkAuthorizationRequestSent` and the
// `staff_manual` decision path DO require staff permissions
// (`authorization.request` / `authorization.decide`).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { resolveCaseTransition, SECURITY_SPEC, type CaseStatus } from "@datatek/domain";
import {
  requirePermission,
  validationError,
  notFoundError,
  conflictError,
  tokenInvalidError,
  buildCommandContext,
  type CommandContext,
  type CommandError,
} from "./context.ts";
import { transitionCase } from "./intake-commands.ts";
import {
  appendAuditEvent,
  appendIdempotencyRecord,
  cryptoRandomId,
  findIdempotentReplay,
  isFeatureEnabled,
  FEATURE_KEY_AUTHORIZATION_REISSUE,
  type CommandOutcome,
  type CrmVehicleState,
  type AuthorizationRequestRow,
  type AuthorizationAccessTokenRow,
  type AuthorizationAccessMethod,
  type AuthorizationTokenScope,
  type AuthorizationRow,
  type AuthorizationItemRow,
  type AuthorizationDecisionMethod,
  type AuthorizationEventRow,
  type CaseRow,
} from "./state.ts";

const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;
const REQUEST_PERMISSION = "authorization.request" as const;
const DECIDE_PERMISSION = "authorization.decide" as const;
const MAX_TOKEN_ATTEMPTS = SECURITY_SPEC.authorization_token_max_attempts;
const DEFAULT_REQUEST_TTL_MINUTES = 3 * 24 * 60; // 3 días — vigencia por defecto de una solicitud.

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --- PrepareAuthorizationRequest --------------------------------------------

export interface PrepareAuthorizationRequestInput {
  quoteVersionId: string;
  audienceCustomerId: string;
  allowedMethods?: AuthorizationAccessMethod[];
  scope?: AuthorizationTokenScope;
  expiresInMinutes?: number;
  verificationMethod?: string;
}

export interface PrepareAuthorizationRequestOutput {
  request: AuthorizationRequestRow;
  token: AuthorizationAccessTokenRow;
  case: CaseRow;
  /** The ONLY place the plaintext token secret ever appears — never
   * persisted to state, never put in an audit/event payload (sección 10.2:
   * "nunca aparece en logs, eventos o analytics"). The caller (Pro, in a
   * later phase) hands this to `MarkAuthorizationRequestSent`'s delivery
   * adapter; this fixture engine's dev route just returns it so curl can
   * demonstrate the journey. */
  plainToken: string;
}

const COMMAND_PREPARE_AUTHORIZATION_REQUEST = "PrepareAuthorizationRequest";

export function prepareAuthorizationRequest(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: PrepareAuthorizationRequestInput,
): CommandOutcome<PrepareAuthorizationRequestOutput> {
  const replay = findIdempotentReplay<PrepareAuthorizationRequestOutput>(
    state,
    ctx,
    COMMAND_PREPARE_AUTHORIZATION_REQUEST,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, REQUEST_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const version = state.quoteVersions.find(
    (v) => v.id === input.quoteVersionId && v.organizationId === ctx.organizationId,
  );
  if (!version) return { ok: false, error: notFoundError() };
  if (version.status !== "frozen") {
    return {
      ok: false,
      error: conflictError(
        `PrepareAuthorizationRequest solo acepta una versión 'frozen' (estado actual: ${version.status}).`,
      ),
    };
  }
  if (!NON_EMPTY(input.audienceCustomerId)) {
    return {
      ok: false,
      error: validationError("audienceCustomerId es obligatorio.", "audienceCustomerId"),
    };
  }

  const expiresInMinutes = input.expiresInMinutes ?? DEFAULT_REQUEST_TTL_MINUTES;
  if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) {
    return {
      ok: false,
      error: validationError("expiresInMinutes debe ser positivo.", "expiresInMinutes"),
    };
  }
  const expiresAt = new Date(ctx.now.getTime() + expiresInMinutes * 60_000).toISOString();

  // This is the ACTUAL moment the case starts being true when it says
  // "esperando tu decisión" — there is now a frozen version and a decidable
  // request behind it, unlike `CompleteInspection` (see that command's
  // comment). Reuses the real `TransitionCase` command, same pattern as
  // `RecordAuthorization` below, instead of writing to `cases`/
  // `case_status_events` by hand.
  const kase = state.cases.find(
    (c) => c.id === version.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };
  const caseTransition = transitionCase(state, systemCaseTransitionContext(ctx), {
    caseId: kase.id,
    toStatus: "waiting_authorization",
    reason: "Cotización congelada y solicitud de autorización preparada",
  });
  if (!caseTransition.ok) return { ok: false, error: caseTransition.error };
  const stateAfterCaseTransition = caseTransition.nextState;
  const updatedCase = caseTransition.data;

  const request: AuthorizationRequestRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: version.caseId,
    quoteVersionId: version.id,
    audienceCustomerId: input.audienceCustomerId,
    status: "prepared",
    allowedMethods: input.allowedMethods ?? ["secure_link"],
    expiresAt,
    preparedAt: ctx.now.toISOString(),
    preparedBy: ctx.actorId,
    sentAt: null,
    sentBy: null,
    sentChannel: null,
    sentResult: null,
    viewedAt: null,
    decidedAt: null,
    authorizationId: null,
    revokedAt: null,
    revokedReason: null,
    supersededByQuoteVersionId: null,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const tokenId = cryptoRandomId();
  const secret = randomBytes(32).toString("base64url");
  const plainToken = `${tokenId}.${secret}`;

  const token: AuthorizationAccessTokenRow = {
    id: tokenId,
    organizationId: ctx.organizationId,
    authorizationRequestId: request.id,
    tokenHash: sha256Hex(secret),
    scope: input.scope ?? "read_and_decide",
    audienceCustomerId: input.audienceCustomerId,
    verificationMethod: input.verificationMethod ?? "manual_local_adapter",
    expiresAt,
    verifiedAt: null,
    usedAt: null,
    revokedAt: null,
    lockedAt: null,
    attemptCount: 0,
    maxAttempts: MAX_TOKEN_ATTEMPTS,
    nonce: randomBytes(16).toString("hex"),
    idempotencyKey: ctx.idempotencyKey,
    createdAt: ctx.now.toISOString(),
  };

  const event = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: request.caseId,
    authorizationRequestId: request.id,
    authorizationId: null,
    eventType: "prepared" as const,
    // Never the secret — only non-sensitive metadata (sección 10.2).
    details: { quoteVersionId: version.id, expiresAt },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const output: PrepareAuthorizationRequestOutput = {
    request,
    token,
    plainToken,
    case: updatedCase,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_PREPARE_AUTHORIZATION_REQUEST,
    "Solicitud de autorización preparada",
    { requestId: request.id, quoteVersionId: version.id, tokenId },
  );

  const nextState: CrmVehicleState = {
    ...stateAfterCaseTransition,
    authorizationRequests: [...stateAfterCaseTransition.authorizationRequests, request],
    authorizationAccessTokens: [...stateAfterCaseTransition.authorizationAccessTokens, token],
    authorizationEvents: [...stateAfterCaseTransition.authorizationEvents, event],
    idempotencyRecords: [
      ...stateAfterCaseTransition.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_PREPARE_AUTHORIZATION_REQUEST, output),
    ],
    auditLog: [...stateAfterCaseTransition.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- MarkAuthorizationRequestSent -------------------------------------------
// A separate event from freeze (sección 9.2/9.3: "freeze y enviar son
// eventos distintos"). A failed send NEVER touches the quote version and
// NEVER moves the request to `sent`.

export interface MarkAuthorizationRequestSentInput {
  authorizationRequestId: string;
  channel: string;
  result: "sent" | "failed";
  note?: string | null;
}

const COMMAND_MARK_AUTHORIZATION_REQUEST_SENT = "MarkAuthorizationRequestSent";

export function markAuthorizationRequestSent(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: MarkAuthorizationRequestSentInput,
): CommandOutcome<AuthorizationRequestRow> {
  const replay = findIdempotentReplay<AuthorizationRequestRow>(
    state,
    ctx,
    COMMAND_MARK_AUTHORIZATION_REQUEST_SENT,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, REQUEST_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const request = state.authorizationRequests.find(
    (r) => r.id === input.authorizationRequestId && r.organizationId === ctx.organizationId,
  );
  if (!request) return { ok: false, error: notFoundError() };
  if (!["prepared", "sent"].includes(request.status)) {
    return {
      ok: false,
      error: conflictError(
        `No se puede registrar un envío sobre una solicitud en estado '${request.status}'.`,
      ),
    };
  }
  if (!NON_EMPTY(input.channel)) {
    return { ok: false, error: validationError("channel es obligatorio.", "channel") };
  }

  // A failed attempt is retried idempotently without ever claiming `sent`
  // (sección 12: "Si el intento falla, quote sigue frozen y request no se
  // marca sent"; sección 9.3: "reintentos de envío no crean decisiones
  // duplicadas").
  const updated: AuthorizationRequestRow =
    input.result === "sent"
      ? {
          ...request,
          status: "sent",
          sentAt: ctx.now.toISOString(),
          sentBy: ctx.actorId,
          sentChannel: input.channel,
          sentResult: "sent",
        }
      : { ...request, sentResult: "failed" };

  const event = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: request.caseId,
    authorizationRequestId: request.id,
    authorizationId: null,
    eventType: input.result === "sent" ? ("sent" as const) : ("send_failed" as const),
    details: { channel: input.channel, note: input.note ?? null },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_MARK_AUTHORIZATION_REQUEST_SENT,
    input.result === "sent"
      ? "Envío de solicitud registrado"
      : "Intento de envío fallido registrado",
    { requestId: request.id, channel: input.channel, result: input.result },
  );

  const nextState: CrmVehicleState = {
    ...state,
    authorizationRequests: state.authorizationRequests.map((r) =>
      r.id === request.id ? updated : r,
    ),
    authorizationEvents: [...state.authorizationEvents, event],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_MARK_AUTHORIZATION_REQUEST_SENT, updated),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: updated, replayed: false };
}

// --- Shared token resolution (VerifyAuthorizationAccess + RecordAuthorization secure_link) ---

interface TokenResolution {
  ok: boolean;
  token?: AuthorizationAccessTokenRow;
  request?: AuthorizationRequestRow;
  error?: CommandError;
  nextState: CrmVehicleState;
  /** true once the presented secret matched the stored hash for the
   * resolved row — distinguishes "found the row but it's dead/expired"
   * from "found the row and the guess was simply wrong", both of which
   * still return the exact same neutral error to the caller. */
  matched: boolean;
}

/** Parses `${tokenId}.${secret}`, looks the row up by `tokenId`, and
 * evaluates it against every liveness rule in DATATEK_R0_A sección 10.2 —
 * revoked / locked / used / expired / wrong secret all return the SAME
 * `tokenInvalidError()` (never revealing which). A wrong-secret guess
 * against an otherwise-live row increments `attemptCount` and locks the
 * row at `maxAttempts` (sección 10.2: "máximo cinco intentos fallidos
 * antes de bloqueo"). Does not persist anything by itself — returns the
 * next state for the caller to fold in alongside its own changes. */
function resolveToken(
  state: CrmVehicleState,
  plainToken: string,
  requiredScope: AuthorizationTokenScope,
  now: Date,
): TokenResolution {
  const dot = plainToken.indexOf(".");
  if (dot <= 0 || dot === plainToken.length - 1) {
    return { ok: false, error: tokenInvalidError(), nextState: state, matched: false };
  }
  const tokenId = plainToken.slice(0, dot);
  const secret = plainToken.slice(dot + 1);

  const token = state.authorizationAccessTokens.find((t) => t.id === tokenId);
  if (!token) {
    return { ok: false, error: tokenInvalidError(), nextState: state, matched: false };
  }

  const request = state.authorizationRequests.find((r) => r.id === token.authorizationRequestId);

  const alreadyDead =
    token.revokedAt != null ||
    token.lockedAt != null ||
    token.usedAt != null ||
    new Date(token.expiresAt).getTime() <= now.getTime();

  if (alreadyDead) {
    // Nothing further to increment — this link is already unusable.
    return { ok: false, error: tokenInvalidError(), nextState: state, request, matched: false };
  }

  const providedHash = sha256Hex(secret);
  const matches = constantTimeHashEquals(providedHash, token.tokenHash);

  if (!matches) {
    const attemptCount = token.attemptCount + 1;
    const lockedNow = attemptCount >= token.maxAttempts;
    const updatedToken: AuthorizationAccessTokenRow = {
      ...token,
      attemptCount,
      lockedAt: lockedNow ? now.toISOString() : token.lockedAt,
    };
    const nextState: CrmVehicleState = {
      ...state,
      authorizationAccessTokens: state.authorizationAccessTokens.map((t) =>
        t.id === token.id ? updatedToken : t,
      ),
    };
    return {
      ok: false,
      error: tokenInvalidError(),
      nextState,
      token: updatedToken,
      request,
      matched: false,
    };
  }

  if (
    token.scope !== requiredScope &&
    !(requiredScope === "read" && token.scope === "read_and_decide")
  ) {
    // A read-only token cannot decide. Correct secret, wrong scope — still
    // the same neutral response; scope is not attempt-limited (it is not a
    // guessable secret), so no counter change.
    return {
      ok: false,
      error: tokenInvalidError(),
      nextState: state,
      token,
      request,
      matched: true,
    };
  }

  return { ok: true, token, request, nextState: state, matched: true };
}

// --- VerifyAuthorizationAccess ------------------------------------------------

export interface VerifyAuthorizationAccessInput {
  token: string;
}

export interface VerifyAuthorizationAccessOutput {
  authorizationRequestId: string;
  caseId: string;
  quoteVersionId: string;
  scope: AuthorizationTokenScope;
  expiresAt: string;
}

const COMMAND_VERIFY_AUTHORIZATION_ACCESS = "VerifyAuthorizationAccess";

/** No `requirePermission` call — reachable by an unauthenticated guest by
 * design (sección 10.1 "enlace seguro"; `EXPERIENCE_SPEC.
 * guest_authorization_requires_account = false`). The token is the only
 * gate. */
export function verifyAuthorizationAccess(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: VerifyAuthorizationAccessInput,
): CommandOutcome<VerifyAuthorizationAccessOutput> {
  const replay = findIdempotentReplay<VerifyAuthorizationAccessOutput>(
    state,
    ctx,
    COMMAND_VERIFY_AUTHORIZATION_ACCESS,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const resolution = resolveToken(state, input.token, "read", ctx.now);

  if (!resolution.ok || !resolution.token || !resolution.request) {
    const event = resolution.request
      ? {
          id: cryptoRandomId(),
          organizationId: resolution.request.organizationId,
          caseId: resolution.request.caseId,
          authorizationRequestId: resolution.request.id,
          authorizationId: null,
          eventType: "access_denied" as const,
          details: {},
          actorId: ctx.actorId,
          occurredAt: ctx.now.toISOString(),
          createdAt: ctx.now.toISOString(),
        }
      : null;
    const nextState: CrmVehicleState = event
      ? {
          ...resolution.nextState,
          authorizationEvents: [...resolution.nextState.authorizationEvents, event],
        }
      : resolution.nextState;
    // Persisted even on failure: a wrong-secret guess still increments
    // that token row's attempt counter (see the comment on
    // `CommandOutcome`, commands/state.ts) — this is what makes the
    // 5-attempt lockout actually take effect across repeated calls.
    return { ok: false, error: resolution.error ?? tokenInvalidError(), nextState };
  }

  const { token, request } = resolution;

  const updatedToken: AuthorizationAccessTokenRow =
    token.verifiedAt == null ? { ...token, verifiedAt: ctx.now.toISOString() } : token;
  const updatedRequest: AuthorizationRequestRow =
    request.status === "sent"
      ? { ...request, status: "viewed", viewedAt: ctx.now.toISOString() }
      : request;

  const output: VerifyAuthorizationAccessOutput = {
    authorizationRequestId: request.id,
    caseId: request.caseId,
    quoteVersionId: request.quoteVersionId,
    scope: token.scope,
    expiresAt: token.expiresAt,
  };

  const event = {
    id: cryptoRandomId(),
    organizationId: request.organizationId,
    caseId: request.caseId,
    authorizationRequestId: request.id,
    authorizationId: null,
    eventType: "viewed" as const,
    details: {},
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_VERIFY_AUTHORIZATION_ACCESS,
    "Acceso a solicitud de autorización verificado",
    { requestId: request.id },
  );

  const nextState: CrmVehicleState = {
    ...state,
    authorizationAccessTokens: state.authorizationAccessTokens.map((t) =>
      t.id === updatedToken.id ? updatedToken : t,
    ),
    authorizationRequests: state.authorizationRequests.map((r) =>
      r.id === updatedRequest.id ? updatedRequest : r,
    ),
    authorizationEvents: [...state.authorizationEvents, event],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_VERIFY_AUTHORIZATION_ACCESS, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- RecordAuthorization ---------------------------------------------------
// DATATEK_R0_A sección 9.3/10.3: consumo atómico. Re-validates the token
// (or staff permission) itself rather than trusting a prior
// `VerifyAuthorizationAccess` call — a fresh HTTP request has no memory of
// that earlier call, exactly like a real `/a/[token]` submit.

export interface RecordAuthorizationInput {
  method: "secure_link" | "staff_manual";
  token?: string;
  authorizationRequestId?: string;
  quoteVersionId: string;
  quoteVersionHash: string;
  decision: "accept_all" | "partial" | "reject";
  acceptedQuoteItemIds?: string[];
  rejectionReason?: string | null;
}

export interface RecordAuthorizationOutput {
  authorization: AuthorizationRow;
  items: AuthorizationItemRow[];
  case: CaseRow;
}

const COMMAND_RECORD_AUTHORIZATION = "RecordAuthorization";

/** Builds a minimal, tightly-scoped internal `CommandContext` used ONLY to
 * invoke the existing `TransitionCase` command from inside
 * `RecordAuthorization`. The actor deciding an authorization is very often
 * a guest customer with no `intake.manage` permission (by design — see the
 * module header), yet DATATEK_R0_D requires the case transition itself to
 * go "vía TransitionCase (ya existe), no muevas el estado del caso a
 * mano." This is the same pattern a real backend uses when a validated,
 * narrow customer action (here: a token-authenticated decision) triggers a
 * privileged internal side effect — the elevation is granted to the
 * SYSTEM step, not to the caller, and is limited to exactly the one
 * permission `transitionCase` checks. */
function systemCaseTransitionContext(ctx: CommandContext): CommandContext {
  return buildCommandContext({
    actorId: ctx.actorId,
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    capabilities: {
      membershipStatus: "active",
      membershipId: null,
      permissions: ["intake.manage"],
      branchScope: "all",
    },
    idempotencyKey: `${ctx.idempotencyKey}:case-transition`,
    correlationId: ctx.correlationId,
    now: ctx.now,
  });
}

export function recordAuthorization(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RecordAuthorizationInput,
): CommandOutcome<RecordAuthorizationOutput> {
  const replay = findIdempotentReplay<RecordAuthorizationOutput>(
    state,
    ctx,
    COMMAND_RECORD_AUTHORIZATION,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  let workingState = state;
  let request: AuthorizationRequestRow | undefined;
  let decisionActorId = ctx.actorId;
  let decisionMethod: AuthorizationDecisionMethod;
  let audienceCustomerId: string | undefined;
  let consumedToken: AuthorizationAccessTokenRow | undefined;

  if (input.method === "secure_link") {
    if (input.token == null || input.token.trim().length === 0) {
      return {
        ok: false,
        error: validationError("token es obligatorio para method=secure_link.", "token"),
      };
    }
    const presentedToken = input.token;
    const resolution = resolveToken(workingState, presentedToken, "read_and_decide", ctx.now);
    workingState = resolution.nextState;
    if (!resolution.ok || !resolution.token || !resolution.request) {
      if (resolution.request) {
        const deniedEvent = {
          id: cryptoRandomId(),
          organizationId: resolution.request.organizationId,
          caseId: resolution.request.caseId,
          authorizationRequestId: resolution.request.id,
          authorizationId: null,
          eventType: "access_denied" as const,
          details: {},
          actorId: ctx.actorId,
          occurredAt: ctx.now.toISOString(),
          createdAt: ctx.now.toISOString(),
        };
        workingState = {
          ...workingState,
          authorizationEvents: [...workingState.authorizationEvents, deniedEvent],
        };
      }
      // Same reasoning as VerifyAuthorizationAccess: persist the attempt
      // increment (or lock) even though the command itself failed.
      return { ok: false, error: resolution.error ?? tokenInvalidError(), nextState: workingState };
    }
    request = resolution.request;
    consumedToken = resolution.token;
    decisionMethod = "secure_link";
    decisionActorId = resolution.token.audienceCustomerId;
    audienceCustomerId = resolution.token.audienceCustomerId;
  } else {
    const permError = requirePermission(ctx, DECIDE_PERMISSION);
    if (permError) return { ok: false, error: permError };
    if (!NON_EMPTY(input.authorizationRequestId)) {
      return {
        ok: false,
        error: validationError(
          "authorizationRequestId es obligatorio para method=staff_manual.",
          "authorizationRequestId",
        ),
      };
    }
    request = state.authorizationRequests.find(
      (r) => r.id === input.authorizationRequestId && r.organizationId === ctx.organizationId,
    );
    if (!request) return { ok: false, error: notFoundError() };
    if (!["prepared", "sent", "viewed"].includes(request.status)) {
      return {
        ok: false,
        error: conflictError(
          `Esta solicitud ya no admite una decisión (estado: ${request.status}).`,
        ),
      };
    }
    decisionMethod = "staff_manual";
    audienceCustomerId = request.audienceCustomerId;
  }

  if (!request) return { ok: false, error: notFoundError() };
  const req = request;

  if (req.quoteVersionId !== input.quoteVersionId) {
    return {
      ok: false,
      error: validationError("quoteVersionId no corresponde a esta solicitud.", "quoteVersionId"),
    };
  }

  const version = workingState.quoteVersions.find(
    (v) => v.id === req.quoteVersionId && v.organizationId === req.organizationId,
  );
  if (!version) return { ok: false, error: notFoundError() };
  if (version.status !== "frozen") {
    return {
      ok: false,
      error: conflictError(
        `La versión ya no está vigente para decidir (estado: ${version.status}).`,
      ),
    };
  }
  if (version.snapshotHash !== input.quoteVersionHash) {
    return {
      ok: false,
      error: conflictError("El hash enviado no coincide con la versión congelada vigente."),
    };
  }

  const items = workingState.quoteItems.filter((i) => i.quoteVersionId === version.id);
  if (items.length === 0) {
    return { ok: false, error: conflictError("La versión no tiene líneas para decidir.") };
  }

  let acceptedIds: Set<string>;
  if (input.decision === "accept_all") {
    acceptedIds = new Set(items.map((i) => i.id));
  } else if (input.decision === "reject") {
    acceptedIds = new Set();
  } else {
    const requested = input.acceptedQuoteItemIds ?? [];
    if (requested.length === 0) {
      return {
        ok: false,
        error: validationError(
          "acceptedQuoteItemIds es obligatorio y no puede estar vacío para decision=partial.",
          "acceptedQuoteItemIds",
        ),
      };
    }
    const validIds = new Set(items.map((i) => i.id));
    for (const id of requested) {
      if (!validIds.has(id)) {
        return {
          ok: false,
          error: validationError(
            `"${id}" no es una línea de esta versión.`,
            "acceptedQuoteItemIds",
          ),
        };
      }
    }
    acceptedIds = new Set(requested);
  }

  const authorizationId = cryptoRandomId();
  const decidedAt = ctx.now.toISOString();

  const authorizationItems: AuthorizationItemRow[] = items.map((item) => {
    const accepted = acceptedIds.has(item.id);
    return {
      id: cryptoRandomId(),
      organizationId: req.organizationId,
      authorizationId,
      quoteVersionId: version.id,
      quoteItemId: item.id,
      descriptionSnapshot: item.description,
      quantitySnapshot: item.quantity,
      unitPriceMinorSnapshot: item.unitPriceMinor,
      currencySnapshot: item.currency,
      decision: accepted ? "accepted" : "rejected",
      acceptedQuantity: accepted ? item.quantity : null,
      rejectionReason: accepted ? null : (input.rejectionReason ?? null),
      decidedAt,
    };
  });

  const acceptedCount = authorizationItems.filter((i) => i.decision === "accepted").length;
  const status =
    acceptedCount === 0
      ? "rejected"
      : acceptedCount === items.length
        ? "accepted"
        : "partially_accepted";

  const authorization: AuthorizationRow = {
    id: authorizationId,
    organizationId: req.organizationId,
    caseId: req.caseId,
    authorizationRequestId: req.id,
    quoteVersionId: version.id,
    // Already verified equal to `version.snapshotHash` above — using the
    // input value directly avoids a non-null assertion on a field TS still
    // types as `string | null` at the version-row level.
    quoteVersionHash: input.quoteVersionHash,
    status,
    actorId: decisionActorId,
    audienceCustomerId: audienceCustomerId ?? req.audienceCustomerId,
    method: decisionMethod,
    rejectionReason: status === "rejected" ? (input.rejectionReason ?? null) : null,
    decidedAt,
    invalidatedAt: null,
    invalidatedReason: null,
    invalidatedBy: null,
    createdAt: decidedAt,
  };

  const updatedRequest: AuthorizationRequestRow = {
    ...req,
    status: "decided",
    decidedAt,
    authorizationId,
  };

  const updatedToken = consumedToken ? { ...consumedToken, usedAt: decidedAt } : undefined;

  const decidedEvent = {
    id: cryptoRandomId(),
    organizationId: req.organizationId,
    caseId: req.caseId,
    authorizationRequestId: req.id,
    authorizationId,
    eventType: "decided" as const,
    details: { status, method: decisionMethod },
    actorId: decisionActorId,
    occurredAt: decidedAt,
    createdAt: decidedAt,
  };

  const kase = workingState.cases.find(
    (c) => c.id === req.caseId && c.organizationId === req.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  // Accept (total or partial) -> ready. Total rejection -> closed.
  // DATATEK_R0_A sección 5.1 already models both edges from
  // `waiting_authorization`; this reuses the real `TransitionCase` command
  // (sección "usa el comando TransitionCase que ya existe") instead of
  // writing to `cases`/`case_status_events` by hand.
  const toStatus: CaseStatus = status === "rejected" ? "closed" : "ready";
  const transitionCheck = resolveCaseTransition(kase.status, toStatus);
  let updatedCase = kase;
  let stateAfterAuthorization: CrmVehicleState = {
    ...workingState,
    authorizations: [...workingState.authorizations, authorization],
    authorizationItems: [...workingState.authorizationItems, ...authorizationItems],
    authorizationRequests: workingState.authorizationRequests.map((r) =>
      r.id === updatedRequest.id ? updatedRequest : r,
    ),
    authorizationAccessTokens: updatedToken
      ? workingState.authorizationAccessTokens.map((t) =>
          t.id === updatedToken.id ? updatedToken : t,
        )
      : workingState.authorizationAccessTokens,
    authorizationEvents: [...workingState.authorizationEvents, decidedEvent],
  };

  if (transitionCheck.ok) {
    const transitionResult = transitionCase(
      stateAfterAuthorization,
      systemCaseTransitionContext(ctx),
      {
        caseId: kase.id,
        toStatus,
        reason:
          status === "rejected"
            ? "Cliente rechazó la cotización — autorización decidida"
            : "Cliente autorizó la cotización — caso listo para reparación",
      },
    );
    if (transitionResult.ok) {
      stateAfterAuthorization = transitionResult.nextState;
      updatedCase = transitionResult.data;
    }
    // If the case somehow cannot transition (e.g. already moved by another
    // path concurrently) the authorization decision itself still stands —
    // it is the source of truth; the case status is best-effort here and a
    // later reconciliation step (outside R0-D Fase 3 scope) would surface
    // the mismatch instead of silently discarding the customer's decision.
  }

  const output: RecordAuthorizationOutput = {
    authorization,
    items: authorizationItems,
    case: updatedCase,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_RECORD_AUTHORIZATION,
    "Autorización registrada",
    {
      requestId: req.id,
      authorizationId,
      status,
      method: decisionMethod,
    },
  );

  const nextState: CrmVehicleState = {
    ...stateAfterAuthorization,
    idempotencyRecords: [
      ...stateAfterAuthorization.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_RECORD_AUTHORIZATION, output),
    ],
    auditLog: [...stateAfterAuthorization.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- InvalidateAuthorization -------------------------------------------------
// "invalidated no borra la decisión — agrega causa y evento, la
// autorización sigue existiendo en el historial" (sección 5.6).

export interface InvalidateAuthorizationInput {
  authorizationId: string;
  reason: string;
}

const COMMAND_INVALIDATE_AUTHORIZATION = "InvalidateAuthorization";

export function invalidateAuthorization(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: InvalidateAuthorizationInput,
): CommandOutcome<AuthorizationRow> {
  const replay = findIdempotentReplay<AuthorizationRow>(
    state,
    ctx,
    COMMAND_INVALIDATE_AUTHORIZATION,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, DECIDE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const authorization = state.authorizations.find(
    (a) => a.id === input.authorizationId && a.organizationId === ctx.organizationId,
  );
  if (!authorization) return { ok: false, error: notFoundError() };
  if (authorization.status === "invalidated") {
    return { ok: false, error: conflictError("Esta autorización ya está invalidada.") };
  }
  if (!NON_EMPTY(input.reason)) {
    return { ok: false, error: validationError("reason es obligatorio.", "reason") };
  }

  // The original decision (status prior to invalidation, all
  // authorization_items) is left untouched in history — only these fields
  // change, append-only in spirit (nothing is deleted or overwritten).
  const updated: AuthorizationRow = {
    ...authorization,
    status: "invalidated",
    invalidatedAt: ctx.now.toISOString(),
    invalidatedReason: input.reason.trim(),
    invalidatedBy: ctx.actorId,
  };

  const event = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: authorization.caseId,
    authorizationRequestId: authorization.authorizationRequestId,
    authorizationId: authorization.id,
    eventType: "invalidated" as const,
    details: { reason: input.reason.trim() },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_INVALIDATE_AUTHORIZATION,
    "Autorización invalidada",
    {
      authorizationId: authorization.id,
      reason: input.reason,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    authorizations: state.authorizations.map((a) => (a.id === authorization.id ? updated : a)),
    authorizationEvents: [...state.authorizationEvents, event],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_INVALIDATE_AUTHORIZATION, updated),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: updated, replayed: false };
}

// --- RevokeAndReprepareAuthorizationRequest ---------------------------------
// Fase 4a — closes the Fase 3 finding recorded in
// docs/domain/authorization-security.md: `PrepareAuthorizationRequest`
// cannot be called a second time once the case is already
// `waiting_authorization` (there is no `waiting_authorization ->
// waiting_authorization` edge in
// `packages/domain/src/case/case-transitions.ts`), so there was previously
// no way to hand a customer a genuinely FRESH link — the only documented
// recovery was `RecordAuthorization` with `method: "staff_manual"` on the
// SAME (possibly blocked/expiring) request, which lets staff decide FOR the
// customer but never gives the customer a link they can use themselves
// again.
//
// Name: `RevokeAndReprepareAuthorizationRequest` (over the
// `ReissueAuthorizationToken` alternative sketched in
// authorization-security.md) because the effect is broader than "just a new
// token" — it revokes and replaces the whole `authorization_requests` row,
// mirroring `CreateQuoteVersion`'s own revoke-then-continue pattern for
// requests superseded by a new version (quote-commands.ts). That is what
// lets the reissued link carry its own fresh `expiresAt`/`allowedMethods`/
// `scope`, independent of the request it replaces, instead of only rotating
// a secret underneath an unchanged request row.
//
// Gated by the `authorization_reissue` feature flag (ola `0086`,
// `isFeatureEnabled` in state.ts) — the one "real y comprobable" flag this
// phase ships, proven by the "disabled for this org" test below, not just
// declared in schema.
export interface RevokeAndReprepareAuthorizationRequestInput {
  authorizationRequestId: string;
  /** Why the old request/token is being killed — "cliente perdió el
   * enlace", "token bloqueado tras 5 intentos", "vigencia por vencer", etc.
   * Required, same precedent as `InvalidateAuthorizationInput.reason`. */
  reason: string;
  allowedMethods?: AuthorizationAccessMethod[];
  scope?: AuthorizationTokenScope;
  expiresInMinutes?: number;
  verificationMethod?: string;
}

export interface RevokeAndReprepareAuthorizationRequestOutput {
  revokedRequest: AuthorizationRequestRow;
  request: AuthorizationRequestRow;
  token: AuthorizationAccessTokenRow;
  /** Same one-time-visible rule as `PrepareAuthorizationRequestOutput.
   * plainToken` — never persisted, never logged. */
  plainToken: string;
  case: CaseRow;
}

const COMMAND_REVOKE_AND_REPREPARE_AUTHORIZATION_REQUEST = "RevokeAndReprepareAuthorizationRequest";

/** Statuses a request can be revoked-and-reissued FROM — anything not yet
 * `decided`/already `expired`/already `revoked`. Same concept
 * `CreateQuoteVersion` uses (quote-commands.ts, `pendingStatuses`) to decide
 * which requests a new version supersedes: "vigente" means the same thing
 * in both places — no decision has been consumed against it yet. Declared
 * as `Set<string>` (not `Set<AuthorizationRequestStatus>`) purely to avoid
 * importing a type this file otherwise never needs — `.has()` still only
 * ever receives an `AuthorizationRequestStatus` value below. */
const LIVE_REQUEST_STATUSES = new Set<string>(["prepared", "sent", "viewed"]);

export function revokeAndReprepareAuthorizationRequest(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RevokeAndReprepareAuthorizationRequestInput,
): CommandOutcome<RevokeAndReprepareAuthorizationRequestOutput> {
  const replay = findIdempotentReplay<RevokeAndReprepareAuthorizationRequestOutput>(
    state,
    ctx,
    COMMAND_REVOKE_AND_REPREPARE_AUTHORIZATION_REQUEST,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, REQUEST_PERMISSION);
  if (permError) return { ok: false, error: permError };

  if (!isFeatureEnabled(state, ctx.organizationId, FEATURE_KEY_AUTHORIZATION_REISSUE)) {
    return {
      ok: false,
      error: conflictError(
        "La función de reenvío de solicitudes de autorización está deshabilitada para esta organización.",
      ),
    };
  }

  if (!NON_EMPTY(input.reason)) {
    return { ok: false, error: validationError("reason es obligatorio.", "reason") };
  }

  const oldRequest = state.authorizationRequests.find(
    (r) => r.id === input.authorizationRequestId && r.organizationId === ctx.organizationId,
  );
  if (!oldRequest) return { ok: false, error: notFoundError() };
  if (!LIVE_REQUEST_STATUSES.has(oldRequest.status)) {
    return {
      ok: false,
      error: conflictError(
        `Solo una solicitud vigente (prepared/sent/viewed) puede revocarse y reenviarse (estado actual: ${oldRequest.status}).`,
      ),
    };
  }

  const version = state.quoteVersions.find(
    (v) => v.id === oldRequest.quoteVersionId && v.organizationId === ctx.organizationId,
  );
  if (!version) return { ok: false, error: notFoundError() };
  if (version.status !== "frozen") {
    return {
      ok: false,
      error: conflictError(
        `La versión ya no está congelada vigente (estado: ${version.status}) — no se puede reenviar sobre ella.`,
      ),
    };
  }

  const kase = state.cases.find(
    (c) => c.id === oldRequest.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  const expiresInMinutes = input.expiresInMinutes ?? DEFAULT_REQUEST_TTL_MINUTES;
  if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) {
    return {
      ok: false,
      error: validationError("expiresInMinutes debe ser positivo.", "expiresInMinutes"),
    };
  }
  const expiresAt = new Date(ctx.now.getTime() + expiresInMinutes * 60_000).toISOString();
  const revokedAt = ctx.now.toISOString();
  const trimmedReason = input.reason.trim();

  const revokedRequest: AuthorizationRequestRow = {
    ...oldRequest,
    status: "revoked",
    revokedAt,
    revokedReason: trimmedReason,
  };

  const newRequest: AuthorizationRequestRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: oldRequest.caseId,
    quoteVersionId: oldRequest.quoteVersionId,
    audienceCustomerId: oldRequest.audienceCustomerId,
    status: "prepared",
    allowedMethods: input.allowedMethods ?? oldRequest.allowedMethods,
    expiresAt,
    preparedAt: ctx.now.toISOString(),
    preparedBy: ctx.actorId,
    sentAt: null,
    sentBy: null,
    sentChannel: null,
    sentResult: null,
    viewedAt: null,
    decidedAt: null,
    authorizationId: null,
    revokedAt: null,
    revokedReason: null,
    supersededByQuoteVersionId: null,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const tokenId = cryptoRandomId();
  const secret = randomBytes(32).toString("base64url");
  const plainToken = `${tokenId}.${secret}`;

  const token: AuthorizationAccessTokenRow = {
    id: tokenId,
    organizationId: ctx.organizationId,
    authorizationRequestId: newRequest.id,
    tokenHash: sha256Hex(secret),
    scope: input.scope ?? "read_and_decide",
    audienceCustomerId: oldRequest.audienceCustomerId,
    verificationMethod: input.verificationMethod ?? "manual_local_adapter",
    expiresAt,
    verifiedAt: null,
    usedAt: null,
    revokedAt: null,
    lockedAt: null,
    attemptCount: 0,
    maxAttempts: MAX_TOKEN_ATTEMPTS,
    nonce: randomBytes(16).toString("hex"),
    idempotencyKey: ctx.idempotencyKey,
    createdAt: ctx.now.toISOString(),
  };

  // The old token(s) for the revoked request die too — "el token viejo deja
  // de servir" is not automatically true just because the REQUEST moved to
  // `revoked`: `resolveToken` (above) never reads `request.status`, only
  // the token row's own revoked/locked/used/expired fields. Without this,
  // a still-valid old secret would keep resolving even though its parent
  // request is dead.
  const updatedTokens = state.authorizationAccessTokens.map((t) =>
    t.authorizationRequestId === oldRequest.id && t.revokedAt == null ? { ...t, revokedAt } : t,
  );

  const revokedEvent: AuthorizationEventRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: oldRequest.caseId,
    authorizationRequestId: oldRequest.id,
    authorizationId: null,
    eventType: "revoked",
    details: { reason: trimmedReason, reissuedAsRequestId: newRequest.id },
    actorId: ctx.actorId,
    occurredAt: revokedAt,
    createdAt: revokedAt,
  };
  const preparedEvent: AuthorizationEventRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: newRequest.caseId,
    authorizationRequestId: newRequest.id,
    authorizationId: null,
    eventType: "prepared",
    details: { quoteVersionId: version.id, expiresAt, reissuedFromRequestId: oldRequest.id },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const output: RevokeAndReprepareAuthorizationRequestOutput = {
    revokedRequest,
    request: newRequest,
    token,
    plainToken,
    case: kase,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_REVOKE_AND_REPREPARE_AUTHORIZATION_REQUEST,
    "Solicitud de autorización revocada y reenviada",
    { revokedRequestId: oldRequest.id, newRequestId: newRequest.id, quoteVersionId: version.id },
  );

  const nextState: CrmVehicleState = {
    ...state,
    authorizationRequests: [
      ...state.authorizationRequests.map((r) => (r.id === oldRequest.id ? revokedRequest : r)),
      newRequest,
    ],
    authorizationAccessTokens: [...updatedTokens, token],
    authorizationEvents: [...state.authorizationEvents, revokedEvent, preparedEvent],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_REVOKE_AND_REPREPARE_AUTHORIZATION_REQUEST, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}
