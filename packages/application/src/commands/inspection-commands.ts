// Inspection and evidence commands — DATATEK_R0_D sección 9 y 10.
//
// `StartInspection`, `RecordInspectionResult`, `RecordMeasurement`,
// `RecordFinding`, `CreateMaintenanceRecommendation`, `CreateUploadIntent`,
// `ConfirmEvidenceUpload`, `LinkEvidence`, `CompleteInspection`.
//
// `CompleteInspection` never reimplements the gate — it only gathers state
// into `packages/domain`'s `evaluateBrakesCompletionGate` and reports its
// verdict. `StartInspection` fixes the template version from
// `packages/domain/src/inspection/brakes-template.ts`. `LinkEvidence` reuses
// `effectiveEvidenceVisibility` from `packages/domain/src/evidence/visibility.ts`
// so "un link incorrecto no puede volver pública una evidencia interna"
// (sección 8.3) is computed by domain code, not re-derived here.
import {
  resolveCaseTransition,
  createMeasurement,
  DomainInvariantError,
  assertValidMaintenanceRecommendationDraft,
  effectiveEvidenceVisibility,
  evaluateBrakesCompletionGate,
  findBrakeItemDef,
  BRAKES_TEMPLATE_KEY,
  BRAKES_TEMPLATE_VERSION,
  type RecordedBrakeResult,
  type RecordedBrakeMeasurement,
  type MaintenanceTriggerKind,
  type MaintenanceBasisKind,
  type MaintenanceStatus,
  type Provenance,
  type Visibility,
  type BrakeAxle,
  type BrakeSide,
  type BrakeCondition,
} from "@datatek/domain";
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
  type InspectionRow,
  type InspectionResultRow,
  type MeasurementRow,
  type FindingRow,
  type FindingUrgency,
  type MaintenanceRecommendationRow,
  type UploadIntentRow,
  type UploadIntentStatus,
  type EvidenceAssetRow,
  type EvidenceLinkRow,
  type EvidenceEntityType,
  type CaseRow,
} from "./state.ts";

const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;
const INSPECTION_PERMISSION = "inspection.publish" as const;
const EVIDENCE_PERMISSION = "evidence.upload" as const;

// --- StartInspection -----------------------------------------------------------
// One of the three named commands that call `resolveCaseTransition`
// internally (see `packages/domain/src/case/case-transitions.ts`) — requires
// the case to currently be `received`.

export interface StartInspectionInput {
  caseId: string;
  odometerKmAtInspection?: number | null;
}

export interface StartInspectionOutput {
  inspection: InspectionRow;
  case: CaseRow;
}

const COMMAND_START_INSPECTION = "StartInspection";

