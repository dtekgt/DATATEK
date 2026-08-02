// Quote commands — DATATEK_R0_D sección 11, DATATEK_R0_A sección 9.
//
// `CreateQuote`, `CreateQuoteVersion`, `AddQuoteItem`, `UpdateDraftQuoteItem`,
// `FreezeQuoteVersion`. Authorization-request/decision commands live in
// `authorization-commands.ts` — this file only owns the quote/version/item
// lifecycle up to `frozen`.
//
// `FreezeQuoteVersion` never reimplements the snapshot/hash algorithm — it
// only gathers `quote_items` into `packages/domain`'s `buildQuoteSnapshot`
// and persists what that pure function returns, exactly like
// `CompleteInspection` defers to `evaluateBrakesCompletionGate`.
import { DomainInvariantError, isTerminalCaseStatus, type Visibility } from "@datatek/domain";
// Server-only subpath — see the comment in packages/domain/src/index.ts on
// why quote-snapshot.ts (imports `node:crypto`) is not in the main barrel.
import { buildQuoteSnapshot } from "@datatek/domain/quote-snapshot";
import {
  requirePermission,
  validationError,
  notFoundError,
  conflictError,
  type CommandContext,
} from "./context.ts";
import {
  appendAuditEvent,
  appendIdempotencyRecord,
  cryptoRandomId,
  findIdempotentReplay,
  type CommandOutcome,
  type CrmVehicleState,
  type QuoteRow,
  type QuoteVersionRow,
  type QuoteItemRow,
  type QuoteLineType,
  type QuoteItemSourceType,
  type AuthorizationRequestRow,
  type AuthorizationAccessTokenRow,
  type AuthorizationEventRow,
} from "./state.ts";

const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;
const QUOTE_PERMISSION = "quote.manage" as const;
const DEFAULT_CURRENCY = "GTQ";

// --- CreateQuote -------------------------------------------------------------

export interface CreateQuoteInput {
  caseId: string;
}

const COMMAND_CREATE_QUOTE = "CreateQuote";

export function createQuote(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateQuoteInput,
): CommandOutcome<QuoteRow> {
  const replay = findIdempotentReplay<QuoteRow>(state, ctx, COMMAND_CREATE_QUOTE);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, QUOTE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };
  if (isTerminalCaseStatus(kase.status)) {
    return {
      ok: false,
      error: conflictError(`No se puede cotizar un caso en estado terminal (${kase.status}).`),
    };
  }

  const quote: QuoteRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_CREATE_QUOTE, "Cotización creada", {
    caseId: kase.id,
    quoteId: quote.id,
  });

  const nextState: CrmVehicleState = {
    ...state,
    quotes: [...state.quotes, quote],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_QUOTE, quote),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: quote, replayed: false };
}

// --- CreateQuoteVersion -------------------------------------------------------
// A quote can gain many versions over time. A new version supersedes the
// prior FROZEN one (sección 11: "una nueva versión puede marcar la anterior
// superseded") and revokes any of ITS still-pending authorization requests
// (sección 5.5: "una nueva quote version revoca solicitudes pendientes de la
// anterior") — never leaving them orphaned pointing at a replaced version.

export interface CreateQuoteVersionInput {
  quoteId: string;
  currency?: string;
}

export interface CreateQuoteVersionOutput {
  version: QuoteVersionRow;
  supersededVersionId: string | null;
  revokedRequestIds: string[];
}

const COMMAND_CREATE_QUOTE_VERSION = "CreateQuoteVersion";

