// HTTP-boundary validation for the temporary dev commands route. Kept
// separate from `@datatek/application`'s command input types on purpose:
// zod (an HTTP/parsing concern) never belongs in the pure application
// package — this file only translates "untyped JSON from the wire" into
// the exact input shape each command already validates again internally.
import { z } from "zod";

export const createProvisionalCustomerSchema = z.object({
  displayName: z.string(),
  customerType: z.enum(["person", "company"]).optional(),
  source: z.string(),
});

export const addCustomerContactSchema = z.object({
  customerId: z.string(),
  channel: z.enum(["phone", "whatsapp", "email"]),
  rawValue: z.string(),
  isPrimary: z.boolean().optional(),
});

export const linkCustomerAuthIdentitySchema = z.object({
  customerId: z.string(),
  userId: z.string(),
  verificationMethod: z.string(),
  verified: z.boolean(),
});

export const registerVehicleSchema = z.object({
  vin: z.string().optional(),
  plate: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  color: z.string().optional(),
  customerId: z.string().optional(),
});

export const createVehicleOwnershipClaimSchema = z.object({
  customerId: z.string(),
  vehicleId: z.string(),
  claimKind: z.enum(["self_reported", "imported", "transferred"]),
});

export const recordOdometerEventSchema = z.object({
  vehicleId: z.string(),
  value: z.number(),
  unit: z.enum(["km", "mi"]),
  recordedAt: z.string(),
  provenance: z.enum(["observed", "measured", "reported", "estimated", "derived"]),
});

const provenanceSchema = z.enum(["observed", "measured", "reported", "estimated", "derived"]);
const visibilitySchema = z.enum(["internal", "customer", "shared_case"]);

// --- Intake and case (R0-D Fase 2) ------------------------------------------

export const createManualIntakeSchema = z.object({
  customerId: z.string().nullable().optional(),
  channel: z.enum(["whatsapp_manual", "phone_manual", "walk_in", "email_manual"]),
  originalText: z.string(),
  reportedAt: z.string(),
  referencedFiles: z.array(z.string()).optional(),
});

export const appendIntakeEntrySchema = z.object({
  threadId: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  originalText: z.string(),
  reportedAt: z.string(),
  referencedFiles: z.array(z.string()).optional(),
});

export const interpretReportedSymptomSchema = z.object({
  caseId: z.string(),
  serviceRequestId: z.string().nullable().optional(),
  sourceIntakeEntryId: z.string().nullable().optional(),
  symptomCode: z.string(),
  description: z.string(),
  reportedAt: z.string().optional(),
});

export const createCaseFromIntakeSchema = z.object({
  intakeThreadId: z.string(),
  customerId: z.string(),
  vehicleId: z.string(),
  branchId: z.string().nullable().optional(),
  summary: z.string(),
});

export const assignCaseParticipantSchema = z.object({
  caseId: z.string(),
  role: z.enum(["advisor", "inspector", "mechanic", "other"]),
  userId: z.string(),
});

export const transitionCaseSchema = z.object({
  caseId: z.string(),
  toStatus: z.enum([
    "new",
    "triage",
    "waiting_customer",
    "scheduled",
    "received",
    "inspection",
    "waiting_authorization",
    "ready",
    "in_progress",
    "blocked",
    "quality",
    "ready_for_delivery",
    "delivered",
    "closed",
    "cancelled",
  ]),
  reason: z.string().optional(),
});

export const addCaseNoteSchema = z.object({
  caseId: z.string(),
  visibility: visibilitySchema,
  body: z.string(),
});

// --- Agenda (R0-D Fase 2) ----------------------------------------------------

export const createTemporaryReservationSchema = z.object({
  appointmentId: z.string(),
  resourceId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  holdMinutes: z.number().optional(),
});

export const scheduleAppointmentSchema = z.object({
  caseId: z.string(),
  branchId: z.string().nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  purpose: z.string().nullable().optional(),
  resourceIds: z.array(z.string()),
});

export const confirmAppointmentSchema = z.object({
  appointmentId: z.string(),
});

export const cancelAppointmentSchema = z.object({
  appointmentId: z.string(),
  reason: z.string(),
});

export const receiveVehicleSchema = z.object({
  caseId: z.string(),
  appointmentId: z.string().nullable().optional(),
  odometer: z.object({
    value: z.number(),
    unit: z.enum(["km", "mi"]),
    recordedAt: z.string(),
    provenance: provenanceSchema,
  }),
});