export function startInspection(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: StartInspectionInput,
): CommandOutcome<StartInspectionOutput> {
  const replay = findIdempotentReplay<StartInspectionOutput>(state, ctx, COMMAND_START_INSPECTION);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, INSPECTION_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  const check = resolveCaseTransition(kase.status, "inspection");
  if (!check.ok) {
    return {
      ok: false,
      error: conflictError(check.reason ?? "El caso no puede iniciar inspección en este estado."),
    };
  }

  if (
    input.odometerKmAtInspection != null &&
    (!Number.isInteger(input.odometerKmAtInspection) || input.odometerKmAtInspection < 0)
  ) {
    return {
      ok: false,
      error: validationError(
        "odometerKmAtInspection debe ser entero y no negativo.",
        "odometerKmAtInspection",
      ),
    };
  }

  const inspection: InspectionRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    vehicleId: kase.vehicleId,
    templateKey: BRAKES_TEMPLATE_KEY,
    // Fixed at start time — "template version fijado al iniciar" (sección
    // 9). This engine has no template retirement flow, so it is always the
    // currently active version and `templateVersionStillActive` starts true.
    templateVersionNumber: BRAKES_TEMPLATE_VERSION,
    templateVersionStillActive: true,
    status: "in_progress",
    startedAt: ctx.now.toISOString(),
    startedBy: ctx.actorId,
    completedAt: null,
    completedBy: null,
    invalidatedAt: null,
    invalidatedReason: null,
    previousInspectionId: null,
    odometerKmAtInspection: input.odometerKmAtInspection ?? null,
    createdAt: ctx.now.toISOString(),
  };

  const updatedCase: CaseRow = { ...kase, status: "inspection" };
  const statusEvent = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    fromStatus: kase.status,
    toStatus: "inspection" as const,
    reason: "Inspección de frenos iniciada",
    actorId: ctx.actorId,
    correlationId: ctx.correlationId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const output: StartInspectionOutput = { inspection, case: updatedCase };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_START_INSPECTION,
    "Inspección de frenos iniciada",
    {
      caseId: kase.id,
      inspectionId: inspection.id,
      templateVersionNumber: inspection.templateVersionNumber,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    inspections: [...state.inspections, inspection],
    cases: state.cases.map((c) => (c.id === kase.id ? updatedCase : c)),
    caseStatusEvents: [...state.caseStatusEvents, statusEvent],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_START_INSPECTION, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- RecordInspectionResult -----------------------------------------------------

export interface RecordInspectionResultInput {
  inspectionId: string;
  itemKey: string;
  axle?: BrakeAxle | null;
  side?: BrakeSide | null;
  condition: BrakeCondition;
  provenance: Provenance;
  notes?: string | null;
  measuredAt?: string;
}

const COMMAND_RECORD_INSPECTION_RESULT = "RecordInspectionResult";
const NEEDS_REASON: readonly BrakeCondition[] = ["not_inspected", "not_applicable"];

export function recordInspectionResult(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RecordInspectionResultInput,
): CommandOutcome<InspectionResultRow> {
  const replay = findIdempotentReplay<InspectionResultRow>(
    state,
    ctx,
    COMMAND_RECORD_INSPECTION_RESULT,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, INSPECTION_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const inspection = state.inspections.find(
    (i) => i.id === input.inspectionId && i.organizationId === ctx.organizationId,
  );
  if (!inspection) return { ok: false, error: notFoundError() };
  if (inspection.status !== "in_progress") {
    return {
      ok: false,
      error: conflictError(`La inspección no admite resultados en estado '${inspection.status}'.`),
    };
  }

  const itemDef = findBrakeItemDef(input.itemKey);
  if (!itemDef) {
    return {
      ok: false,
      error: validationError(`"${input.itemKey}" no pertenece al template de frenos.`, "itemKey"),
    };
  }

  const axle = input.axle ?? null;
  const side = input.side ?? null;
  const hasAxleSide = axle !== null && side !== null;
  const hasNeither = axle === null && side === null;
  if (itemDef.scope === "axle_side" && !hasAxleSide) {
    return { ok: false, error: validationError(`"${input.itemKey}" requiere eje y lado.`, "axle") };
  }
  if (itemDef.scope === "vehicle" && !hasNeither) {
    return {
      ok: false,
      error: validationError(
        `"${input.itemKey}" es de alcance vehículo; no debe llevar eje/lado.`,
        "axle",
      ),
    };
  }

  if (NEEDS_REASON.includes(input.condition) && !NON_EMPTY(input.notes)) {
    return {
      ok: false,
      error: validationError(
        `La condición "${input.condition}" requiere una nota con el motivo/contexto.`,
        "notes",
      ),
    };
  }

  const priorRevisions = state.inspectionResults.filter(
    (r) =>
      r.inspectionId === inspection.id &&
      r.itemKey === input.itemKey &&
      r.axle === axle &&
      r.side === side,
  );
  const revisionNumber = priorRevisions.length + 1;

  const result: InspectionResultRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    inspectionId: inspection.id,
    itemKey: input.itemKey,
    axle,
    side,
    condition: input.condition,
    provenance: input.provenance,
    notes: input.notes ?? null,
    actorId: ctx.actorId,
    measuredAt: input.measuredAt ?? ctx.now.toISOString(),
    revisionNumber,
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_RECORD_INSPECTION_RESULT,
    "Resultado de inspección registrado",
    {
      inspectionId: inspection.id,
      itemKey: input.itemKey,
      revisionNumber,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    inspectionResults: [...state.inspectionResults, result],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_RECORD_INSPECTION_RESULT, result),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: result, replayed: false };
}

// --- RecordMeasurement -----------------------------------------------------------

export interface RecordMeasurementInput {
  inspectionResultId: string;
  value: number;
  unit: string;
  provenance: Provenance;
  measuredAt?: string;
}

const COMMAND_RECORD_MEASUREMENT = "RecordMeasurement";

export function recordMeasurement(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RecordMeasurementInput,
): CommandOutcome<MeasurementRow> {
  const replay = findIdempotentReplay<MeasurementRow>(state, ctx, COMMAND_RECORD_MEASUREMENT);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, INSPECTION_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const inspectionResult = state.inspectionResults.find(
    (r) => r.id === input.inspectionResultId && r.organizationId === ctx.organizationId,
  );
  if (!inspectionResult) return { ok: false, error: notFoundError() };

  const existingMeasurement = state.measurements.find(
    (m) => m.inspectionResultId === inspectionResult.id,
  );
  if (existingMeasurement) {
    return {
      ok: false,
      error: conflictError("Este resultado de inspección ya tiene una medición registrada."),
    };
  }

  try {
    createMeasurement(input.value, input.unit);
  } catch (err) {
    if (err instanceof DomainInvariantError) {
      return { ok: false, error: validationError(err.message, err.field) };
    }
    throw err;
  }

  const measurement: MeasurementRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    inspectionResultId: inspectionResult.id,
    value: input.value,
    unit: input.unit.trim(),
    provenance: input.provenance,
    actorId: ctx.actorId,
    measuredAt: input.measuredAt ?? ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_RECORD_MEASUREMENT, "Medición registrada", {
    inspectionResultId: inspectionResult.id,
    measurementId: measurement.id,
  });

  const nextState: CrmVehicleState = {
    ...state,
    measurements: [...state.measurements, measurement],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_RECORD_MEASUREMENT, measurement),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: measurement, replayed: false };
}