export function createQuoteVersion(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateQuoteVersionInput,
): CommandOutcome<CreateQuoteVersionOutput> {
  const replay = findIdempotentReplay<CreateQuoteVersionOutput>(
    state,
    ctx,
    COMMAND_CREATE_QUOTE_VERSION,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, QUOTE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const quote = state.quotes.find(
    (q) => q.id === input.quoteId && q.organizationId === ctx.organizationId,
  );
  if (!quote) return { ok: false, error: notFoundError() };

  const currency = input.currency ?? DEFAULT_CURRENCY;
  if (!/^[A-Z]{3}$/.test(currency)) {
    return {
      ok: false,
      error: validationError("currency debe ser un código ISO de 3 letras.", "currency"),
    };
  }

  const existingVersions = state.quoteVersions.filter((v) => v.quoteId === quote.id);
  const versionNumber = existingVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;

  const version: QuoteVersionRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    quoteId: quote.id,
    caseId: quote.caseId,
    versionNumber,
    status: "draft",
    currency,
    subtotalMinor: 0,
    totalMinor: 0,
    snapshotHash: null,
    snapshotJson: null,
    frozenAt: null,
    frozenBy: null,
    supersededAt: null,
    supersededByVersionId: null,
    voidedAt: null,
    voidedReason: null,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  // Supersede the prior frozen version, if any (a quote normally has at
  // most one "current" frozen version, but this handles the general case).
  const priorFrozen = existingVersions.filter((v) => v.status === "frozen");
  const supersededIds = new Set(priorFrozen.map((v) => v.id));
  const updatedVersions = state.quoteVersions.map((v) =>
    supersededIds.has(v.id)
      ? {
          ...v,
          status: "superseded" as const,
          supersededAt: ctx.now.toISOString(),
          supersededByVersionId: version.id,
        }
      : v,
  );

  // Revoke pending authorization requests (prepared/sent/viewed) that
  // pointed at a version we just superseded, and their still-live tokens.
  const pendingStatuses = new Set(["prepared", "sent", "viewed"]);
  const requestsToRevoke = state.authorizationRequests.filter(
    (r) =>
      supersededIds.has(r.quoteVersionId) &&
      r.organizationId === ctx.organizationId &&
      pendingStatuses.has(r.status),
  );
  const revokedRequestIds = requestsToRevoke.map((r) => r.id);
  const revokedRequestIdSet = new Set(revokedRequestIds);

  const updatedRequests: AuthorizationRequestRow[] = state.authorizationRequests.map((r) =>
    revokedRequestIdSet.has(r.id)
      ? {
          ...r,
          status: "revoked" as const,
          revokedAt: ctx.now.toISOString(),
          revokedReason: "Sustituida por una nueva versión de la cotización.",
          supersededByQuoteVersionId: version.id,
        }
      : r,
  );

  const updatedTokens: AuthorizationAccessTokenRow[] = state.authorizationAccessTokens.map((t) =>
    revokedRequestIdSet.has(t.authorizationRequestId) && t.revokedAt == null
      ? { ...t, revokedAt: ctx.now.toISOString() }
      : t,
  );

  const supersededEvents: AuthorizationEventRow[] = requestsToRevoke.map((r) => ({
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: r.caseId,
    authorizationRequestId: r.id,
    authorizationId: null,
    eventType: "superseded",
    details: { newQuoteVersionId: version.id },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  }));

  const output: CreateQuoteVersionOutput = {
    version,
    supersededVersionId: priorFrozen[0]?.id ?? null,
    revokedRequestIds,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CREATE_QUOTE_VERSION,
    "Nueva versión de cotización creada",
    { quoteId: quote.id, versionId: version.id, versionNumber, revokedRequestIds },
  );

  const nextState: CrmVehicleState = {
    ...state,
    quoteVersions: [...updatedVersions, version],
    authorizationRequests: updatedRequests,
    authorizationAccessTokens: updatedTokens,
    authorizationEvents: [...state.authorizationEvents, ...supersededEvents],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_QUOTE_VERSION, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- Shared draft-mutation guard -----------------------------------------

type EditableVersionResult =
  { ok: true; version: QuoteVersionRow } | { ok: false; error: ReturnType<typeof notFoundError> };

function findEditableVersion(
  state: CrmVehicleState,
  organizationId: string,
  quoteVersionId: string,
): EditableVersionResult {
  const version = state.quoteVersions.find(
    (v) => v.id === quoteVersionId && v.organizationId === organizationId,
  );
  if (!version) return { ok: false, error: notFoundError() };
  if (version.status !== "draft") {
    return {
      ok: false,
      error: conflictError(
        `La versión ${version.versionNumber} ya no es editable (estado: ${version.status}). Crea una nueva versión.`,
      ),
    };
  }
  return { ok: true, version };
}

function recomputeDraftTotals(state: CrmVehicleState, versionId: string): CrmVehicleState {
  const version = state.quoteVersions.find((v) => v.id === versionId);
  if (!version) return state;
  const items = state.quoteItems.filter((i) => i.quoteVersionId === versionId);
  const totalMinor = items.reduce((sum, i) => sum + i.totalMinor, 0);
  return {
    ...state,
    quoteVersions: state.quoteVersions.map((v) =>
      v.id === versionId ? { ...v, subtotalMinor: totalMinor, totalMinor } : v,
    ),
  };
}

// --- AddQuoteItem -------------------------------------------------------------

export interface AddQuoteItemInput {
  quoteVersionId: string;
  lineType: QuoteLineType;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  visibility?: Visibility;
  requiresAuthorization?: boolean;
  sourceType?: QuoteItemSourceType | null;
  sourceId?: string | null;
  displayOrder?: number;
}

const COMMAND_ADD_QUOTE_ITEM = "AddQuoteItem";

export function addQuoteItem(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: AddQuoteItemInput,
): CommandOutcome<QuoteItemRow> {
  const replay = findIdempotentReplay<QuoteItemRow>(state, ctx, COMMAND_ADD_QUOTE_ITEM);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, QUOTE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const editable = findEditableVersion(state, ctx.organizationId, input.quoteVersionId);
  if (!editable.ok) return { ok: false, error: editable.error };
  const v = editable.version;

  if (!NON_EMPTY(input.description)) {
    return { ok: false, error: validationError("description es obligatoria.", "description") };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return {
      ok: false,
      error: validationError("quantity debe ser un número positivo.", "quantity"),
    };
  }
  if (!Number.isInteger(input.unitPriceMinor) || input.unitPriceMinor < 0) {
    return {
      ok: false,
      error: validationError(
        "unitPriceMinor debe ser un entero no negativo en unidades menores.",
        "unitPriceMinor",
      ),
    };
  }
  if (input.currency !== v.currency) {
    return {
      ok: false,
      error: validationError(
        `La línea debe usar la moneda de la versión (${v.currency}).`,
        "currency",
      ),
    };
  }
  if (input.sourceType === "finding" && input.sourceId) {
    const finding = state.findings.find(
      (f) => f.id === input.sourceId && f.organizationId === ctx.organizationId,
    );
    if (!finding) return { ok: false, error: notFoundError() };
  }
  if (input.sourceType === "recommendation" && input.sourceId) {
    const rec = state.maintenanceRecommendations.find(
      (r) => r.id === input.sourceId && r.organizationId === ctx.organizationId,
    );
    if (!rec) return { ok: false, error: notFoundError() };
  }

  const totalMinor = Math.round(input.quantity * input.unitPriceMinor);

  const item: QuoteItemRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    quoteVersionId: v.id,
    lineType: input.lineType,
    description: input.description.trim(),
    quantity: input.quantity,
    unitPriceMinor: input.unitPriceMinor,
    currency: input.currency,
    totalMinor,
    visibility: input.visibility ?? "customer",
    requiresAuthorization: input.requiresAuthorization ?? true,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    displayOrder:
      input.displayOrder ?? state.quoteItems.filter((i) => i.quoteVersionId === v.id).length,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
    updatedAt: ctx.now.toISOString(),
    updatedBy: ctx.actorId,
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_ADD_QUOTE_ITEM, "Línea de cotización agregada", {
    quoteVersionId: v.id,
    quoteItemId: item.id,
  });

  let nextState: CrmVehicleState = {
    ...state,
    quoteItems: [...state.quoteItems, item],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_ADD_QUOTE_ITEM, item),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };
  nextState = recomputeDraftTotals(nextState, v.id);

  return { ok: true, nextState, data: item, replayed: false };
}

// --- UpdateDraftQuoteItem ------------------------------------------------------

export interface UpdateDraftQuoteItemInput {
  quoteItemId: string;
  description?: string;
  quantity?: number;
  unitPriceMinor?: number;
  visibility?: Visibility;
  requiresAuthorization?: boolean;
  displayOrder?: number;
}

const COMMAND_UPDATE_DRAFT_QUOTE_ITEM = "UpdateDraftQuoteItem";

export function updateDraftQuoteItem(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: UpdateDraftQuoteItemInput,
): CommandOutcome<QuoteItemRow> {
  const replay = findIdempotentReplay<QuoteItemRow>(state, ctx, COMMAND_UPDATE_DRAFT_QUOTE_ITEM);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, QUOTE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const item = state.quoteItems.find(
    (i) => i.id === input.quoteItemId && i.organizationId === ctx.organizationId,
  );
  if (!item) return { ok: false, error: notFoundError() };

  // "Draft editable; una vez frozen, quote_version es inmutable — cualquier
  // intento de editar una versión frozen falla con error de dominio."
  const editable = findEditableVersion(state, ctx.organizationId, item.quoteVersionId);
  if (!editable.ok) return { ok: false, error: editable.error };

  if (input.description != null && !NON_EMPTY(input.description)) {
    return {
      ok: false,
      error: validationError("description no puede quedar vacía.", "description"),
    };
  }
  if (input.quantity != null && (!Number.isFinite(input.quantity) || input.quantity <= 0)) {
    return {
      ok: false,
      error: validationError("quantity debe ser un número positivo.", "quantity"),
    };
  }
  if (
    input.unitPriceMinor != null &&
    (!Number.isInteger(input.unitPriceMinor) || input.unitPriceMinor < 0)
  ) {
    return {
      ok: false,
      error: validationError("unitPriceMinor debe ser un entero no negativo.", "unitPriceMinor"),
    };
  }

  const quantity = input.quantity ?? item.quantity;
  const unitPriceMinor = input.unitPriceMinor ?? item.unitPriceMinor;

  const updated: QuoteItemRow = {
    ...item,
    description: input.description != null ? input.description.trim() : item.description,
    quantity,
    unitPriceMinor,
    totalMinor: Math.round(quantity * unitPriceMinor),
    visibility: input.visibility ?? item.visibility,
    requiresAuthorization: input.requiresAuthorization ?? item.requiresAuthorization,
    displayOrder: input.displayOrder ?? item.displayOrder,
    updatedAt: ctx.now.toISOString(),
    updatedBy: ctx.actorId,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_UPDATE_DRAFT_QUOTE_ITEM,
    "Línea de cotización (draft) editada",
    { quoteItemId: item.id, quoteVersionId: item.quoteVersionId },
  );

  let nextState: CrmVehicleState = {
    ...state,
    quoteItems: state.quoteItems.map((i) => (i.id === item.id ? updated : i)),
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_UPDATE_DRAFT_QUOTE_ITEM, updated),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };
  nextState = recomputeDraftTotals(nextState, item.quoteVersionId);

  return { ok: true, nextState, data: updated, replayed: false };
}

