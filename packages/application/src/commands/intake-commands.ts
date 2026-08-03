// Intake and case commands — DATATEK_R0_D sección 7.
//
// `CreateManualIntake`, `AppendIntakeEntry`, `InterpretReportedSymptom`,
// `CreateCaseFromIntake`, `AssignCaseParticipant`, `TransitionCase`,
// `AddCaseNote`. Same pure-function pattern as `crm-commands.ts` /
// `vehicle-commands.ts`: `(state, ctx, input) -> CommandOutcome<T>`, no
// mutation of the `state` argument.
import { resolveCaseTransition, type CaseStatus, type Visibility } from "@datatek/domain";
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
  checkIdempotencyKeyConflict,
  consumeOrganizationCounter,
  cryptoRandomId,
  findIdempotentReplay,
  hashCommandInput,
  type CommandOutcome,
  type CrmVehicleState,
  type IntakeThreadRow,
  type IntakeChannel,
  type IntakeEntryRow,
  type IntakeEntryDirection,
  type ReportedSymptomRow,
  type CaseRow,
  type CaseParticipantRow,
  type CaseAssignmentRow,
  type CaseAssignmentRole,
  type ServiceRequestRow,
  type CaseNoteRow,
} from "./state.ts";

const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;
const CASE_PERMISSION = "intake.manage" as const;

// --- CreateManualIntake -----------------------------------------------------

export interface CreateManualIntakeInput {
  customerId?: string | null;
  channel: IntakeChannel;
  originalText: string;
  reportedAt: string;
  referencedFiles?: string[];
}

export interface CreateManualIntakeOutput {
  thread: IntakeThreadRow;
  entry: IntakeEntryRow;
}

const COMMAND_CREATE_MANUAL_INTAKE = "CreateManualIntake";