// --- RecordFinding -----------------------------------------------------------

export interface RecordFindingInput {
  caseId: string;
  inspectionId?: string | null;
  inspectionResultId?: string | null;
  description: string;
  urgency?: FindingUrgency;
  visibility: Visibility;
  occurredAt?: string;
}

const COMMAND_RECORD_FINDING = "RecordFinding";

export function recordFinding(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RecordFindingInput,
): CommandOutcome<FindingRow> {
  const replay = findIdempotentReplay<FindingRow>(state, ctx, COMMAND_RECORD_FINDING);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, INSPECTION_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  if (!NON_EMPTY(input.description)) {
    return { ok: false, error: validationError("description es obligatoria.", "description") };
  }

  const finding: FindingRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    inspectionId: input.inspectionId ?? null,
    inspectionResultId: input.inspectionResultId ?? null,
    description: input.description.trim(),
    urgency: input.urgency ?? "info",
    visibility: input.visibility,
    actorId: ctx.actorId,
    occurredAt: input.occurredAt ?? ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_RECORD_FINDING, "Hallazgo registrado", {
    caseId: kase.id,
    findingId: finding.id,
    urgency: finding.urgency,
  });

  const nextState: CrmVehicleState = {
    ...state,
    findings: [...state.findings, finding],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_RECORD_FINDING, finding),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: finding, replayed: false };
}

// --- CreateMaintenanceRecommendation -----------------------------------------

export interface CreateMaintenanceRecommendationInput {
  caseId: string;
  vehicleId: string;
  findingId?: string | null;
  triggerKind: MaintenanceTriggerKind;
  dueAt?: string | null;
  dueOdometerKm?: number | null;
  basisKind: MaintenanceBasisKind;
  basisReference?: Record<string, unknown>;
  customerExplanation?: string | null;
  status?: MaintenanceStatus;
}

const COMMAND_CREATE_MAINTENANCE_RECOMMENDATION = "CreateMaintenanceRecommendation";

export function createMaintenanceRecommendation(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateMaintenanceRecommendationInput,
): CommandOutcome<MaintenanceRecommendationRow> {
  const replay = findIdempotentReplay<MaintenanceRecommendationRow>(
    state,
    ctx,
    COMMAND_CREATE_MAINTENANCE_RECOMMENDATION,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, INSPECTION_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  if (input.findingId) {
    const finding = state.findings.find(
      (f) => f.id === input.findingId && f.organizationId === ctx.organizationId,
    );
    if (!finding) return { ok: false, error: notFoundError() };
  }

  const draft = {
    triggerKind: input.triggerKind,
    dueAt: input.dueAt ?? null,
    dueOdometerKm: input.dueOdometerKm ?? null,
    customerExplanation: input.customerExplanation ?? null,
  };

  try {
    assertValidMaintenanceRecommendationDraft(draft);
  } catch (err) {
    if (err instanceof DomainInvariantError) {
      return { ok: false, error: validationError(err.message, err.field) };
    }
    throw err;
  }

  const recommendation: MaintenanceRecommendationRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    vehicleId: input.vehicleId,
    findingId: input.findingId ?? null,
    triggerKind: input.triggerKind,
    dueAt: draft.dueAt,
    dueOdometerKm: draft.dueOdometerKm,
    basisKind: input.basisKind,
    basisReference: input.basisReference ?? {},
    // "unknown no inventa vencimiento" (sección 4.15) — a recommendation
    // created without a confirmed reading defaults here, never guessing a
    // due date/odometer to make the status look more certain than it is.
    status: input.status ?? "unknown",
    customerExplanation: draft.customerExplanation,
    actorId: ctx.actorId,
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CREATE_MAINTENANCE_RECOMMENDATION,
    "Recomendación de mantenimiento creada",
    {
      caseId: kase.id,
      recommendationId: recommendation.id,
      triggerKind: recommendation.triggerKind,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    maintenanceRecommendations: [...state.maintenanceRecommendations, recommendation],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_MAINTENANCE_RECOMMENDATION, recommendation),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: recommendation, replayed: false };
}