// --- FreezeQuoteVersion ---------------------------------------------------------
// DATATEK_R0_A sección 9.2, literal: revalida estado/expected version,
// recalcula desde líneas, construye snapshot canónico, serializa
// determinista, genera SHA-256, fija frozen_at, cambia a frozen. Freeze
// NEVER marks a request `sent` (sección 9.2: "No cambia request a sent") —
// this command does not touch `authorization_requests` at all.

export interface FreezeQuoteVersionInput {
  quoteVersionId: string;
  /** Optimistic-concurrency guard standing in for the real transaction lock
   * sección 9.2 describes ("bloquea quote/version; expected version") —
   * this in-memory engine has no row lock, so a caller that read the
   * version at `versionNumber` N can pass it here and get a `CONFLICT` if
   * someone else already mutated it. */
  expectedVersionNumber?: number;
}

const COMMAND_FREEZE_QUOTE_VERSION = "FreezeQuoteVersion";

export function freezeQuoteVersion(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: FreezeQuoteVersionInput,
): CommandOutcome<QuoteVersionRow> {
  const replay = findIdempotentReplay<QuoteVersionRow>(state, ctx, COMMAND_FREEZE_QUOTE_VERSION);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, QUOTE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const version = state.quoteVersions.find(
    (v) => v.id === input.quoteVersionId && v.organizationId === ctx.organizationId,
  );
  if (!version) return { ok: false, error: notFoundError() };
  if (version.status !== "draft") {
    return {
      ok: false,
      error: conflictError(
        `Solo una versión 'draft' puede congelarse (estado actual: ${version.status}).`,
      ),
    };
  }
  if (
    input.expectedVersionNumber != null &&
    input.expectedVersionNumber !== version.versionNumber
  ) {
    return {
      ok: false,
      error: conflictError(
        "La versión cambió desde que se leyó (expectedVersionNumber no coincide).",
      ),
    };
  }

  const items = state.quoteItems.filter((i) => i.quoteVersionId === version.id);

  let snapshot;
  try {
    snapshot = buildQuoteSnapshot({
      organizationId: version.organizationId,
      caseId: version.caseId,
      currency: version.currency,
      items: items.map((i) => ({
        lineType: i.lineType,
        description: i.description,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
        currency: i.currency,
        visibility: i.visibility,
        requiresAuthorization: i.requiresAuthorization,
        sourceType: i.sourceType,
        sourceId: i.sourceId,
        displayOrder: i.displayOrder,
      })),
    });
  } catch (err) {
    if (err instanceof DomainInvariantError) {
      return { ok: false, error: validationError(err.message, err.field) };
    }
    throw err;
  }

  const frozen: QuoteVersionRow = {
    ...version,
    status: "frozen",
    subtotalMinor: snapshot.subtotalMinor,
    totalMinor: snapshot.totalMinor,
    snapshotHash: snapshot.hash,
    snapshotJson: snapshot.canonicalJson,
    frozenAt: ctx.now.toISOString(),
    frozenBy: ctx.actorId,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_FREEZE_QUOTE_VERSION,
    "Versión de cotización congelada",
    {
      quoteVersionId: version.id,
      hash: snapshot.hash,
      totalMinor: snapshot.totalMinor,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    quoteVersions: state.quoteVersions.map((v) => (v.id === version.id ? frozen : v)),
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_FREEZE_QUOTE_VERSION, frozen),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: frozen, replayed: false };
}