export function createManualIntake(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateManualIntakeInput,
): CommandOutcome<CreateManualIntakeOutput> {
  const replay = findIdempotentReplay<CreateManualIntakeOutput>(
    state,
    ctx,
    COMMAND_CREATE_MANUAL_INTAKE,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, CASE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  if (!NON_EMPTY(input.originalText)) {
    return {
      ok: false,
      error: validationError("El texto original del intake es obligatorio.", "originalText"),
    };
  }
  if (Number.isNaN(new Date(input.reportedAt).getTime())) {
    return {
      ok: false,
      error: validationError("reportedAt debe ser una fecha válida.", "reportedAt"),
    };
  }
  if (input.customerId) {
    const customer = state.customers.find(
      (c) => c.id === input.customerId && c.organizationId === ctx.organizationId,
    );
    if (!customer) return { ok: false, error: notFoundError() };
  }

  const thread: IntakeThreadRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    customerId: input.customerId ?? null,
    channel: input.channel,
    status: "open",
    correlationId: ctx.correlationId,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const entry: IntakeEntryRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    threadId: thread.id,
    direction: "inbound",
    originalText: input.originalText.trim(),
    referencedFiles: input.referencedFiles ?? [],
    reportedAt: input.reportedAt,
    recordedBy: ctx.actorId,
    createdAt: ctx.now.toISOString(),
  };

  const output: CreateManualIntakeOutput = { thread, entry };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CREATE_MANUAL_INTAKE,
    "Intake manual registrado",
    {
      threadId: thread.id,
      entryId: entry.id,
      channel: thread.channel,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    intakeThreads: [...state.intakeThreads, thread],
    intakeEntries: [...state.intakeEntries, entry],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_MANUAL_INTAKE, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- AppendIntakeEntry -------------------------------------------------------

export interface AppendIntakeEntryInput {
  threadId: string;
  direction: IntakeEntryDirection;
  originalText: string;
  reportedAt: string;
  referencedFiles?: string[];
}

const COMMAND_APPEND_INTAKE_ENTRY = "AppendIntakeEntry";

export function appendIntakeEntry(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: AppendIntakeEntryInput,
): CommandOutcome<IntakeEntryRow> {
  const replay = findIdempotentReplay<IntakeEntryRow>(state, ctx, COMMAND_APPEND_INTAKE_ENTRY);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, CASE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const thread = state.intakeThreads.find(
    (t) => t.id === input.threadId && t.organizationId === ctx.organizationId,
  );
  if (!thread) return { ok: false, error: notFoundError() };

  if (!NON_EMPTY(input.originalText)) {
    return { ok: false, error: validationError("El texto es obligatorio.", "originalText") };
  }
  if (Number.isNaN(new Date(input.reportedAt).getTime())) {
    return {
      ok: false,
      error: validationError("reportedAt debe ser una fecha válida.", "reportedAt"),
    };
  }

  const entry: IntakeEntryRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    threadId: thread.id,
    direction: input.direction,
    originalText: input.originalText.trim(),
    referencedFiles: input.referencedFiles ?? [],
    reportedAt: input.reportedAt,
    recordedBy: ctx.actorId,
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_APPEND_INTAKE_ENTRY,
    "Entrada agregada al intake",
    {
      threadId: thread.id,
      entryId: entry.id,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    intakeEntries: [...state.intakeEntries, entry],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_APPEND_INTAKE_ENTRY, entry),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: entry, replayed: false };
}

// --- InterpretReportedSymptom ------------------------------------------------

export interface InterpretReportedSymptomInput {
  caseId: string;
  serviceRequestId?: string | null;
  sourceIntakeEntryId?: string | null;
  symptomCode: string;
  description: string;
  reportedAt?: string;
}

const COMMAND_INTERPRET_SYMPTOM = "InterpretReportedSymptom";

export function interpretReportedSymptom(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: InterpretReportedSymptomInput,
): CommandOutcome<ReportedSymptomRow> {
  const replay = findIdempotentReplay<ReportedSymptomRow>(state, ctx, COMMAND_INTERPRET_SYMPTOM);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, CASE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  if (!NON_EMPTY(input.symptomCode)) {
    return { ok: false, error: validationError("symptomCode es obligatorio.", "symptomCode") };
  }
  if (!NON_EMPTY(input.description)) {
    return { ok: false, error: validationError("description es obligatoria.", "description") };
  }

  const symptom: ReportedSymptomRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    serviceRequestId: input.serviceRequestId ?? null,
    sourceIntakeEntryId: input.sourceIntakeEntryId ?? null,
    symptomCode: input.symptomCode.trim(),
    description: input.description.trim(),
    reportedAt: input.reportedAt ?? ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_INTERPRET_SYMPTOM, "Síntoma estructurado", {
    caseId: kase.id,
    symptomId: symptom.id,
  });

  const nextState: CrmVehicleState = {
    ...state,
    reportedSymptoms: [...state.reportedSymptoms, symptom],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_INTERPRET_SYMPTOM, symptom),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: symptom, replayed: false };
}

// --- CreateCaseFromIntake ----------------------------------------------------

export interface CreateCaseFromIntakeInput {
  intakeThreadId: string;
  customerId: string;
  vehicleId: string;
  branchId?: string | null;
  summary: string;
}

export interface CreateCaseFromIntakeOutput {
  case: CaseRow;
  serviceRequest: ServiceRequestRow;
  participant: CaseParticipantRow;
}

const COMMAND_CREATE_CASE_FROM_INTAKE = "CreateCaseFromIntake";
const CASE_FOLIO_COUNTER_KEY = "case_folio";