// --- Inspection and evidence (R0-D Fase 2) -----------------------------------

export const startInspectionSchema = z.object({
  caseId: z.string(),
  odometerKmAtInspection: z.number().nullable().optional(),
});

export const recordInspectionResultSchema = z.object({
  inspectionId: z.string(),
  itemKey: z.string(),
  axle: z.enum(["front", "rear"]).nullable().optional(),
  side: z.enum(["left", "right", "center"]).nullable().optional(),
  condition: z.enum(["pass", "attention", "fail", "not_inspected", "not_applicable"]),
  provenance: provenanceSchema,
  notes: z.string().nullable().optional(),
  measuredAt: z.string().optional(),
});

export const recordMeasurementSchema = z.object({
  inspectionResultId: z.string(),
  value: z.number(),
  unit: z.string(),
  provenance: provenanceSchema,
  measuredAt: z.string().optional(),
});

export const recordFindingSchema = z.object({
  caseId: z.string(),
  inspectionId: z.string().nullable().optional(),
  inspectionResultId: z.string().nullable().optional(),
  description: z.string(),
  urgency: z.enum(["info", "attention", "urgent", "safety_critical"]).optional(),
  visibility: visibilitySchema,
  occurredAt: z.string().optional(),
});

export const createMaintenanceRecommendationSchema = z.object({
  caseId: z.string(),
  vehicleId: z.string(),
  findingId: z.string().nullable().optional(),
  triggerKind: z.enum(["date", "odometer", "whichever_first", "condition"]),
  dueAt: z.string().nullable().optional(),
  dueOdometerKm: z.number().nullable().optional(),
  basisKind: z.enum(["manufacturer", "inspection", "service_history", "technician"]),
  basisReference: z.record(z.string(), z.unknown()).optional(),
  customerExplanation: z.string().nullable().optional(),
  status: z.enum(["upcoming", "due_soon", "due", "overdue", "unknown"]).optional(),
});

export const createUploadIntentSchema = z.object({
  caseId: z.string(),
  purpose: z.string(),
  declaredMime: z.string(),
  declaredSizeBytes: z.number().nullable().optional(),
  visibilityRequested: visibilitySchema,
  expiresInMinutes: z.number().optional(),
});

export const confirmEvidenceUploadSchema = z.object({
  uploadIntentId: z.string(),
  mimeDetected: z.string(),
  bytes: z.number(),
  hash: z.string(),
  capturedAt: z.string().nullable().optional(),
  provenance: provenanceSchema.optional(),
});

export const linkEvidenceSchema = z.object({
  assetId: z.string(),
  entityType: z.enum(["case", "inspection_result", "finding"]),
  entityId: z.string(),
  purpose: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  visibility: visibilitySchema,
  displayOrder: z.number().optional(),
});

export const completeInspectionSchema = z.object({
  inspectionId: z.string(),
});

// --- Quote (R0-D Fase 3) -----------------------------------------------------

export const createQuoteSchema = z.object({
  caseId: z.string(),
});

export const createQuoteVersionSchema = z.object({
  quoteId: z.string(),
  currency: z.string().optional(),
});

export const addQuoteItemSchema = z.object({
  quoteVersionId: z.string(),
  lineType: z.enum(["service", "part", "labor", "fee"]),
  description: z.string(),
  quantity: z.number(),
  unitPriceMinor: z.number(),
  currency: z.string(),
  visibility: visibilitySchema.optional(),
  requiresAuthorization: z.boolean().optional(),
  sourceType: z.enum(["finding", "recommendation", "catalog_item", "manual"]).nullable().optional(),
  sourceId: z.string().nullable().optional(),
  displayOrder: z.number().optional(),
});