// --- CreateUploadIntent -----------------------------------------------------

export interface CreateUploadIntentInput {
  caseId: string;
  purpose: string;
  declaredMime: string;
  declaredSizeBytes?: number | null;
  visibilityRequested: Visibility;
  expiresInMinutes?: number;
}

const COMMAND_CREATE_UPLOAD_INTENT = "CreateUploadIntent";

export function createUploadIntent(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateUploadIntentInput,
): CommandOutcome<UploadIntentRow> {
  const replay = findIdempotentReplay<UploadIntentRow>(state, ctx, COMMAND_CREATE_UPLOAD_INTENT);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, EVIDENCE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  if (!NON_EMPTY(input.purpose)) {
    return { ok: false, error: validationError("purpose es obligatorio.", "purpose") };
  }
  if (!NON_EMPTY(input.declaredMime)) {
    return { ok: false, error: validationError("declaredMime es obligatorio.", "declaredMime") };
  }
  if (input.declaredSizeBytes != null && input.declaredSizeBytes < 0) {
    return {
      ok: false,
      error: validationError("declaredSizeBytes no puede ser negativo.", "declaredSizeBytes"),
    };
  }

  const expiresInMinutes = input.expiresInMinutes ?? 15;
  const expiresAt = new Date(ctx.now.getTime() + expiresInMinutes * 60_000).toISOString();

  // Server-generated, never derived from a filename or sequential id
  // (sección 10: "paths no adivinables").
  const objectPath = `${ctx.organizationId}/${kase.id}/${cryptoRandomId()}`;

  const uploadIntent: UploadIntentRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    actorId: ctx.actorId,
    purpose: input.purpose.trim(),
    declaredMime: input.declaredMime.trim(),
    declaredSizeBytes: input.declaredSizeBytes ?? null,
    visibilityRequested: input.visibilityRequested,
    bucket: "evidence",
    objectPath,
    status: "pending",
    createdAt: ctx.now.toISOString(),
    expiresAt,
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_CREATE_UPLOAD_INTENT, "Upload intent creado", {
    caseId: kase.id,
    uploadIntentId: uploadIntent.id,
  });

  const nextState: CrmVehicleState = {
    ...state,
    uploadIntents: [...state.uploadIntents, uploadIntent],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_UPLOAD_INTENT, uploadIntent),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: uploadIntent, replayed: false };
}

// --- ConfirmEvidenceUpload -----------------------------------------------------

export interface ConfirmEvidenceUploadInput {
  uploadIntentId: string;
  mimeDetected: string;
  bytes: number;
  hash: string;
  capturedAt?: string | null;
  provenance?: Provenance;
}

const COMMAND_CONFIRM_EVIDENCE_UPLOAD = "ConfirmEvidenceUpload";