export function createCaseFromIntake(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateCaseFromIntakeInput,
): CommandOutcome<CreateCaseFromIntakeOutput> {
  // DATATEK_R0_E hardening sección 7: misma key + input distinto falla en
  // vez de reemplazar en silencio el resultado ya guardado — ver el
  // comentario en `checkIdempotencyKeyConflict` (state.ts).
  const inputHash = hashCommandInput(input);
  const keyConflict = checkIdempotencyKeyConflict(
    state,
    ctx,
    COMMAND_CREATE_CASE_FROM_INTAKE,
    inputHash,
  );
  if (keyConflict) return { ok: false, error: keyConflict };

  const replay = findIdempotentReplay<CreateCaseFromIntakeOutput>(
    state,
    ctx,
    COMMAND_CREATE_CASE_FROM_INTAKE,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, CASE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const thread = state.intakeThreads.find(
    (t) => t.id === input.intakeThreadId && t.organizationId === ctx.organizationId,
  );
  if (!thread) return { ok: false, error: notFoundError() };
  if (thread.status === "converted") {
    return { ok: false, error: conflictError("Este intake ya generó un caso.") };
  }

  const customer = state.customers.find(
    (c) => c.id === input.customerId && c.organizationId === ctx.organizationId,
  );
  if (!customer) return { ok: false, error: notFoundError() };

  // Same neutral not-found pattern as `CreateVehicleOwnershipClaim` — this
  // organization must already hold an access grant for the vehicle.
  const hasVehicleAccess = state.vehicleAccessGrants.some(
    (g) =>
      g.vehicleId === input.vehicleId &&
      g.organizationId === ctx.organizationId &&
      g.revokedAt === null,
  );
  if (!hasVehicleAccess) return { ok: false, error: notFoundError() };

  if (!NON_EMPTY(input.summary)) {
    return { ok: false, error: validationError("summary es obligatorio.", "summary") };
  }

  // Folio secuencial POR ORGANIZACIÓN — sección 7.
  const { value: folioNumber, nextState: stateWithCounter } = consumeOrganizationCounter(
    state,
    ctx.organizationId,
    CASE_FOLIO_COUNTER_KEY,
  );
  const year = ctx.now.getUTCFullYear();
  const folioCode = `${year}-${String(folioNumber).padStart(5, "0")}`;

  const kase: CaseRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    branchId: input.branchId ?? null,
    folioNumber,
    folioCode,
    customerId: customer.id,
    vehicleId: input.vehicleId,
    status: "new",
    sourceIntakeThreadId: thread.id,
    openedAt: ctx.now.toISOString(),
    closedAt: null,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const participant: CaseParticipantRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    customerId: customer.id,
    participantKind: "customer",
    addedAt: ctx.now.toISOString(),
    addedBy: ctx.actorId,
  };

  const serviceRequest: ServiceRequestRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    sourceIntakeEntryId: null,
    summary: input.summary.trim(),
    requestedAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const openedEvent = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    fromStatus: null,
    toStatus: "new" as CaseStatus,
    reason: "Caso creado desde intake",
    actorId: ctx.actorId,
    correlationId: ctx.correlationId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const output: CreateCaseFromIntakeOutput = { case: kase, serviceRequest, participant };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CREATE_CASE_FROM_INTAKE,
    "Caso creado desde intake",
    {
      caseId: kase.id,
      folioCode: kase.folioCode,
      threadId: thread.id,
    },
  );

  const nextState: CrmVehicleState = {
    ...stateWithCounter,
    cases: [...stateWithCounter.cases, kase],
    caseParticipants: [...stateWithCounter.caseParticipants, participant],
    serviceRequests: [...stateWithCounter.serviceRequests, serviceRequest],
    caseStatusEvents: [...stateWithCounter.caseStatusEvents, openedEvent],
    intakeThreads: stateWithCounter.intakeThreads.map((t) =>
      t.id === thread.id ? { ...t, status: "converted" as const } : t,
    ),
    idempotencyRecords: [
      ...stateWithCounter.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_CASE_FROM_INTAKE, output, inputHash),
    ],
    auditLog: [...stateWithCounter.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- AssignCaseParticipant ----------------------------------------------------
// Despite the name (matching DATATEK_R0_D sección 3 literally), this writes
// `case_assignments` — STAFF responsible for the case (advisor/inspector/
// mechanic/other), per the migration comment on `case_assignments`:
// "Escrita por AssignCaseParticipant." The customer-side `case_participants`
// row is written once, automatically, by `CreateCaseFromIntake`.

export interface AssignCaseParticipantInput {
  caseId: string;
  role: CaseAssignmentRole;
  userId: string;
}

const COMMAND_ASSIGN_CASE_PARTICIPANT = "AssignCaseParticipant";

export function assignCaseParticipant(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: AssignCaseParticipantInput,
): CommandOutcome<CaseAssignmentRow> {
  const replay = findIdempotentReplay<CaseAssignmentRow>(
    state,
    ctx,
    COMMAND_ASSIGN_CASE_PARTICIPANT,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, CASE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  if (!NON_EMPTY(input.userId)) {
    return { ok: false, error: validationError("userId es obligatorio.", "userId") };
  }

  const assignment: CaseAssignmentRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    role: input.role,
    userId: input.userId,
    assignedAt: ctx.now.toISOString(),
    assignedBy: ctx.actorId,
    unassignedAt: null,
    unassignedBy: null,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_ASSIGN_CASE_PARTICIPANT,
    "Responsable asignado al caso",
    {
      caseId: kase.id,
      role: assignment.role,
      userId: assignment.userId,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    caseAssignments: [...state.caseAssignments, assignment],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_ASSIGN_CASE_PARTICIPANT, assignment),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: assignment, replayed: false };
}

// --- TransitionCase ------------------------------------------------------------
// Generic transition command — validates against the exact R0-A sección 5.1
// edge table via `resolveCaseTransition` (packages/domain). Named commands
// `ReceiveVehicle`/`StartInspection`/`CompleteInspection` validate their own
// single edge internally instead of calling this one.

export interface TransitionCaseInput {
  caseId: string;
  toStatus: CaseStatus;
  reason?: string;
}

const COMMAND_TRANSITION_CASE = "TransitionCase";

export function transitionCase(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: TransitionCaseInput,
): CommandOutcome<CaseRow> {
  const replay = findIdempotentReplay<CaseRow>(state, ctx, COMMAND_TRANSITION_CASE);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, CASE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  const check = resolveCaseTransition(kase.status, input.toStatus);
  if (!check.ok) {
    return { ok: false, error: conflictError(check.reason ?? "Transición de caso inválida.") };
  }

  const updatedCase: CaseRow = {
    ...kase,
    status: input.toStatus,
    closedAt: input.toStatus === "closed" ? ctx.now.toISOString() : kase.closedAt,
  };

  const statusEvent = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    fromStatus: kase.status,
    toStatus: input.toStatus,
    reason: input.reason ?? null,
    actorId: ctx.actorId,
    correlationId: ctx.correlationId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_TRANSITION_CASE, "Caso transicionó de estado", {
    caseId: kase.id,
    fromStatus: kase.status,
    toStatus: input.toStatus,
  });

  const nextState: CrmVehicleState = {
    ...state,
    cases: state.cases.map((c) => (c.id === kase.id ? updatedCase : c)),
    caseStatusEvents: [...state.caseStatusEvents, statusEvent],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_TRANSITION_CASE, updatedCase),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: updatedCase, replayed: false };
}