export const updateDraftQuoteItemSchema = z.object({
  quoteItemId: z.string(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unitPriceMinor: z.number().optional(),
  visibility: visibilitySchema.optional(),
  requiresAuthorization: z.boolean().optional(),
  displayOrder: z.number().optional(),
});

export const freezeQuoteVersionSchema = z.object({
  quoteVersionId: z.string(),
  expectedVersionNumber: z.number().optional(),
});

// --- Authorization (R0-D Fase 3) --------------------------------------------

export const prepareAuthorizationRequestSchema = z.object({
  quoteVersionId: z.string(),
  audienceCustomerId: z.string(),
  allowedMethods: z.array(z.enum(["pass_authenticated", "secure_link"])).optional(),
  scope: z.enum(["read", "read_and_decide"]).optional(),
  expiresInMinutes: z.number().optional(),
  verificationMethod: z.string().optional(),
});

export const markAuthorizationRequestSentSchema = z.object({
  authorizationRequestId: z.string(),
  channel: z.string(),
  result: z.enum(["sent", "failed"]),
  note: z.string().nullable().optional(),
});

export const verifyAuthorizationAccessSchema = z.object({
  token: z.string(),
});

export const recordAuthorizationSchema = z.object({
  method: z.enum(["secure_link", "staff_manual"]),
  token: z.string().optional(),
  authorizationRequestId: z.string().optional(),
  quoteVersionId: z.string(),
  quoteVersionHash: z.string(),
  decision: z.enum(["accept_all", "partial", "reject"]),
  acceptedQuoteItemIds: z.array(z.string()).optional(),
  rejectionReason: z.string().nullable().optional(),
});

export const invalidateAuthorizationSchema = z.object({
  authorizationId: z.string(),
  reason: z.string(),
});

// --- Authorization reissue (R0-D Fase 4a) ------------------------------------

export const revokeAndReprepareAuthorizationRequestSchema = z.object({
  authorizationRequestId: z.string(),
  reason: z.string(),
  allowedMethods: z.array(z.enum(["pass_authenticated", "secure_link"])).optional(),
  scope: z.enum(["read", "read_and_decide"]).optional(),
  expiresInMinutes: z.number().optional(),
  verificationMethod: z.string().optional(),
});

export const COMMAND_SCHEMAS = {
  CreateProvisionalCustomer: createProvisionalCustomerSchema,
  AddCustomerContact: addCustomerContactSchema,
  LinkCustomerAuthIdentity: linkCustomerAuthIdentitySchema,
  RegisterVehicle: registerVehicleSchema,
  CreateVehicleOwnershipClaim: createVehicleOwnershipClaimSchema,
  RecordOdometerEvent: recordOdometerEventSchema,

  CreateManualIntake: createManualIntakeSchema,
  AppendIntakeEntry: appendIntakeEntrySchema,
  InterpretReportedSymptom: interpretReportedSymptomSchema,
  CreateCaseFromIntake: createCaseFromIntakeSchema,
  AssignCaseParticipant: assignCaseParticipantSchema,
  TransitionCase: transitionCaseSchema,
  AddCaseNote: addCaseNoteSchema,

  CreateTemporaryReservation: createTemporaryReservationSchema,
  ScheduleAppointment: scheduleAppointmentSchema,
  ConfirmAppointment: confirmAppointmentSchema,
  CancelAppointment: cancelAppointmentSchema,
  ReceiveVehicle: receiveVehicleSchema,

  StartInspection: startInspectionSchema,
  RecordInspectionResult: recordInspectionResultSchema,
  RecordMeasurement: recordMeasurementSchema,
  RecordFinding: recordFindingSchema,
  CreateMaintenanceRecommendation: createMaintenanceRecommendationSchema,
  CreateUploadIntent: createUploadIntentSchema,
  ConfirmEvidenceUpload: confirmEvidenceUploadSchema,
  LinkEvidence: linkEvidenceSchema,
  CompleteInspection: completeInspectionSchema,

  CreateQuote: createQuoteSchema,
  CreateQuoteVersion: createQuoteVersionSchema,
  AddQuoteItem: addQuoteItemSchema,
  UpdateDraftQuoteItem: updateDraftQuoteItemSchema,
  FreezeQuoteVersion: freezeQuoteVersionSchema,

  PrepareAuthorizationRequest: prepareAuthorizationRequestSchema,
  MarkAuthorizationRequestSent: markAuthorizationRequestSentSchema,
  VerifyAuthorizationAccess: verifyAuthorizationAccessSchema,
  RecordAuthorization: recordAuthorizationSchema,
  InvalidateAuthorization: invalidateAuthorizationSchema,
  RevokeAndReprepareAuthorizationRequest: revokeAndReprepareAuthorizationRequestSchema,
} as const;

export type CommandName = keyof typeof COMMAND_SCHEMAS;

export function isCommandName(value: unknown): value is CommandName {
  return typeof value === "string" && Object.hasOwn(COMMAND_SCHEMAS, value);
}