export function confirmEvidenceUpload(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: ConfirmEvidenceUploadInput,
): CommandOutcome<EvidenceAssetRow> {
  const replay = findIdempotentReplay<EvidenceAssetRow>(
    state,
    ctx,
    COMMAND_CONFIRM_EVIDENCE_UPLOAD,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, EVIDENCE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const uploadIntent = state.uploadIntents.find(
    (u) => u.id === input.uploadIntentId && u.organizationId === ctx.organizationId,
  );
  if (!uploadIntent) return { ok: false, error: notFoundError() };

  if (uploadIntent.status !== "pending") {
    return {
      ok: false,
      error: conflictError(
        `Este upload intent ya no está pendiente (estado: ${uploadIntent.status}).`,
      ),
    };
  }
  if (new Date(uploadIntent.expiresAt).getTime() <= ctx.now.getTime()) {
    return { ok: false, error: conflictError("Este upload intent ya expiró.") };
  }
  if (!NON_EMPTY(input.mimeDetected)) {
    return { ok: false, error: validationError("mimeDetected es obligatorio.", "mimeDetected") };
  }
  if (!Number.isInteger(input.bytes) || input.bytes < 0) {
    return { ok: false, error: validationError("bytes debe ser entero y no negativo.", "bytes") };
  }
  if (!NON_EMPTY(input.hash)) {
    return { ok: false, error: validationError("hash es obligatorio.", "hash") };
  }

  const asset: EvidenceAssetRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    uploadIntentId: uploadIntent.id,
    uploaderId: ctx.actorId,
    bucket: uploadIntent.bucket,
    path: uploadIntent.objectPath,
    mimeDeclared: uploadIntent.declaredMime,
    mimeDetected: input.mimeDetected.trim(),
    bytes: input.bytes,
    hash: input.hash.trim(),
    capturedAt: input.capturedAt ?? null,
    uploadedAt: ctx.now.toISOString(),
    provenance: input.provenance ?? "observed",
    // The ceiling — never widened by a later link (sección 8.3).
    visibilityMax: uploadIntent.visibilityRequested,
    status: "uploaded",
    invalidatedAt: null,
    invalidatedReason: null,
    replacesAssetId: null,
    createdAt: ctx.now.toISOString(),
  };

  const updatedIntent: UploadIntentRow = {
    ...uploadIntent,
    status: "confirmed" as UploadIntentStatus,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CONFIRM_EVIDENCE_UPLOAD,
    "Evidencia confirmada",
    {
      uploadIntentId: uploadIntent.id,
      assetId: asset.id,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    evidenceAssets: [...state.evidenceAssets, asset],
    uploadIntents: state.uploadIntents.map((u) => (u.id === uploadIntent.id ? updatedIntent : u)),
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CONFIRM_EVIDENCE_UPLOAD, asset),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: asset, replayed: false };
}

// --- LinkEvidence -----------------------------------------------------------

export interface LinkEvidenceInput {
  assetId: string;
  entityType: EvidenceEntityType;
  entityId: string;
  purpose?: string | null;
  caption?: string | null;
  visibility: Visibility;
  displayOrder?: number;
}

export interface LinkEvidenceOutput {
  link: EvidenceLinkRow;
  /** min(asset.visibilityMax, link.visibility) — never looser than either
   * (sección 8.3). The link row itself stores the raw requested
   * `visibility`, exactly like `evidence_links` in the migration; this
   * derived field is command-output only, not a persisted column. */
  effectiveVisibility: Visibility;
}

const COMMAND_LINK_EVIDENCE = "LinkEvidence";