// --- AddCaseNote ---------------------------------------------------------------

export interface AddCaseNoteInput {
  caseId: string;
  visibility: Visibility;
  body: string;
}

const COMMAND_ADD_CASE_NOTE = "AddCaseNote";

export function addCaseNote(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: AddCaseNoteInput,
): CommandOutcome<CaseNoteRow> {
  const replay = findIdempotentReplay<CaseNoteRow>(state, ctx, COMMAND_ADD_CASE_NOTE);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, CASE_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  if (!NON_EMPTY(input.body)) {
    return { ok: false, error: validationError("El cuerpo de la nota es obligatorio.", "body") };
  }

  // A `internal` note never projects to Pass (sección 7) — nothing in this
  // engine exposes `caseNotes` to a customer-facing query, so the invariant
  // is trivially true today; a future Pass query contract must keep
  // filtering by `visibility` rather than exposing this row unfiltered.
  const note: CaseNoteRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    visibility: input.visibility,
    body: input.body.trim(),
    authorId: ctx.actorId,
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_ADD_CASE_NOTE, "Nota agregada al caso", {
    caseId: kase.id,
    noteId: note.id,
    visibility: note.visibility,
  });

  const nextState: CrmVehicleState = {
    ...state,
    caseNotes: [...state.caseNotes, note],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_ADD_CASE_NOTE, note),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: note, replayed: false };
}