export function linkEvidence(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: LinkEvidenceInput,
): CommandOutcome<LinkEvidenceOutput> {
  const replay = findIdempotentReplay<LinkEvidenceOutput>(state, ctx, COMMAND_LINK_EVIDENCE);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, EVIDENCE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const asset = state.evidenceAssets.find(
    (a) => a.id === input.assetId && a.organizationId === ctx.organizationId,
  );
  if (!asset) return { ok: false, error: notFoundError() };

  const link: EvidenceLinkRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    assetId: asset.id,
    entityType: input.entityType,
    entityId: input.entityId,
    purpose: input.purpose ?? null,
    caption: input.caption ?? null,
    visibility: input.visibility,
    displayOrder: input.displayOrder ?? 0,
    actorId: ctx.actorId,
    effectiveAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const effectiveVisibility = effectiveEvidenceVisibility(asset.visibilityMax, link.visibility);
  const output: LinkEvidenceOutput = { link, effectiveVisibility };

  const auditEvent = appendAuditEvent(ctx, COMMAND_LINK_EVIDENCE, "Evidencia vinculada", {
    assetId: asset.id,
    linkId: link.id,
    requestedVisibility: link.visibility,
    effectiveVisibility,
  });

  const nextState: CrmVehicleState = {
    ...state,
    evidenceLinks: [...state.evidenceLinks, link],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_LINK_EVIDENCE, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- CompleteInspection -----------------------------------------------------
// Completes the inspection ENTITY only — it does NOT transition the case to
// `waiting_authorization`. See the note inside the function body for why:
// the case stays `inspection` until `PrepareAuthorizationRequest` has an
// actual frozen quote version behind it. The completion gate itself is
// entirely `evaluateBrakesCompletionGate` (packages/domain); this command
// only assembles its inputs from engine state.

export interface CompleteInspectionInput {
  inspectionId: string;
}

export interface CompleteInspectionOutput {
  inspection: InspectionRow;
  case: CaseRow;
}

const COMMAND_COMPLETE_INSPECTION = "CompleteInspection";

export function completeInspection(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CompleteInspectionInput,
): CommandOutcome<CompleteInspectionOutput> {
  const replay = findIdempotentReplay<CompleteInspectionOutput>(
    state,
    ctx,
    COMMAND_COMPLETE_INSPECTION,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, INSPECTION_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const inspection = state.inspections.find(
    (i) => i.id === input.inspectionId && i.organizationId === ctx.organizationId,
  );
  if (!inspection) return { ok: false, error: notFoundError() };
  if (inspection.status !== "in_progress") {
    return {
      ok: false,
      error: conflictError(
        `Solo una inspección 'in_progress' puede completarse (estado: ${inspection.status}).`,
      ),
    };
  }

  const kase = state.cases.find(
    (c) => c.id === inspection.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  // CompleteInspection completes the inspection ENTITY only — it does not
  // move the case to `waiting_authorization`. Saying "esperando tu decisión"
  // before a quote exists, is frozen, and has a prepared request would be
  // exactly the kind of false state DATATEK_R0_A prohibits ("todo estado
  // visible declara qué se sabe"; "cotizado no significa autorizado"). The
  // case stays in `inspection` — its next real transition to
  // `waiting_authorization` happens in `PrepareAuthorizationRequest`, once
  // there is an actual frozen version and a decidable request behind it.
  if (kase.status !== "inspection") {
    return {
      ok: false,
      error: conflictError(
        `Solo un caso en 'inspection' puede completar su inspección (estado: ${kase.status}).`,
      ),
    };
  }

  // Only the LATEST revision per (itemKey, axle, side) counts toward the
  // gate — corrections append a new revision rather than overwrite (sección
  // 7.2), so an earlier, since-corrected revision must never re-trigger a
  // missing-field reason.
  const latestByCombo = new Map<string, InspectionResultRow>();
  for (const r of state.inspectionResults) {
    if (r.inspectionId !== inspection.id) continue;
    const key = `${r.itemKey}|${r.axle ?? ""}|${r.side ?? ""}`;
    const current = latestByCombo.get(key);
    if (!current || r.revisionNumber > current.revisionNumber) {
      latestByCombo.set(key, r);
    }
  }
  const latestResults = [...latestByCombo.values()];

  const results: RecordedBrakeResult[] = latestResults.map((r) => ({
    itemKey: r.itemKey,
    axle: r.axle,
    side: r.side,
    condition: r.condition,
    notes: r.notes,
    actorId: r.actorId,
    measuredAt: r.measuredAt,
  }));

  const latestResultIds = new Set(latestResults.map((r) => r.id));
  const measurements: RecordedBrakeMeasurement[] = state.measurements
    .filter((m) => latestResultIds.has(m.inspectionResultId))
    .map((m) => {
      const owningResult = latestResults.find((r) => r.id === m.inspectionResultId);
      return {
        itemKey: owningResult?.itemKey ?? "",
        axle: owningResult?.axle ?? null,
        side: owningResult?.side ?? null,
        unit: m.unit,
        value: m.value,
      };
    });

  // Any upload intent still `pending` for this case counts as required
  // evidence that never reached a confirmed asset (sección 7.4: "evidencia
  // requerida quedó en intención no confirmada").
  const hasUnconfirmedRequiredEvidence = state.uploadIntents.some(
    (u) =>
      u.caseId === kase.id && u.organizationId === ctx.organizationId && u.status === "pending",
  );

  const gate = evaluateBrakesCompletionGate({
    results,
    measurements,
    templateVersionStillActive: inspection.templateVersionStillActive,
    hasUnconfirmedRequiredEvidence,
  });

  if (!gate.ok) {
    return {
      ok: false,
      error: validationError(gate.reasons.join(" | "), "completionGate"),
    };
  }

  const updatedInspection: InspectionRow = {
    ...inspection,
    status: "completed",
    completedAt: ctx.now.toISOString(),
    completedBy: ctx.actorId,
  };

  const output: CompleteInspectionOutput = { inspection: updatedInspection, case: kase };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_COMPLETE_INSPECTION,
    "Inspección de frenos completada",
    {
      caseId: kase.id,
      inspectionId: inspection.id,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    inspections: state.inspections.map((i) => (i.id === inspection.id ? updatedInspection : i)),
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_COMPLETE_INSPECTION, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}
