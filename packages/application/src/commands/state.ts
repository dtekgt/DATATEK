// In-memory state shape for the R0-D Fase 1 fixture command engine.
//
// This mirrors the physical rows `supabase/migrations/0020_crm.sql` and
// `0030_vehicles_access.sql` will hold once Postgres is reachable (see
// those files for the authoritative schema, constraints and RLS). Field
// names here use camelCase; the SQL uses snake_case — the mapping is
// 1:1 and is called out per table below.
//
// Design note repeated from the migrations: `customers` (and everything
// that hangs off a customer) is organization-scoped — DATATEK_R0_A sección
// 4.13 "customers -> organizations: relación local, nunca global". Vehicles
// are the opposite: `vehicles`/`vehicle_identifiers` are NOT
// organization-scoped, because a VIN/plate names one physical car
// regardless of which shop it visits over its lifetime (DATATEK_R0_D
// sección 5: "fusión de duplicados queda para Control" only makes sense if
// the same vehicle row can legitimately be found by more than one org).
// Every organization's *access* to that shared row is mediated entirely by
// `vehicle_access_grants` — never by the vehicle/identifier rows
// themselves — which is what makes "VIN/placa no otorgan lectura" true.
import { createHash } from "node:crypto";
import type {
  Provenance,
  Visibility,
  CaseStatus,
  BrakeAxle,
  BrakeSide,
  BrakeCondition,
  MaintenanceTriggerKind,
  MaintenanceStatus,
  MaintenanceBasisKind,
  QuoteVersionStatus,
  AuthorizationRequestStatus,
  AuthorizationStatus,
  ServicePriceMode,
} from "@datatek/domain";

// --- CRM (0020) --------------------------------------------------------

export type CustomerType = "person" | "company";
export type CustomerStatus = "provisional" | "active" | "inactive";

export interface CustomerRow {
  id: string;
  organizationId: string;
  displayName: string;
  customerType: CustomerType;
  status: CustomerStatus;
  /** e.g. "whatsapp_manual", "walk_in", "referral" — sección 4: "fuente". */
  source: string;
  createdAt: string;
  effectiveAt: string;
  createdBy: string;
}

export type ContactChannel = "phone" | "whatsapp" | "email";

export interface CustomerContactRow {
  id: string;
  organizationId: string;
  customerId: string;
  channel: ContactChannel;
  normalizedValue: string;
  rawValue: string;
  verified: boolean;
  verifiedAt: string | null;
  isPrimary: boolean;
  createdAt: string;
  createdBy: string;
}

export type CustomerAuthLinkStatus = "verified" | "revoked";

export interface CustomerAuthLinkRow {
  id: string;
  organizationId: string;
  customerId: string;
  userId: string;
  status: CustomerAuthLinkStatus;
  verificationMethod: string;
  verifiedAt: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
}

// --- Vehicles and access (0030) ----------------------------------------

export interface VehicleRow {
  id: string;
  primaryVin: string | null;
  primaryPlate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  createdAt: string;
  createdBy: string;
}

export type VehicleIdentifierType = "vin" | "plate";

export interface VehicleIdentifierRow {
  id: string;
  vehicleId: string;
  identifierType: VehicleIdentifierType;
  normalizedValue: string;
  rawValue: string;
  /** Which organization's actor first recorded this identifier — provenance
   * only, never used to grant that org (or any other) read access. */
  recordedByOrganizationId: string;
  createdAt: string;
  createdBy: string;
}

export type VehicleOwnershipClaimKind = "self_reported" | "imported" | "transferred";
export type VehicleOwnershipClaimStatus = "provisional" | "verified" | "rejected" | "superseded";

export interface VehicleOwnershipClaimRow {
  id: string;
  organizationId: string;
  customerId: string;
  vehicleId: string;
  claimKind: VehicleOwnershipClaimKind;
  status: VehicleOwnershipClaimStatus;
  createdAt: string;
  createdBy: string;
}

export type VehicleAccessScope = "read_own_case" | "service_history_read" | "full_manage";
export type VehicleAccessSource = "registration" | "ownership_claim" | "service_case" | "manual";

export interface VehicleAccessGrantRow {
  id: string;
  organizationId: string;
  vehicleId: string;
  grantedToCustomerId: string | null;
  scope: VehicleAccessScope;
  source: VehicleAccessSource;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
}

export type OdometerEventStatus = "accepted" | "conflict";

export interface VehicleOdometerEventRow {
  id: string;
  vehicleId: string;
  organizationId: string;
  recordedAt: string;
  valueKm: number;
  rawValue: number;
  rawUnit: "km" | "mi";
  provenance: Provenance;
  actorId: string;
  status: OdometerEventStatus;
  conflictReason: string | null;
  createdAt: string;
}

// --- Intake and cases (0050) ---------------------------------------------
// Mirrors supabase/migrations/0050_intake_cases.sql. `cases`/everything
// under it is organization-scoped, same pattern as `customers` in 0020.

export type IntakeChannel = "whatsapp_manual" | "phone_manual" | "walk_in" | "email_manual";
export type IntakeThreadStatus = "open" | "converted" | "closed";

export interface IntakeThreadRow {
  id: string;
  organizationId: string;
  customerId: string | null;
  channel: IntakeChannel;
  status: IntakeThreadStatus;
  correlationId: string;
  createdAt: string;
  createdBy: string;
}

export type IntakeEntryDirection = "inbound" | "outbound";

export interface IntakeEntryRow {
  id: string;
  organizationId: string;
  threadId: string;
  direction: IntakeEntryDirection;
  originalText: string;
  referencedFiles: string[];
  reportedAt: string;
  recordedBy: string;
  createdAt: string;
}

export interface CaseRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  folioNumber: number;
  folioCode: string;
  customerId: string;
  vehicleId: string;
  status: CaseStatus;
  sourceIntakeThreadId: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  createdBy: string;
}

export type CaseParticipantKind = "customer" | "other_driver" | "guarantor";

export interface CaseParticipantRow {
  id: string;
  organizationId: string;
  caseId: string;
  customerId: string | null;
  participantKind: CaseParticipantKind;
  addedAt: string;
  addedBy: string;
}

export type CaseAssignmentRole = "advisor" | "inspector" | "mechanic" | "other";

export interface CaseAssignmentRow {
  id: string;
  organizationId: string;
  caseId: string;
  role: CaseAssignmentRole;
  userId: string;
  assignedAt: string;
  assignedBy: string;
  unassignedAt: string | null;
  unassignedBy: string | null;
}

export interface ServiceRequestRow {
  id: string;
  organizationId: string;
  caseId: string;
  sourceIntakeEntryId: string | null;
  summary: string;
  requestedAt: string;
  createdAt: string;
  createdBy: string;
}

export interface ReportedSymptomRow {
  id: string;
  organizationId: string;
  caseId: string;
  serviceRequestId: string | null;
  sourceIntakeEntryId: string | null;
  symptomCode: string;
  description: string;
  reportedAt: string;
  createdAt: string;
  createdBy: string;
}

/** visibility reuses the shared `Visibility` enum — "una nota internal
 * nunca se proyecta a Pass" (DATATEK_R0_D sección 7). */
export interface CaseNoteRow {
  id: string;
  organizationId: string;
  caseId: string;
  visibility: Visibility;
  body: string;
  authorId: string;
  createdAt: string;
}

export interface CaseStatusEventRow {
  id: string;
  organizationId: string;
  caseId: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  reason: string | null;
  actorId: string;
  correlationId: string | null;
  occurredAt: string;
  createdAt: string;
}

// --- Agenda and reservations (0060) ---------------------------------------
// `case_blockers`/`resource_schedules`/`capacity_blocks` exist in SQL with
// full RLS but have no writer in R0-D Fase 2 (same precedent as
// `vehicle_ownerships` in 0030 Fase 1) — not modeled here since nothing
// reads/writes them yet.

export type ResourceType = "bay" | "technician" | "equipment" | "mobile_unit";

export interface ResourceRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  resourceType: ResourceType;
  label: string;
  isActive: boolean;
  createdAt: string;
}

export interface ResourceCapabilityRow {
  id: string;
  organizationId: string;
  resourceId: string;
  capabilityKey: string;
  createdAt: string;
}

export type AppointmentStatus =
  "tentative" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show";

export interface AppointmentRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  caseId: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  purpose: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelledReason: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
}

export interface AppointmentResourceRow {
  id: string;
  organizationId: string;
  appointmentId: string;
  resourceId: string;
  createdAt: string;
}

export type AssignmentEventType =
  "resource_added" | "resource_removed" | "rescheduled" | "status_changed";

export interface AssignmentEventRow {
  id: string;
  organizationId: string;
  appointmentId: string;
  resourceId: string | null;
  eventType: AssignmentEventType;
  details: Record<string, unknown>;
  actorId: string;
  occurredAt: string;
  createdAt: string;
}

export type ReservationStatus = "hold" | "active" | "released";

export interface ResourceReservationRow {
  id: string;
  organizationId: string;
  resourceId: string;
  appointmentId: string;
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  expiresAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  createdBy: string;
  releasedAt: string | null;
  releasedReason: string | null;
}

// --- Inspection and evidence (0070) ---------------------------------------

export type InspectionStatus = "draft" | "in_progress" | "completed" | "corrected" | "invalidated";

export interface InspectionRow {
  id: string;
  organizationId: string;
  caseId: string;
  vehicleId: string;
  templateKey: string;
  templateVersionNumber: number;
  /** false once the template version is retired after this inspection
   * started — CompleteInspection's gate reads this (sección 7.4: "template
   * no vigente al iniciar"). */
  templateVersionStillActive: boolean;
  status: InspectionStatus;
  startedAt: string;
  startedBy: string;
  completedAt: string | null;
  completedBy: string | null;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
  previousInspectionId: string | null;
  odometerKmAtInspection: number | null;
  createdAt: string;
}

export interface InspectionResultRow {
  id: string;
  organizationId: string;
  inspectionId: string;
  itemKey: string;
  axle: BrakeAxle | null;
  side: BrakeSide | null;
  condition: BrakeCondition;
  provenance: Provenance;
  notes: string | null;
  actorId: string;
  measuredAt: string;
  revisionNumber: number;
  createdAt: string;
}

export interface MeasurementRow {
  id: string;
  organizationId: string;
  inspectionResultId: string;
  value: number;
  unit: string;
  provenance: Provenance;
  actorId: string;
  measuredAt: string;
  createdAt: string;
}

export type FindingUrgency = "info" | "attention" | "urgent" | "safety_critical";

export interface FindingRow {
  id: string;
  organizationId: string;
  caseId: string;
  inspectionId: string | null;
  inspectionResultId: string | null;
  description: string;
  urgency: FindingUrgency;
  visibility: Visibility;
  actorId: string;
  occurredAt: string;
  createdAt: string;
}

export interface MaintenanceRecommendationRow {
  id: string;
  organizationId: string;
  caseId: string;
  vehicleId: string;
  findingId: string | null;
  triggerKind: MaintenanceTriggerKind;
  dueAt: string | null;
  dueOdometerKm: number | null;
  basisKind: MaintenanceBasisKind;
  basisReference: Record<string, unknown>;
  status: MaintenanceStatus;
  customerExplanation: string | null;
  actorId: string;
  createdAt: string;
}

export type UploadIntentStatus = "pending" | "confirmed" | "expired" | "cancelled";

export interface UploadIntentRow {
  id: string;
  organizationId: string;
  caseId: string;
  actorId: string;
  purpose: string;
  declaredMime: string;
  declaredSizeBytes: number | null;
  visibilityRequested: Visibility;
  bucket: string;
  objectPath: string;
  status: UploadIntentStatus;
  createdAt: string;
  expiresAt: string;
}

export type EvidenceAssetStatus =
  "pending_upload" | "uploaded" | "verified" | "rejected" | "invalidated";

export interface EvidenceAssetRow {
  id: string;
  organizationId: string;
  uploadIntentId: string;
  uploaderId: string;
  bucket: string;
  path: string;
  mimeDeclared: string;
  mimeDetected: string | null;
  bytes: number | null;
  hash: string | null;
  capturedAt: string | null;
  uploadedAt: string | null;
  provenance: Provenance;
  visibilityMax: Visibility;
  status: EvidenceAssetStatus;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
  replacesAssetId: string | null;
  createdAt: string;
}

export type EvidenceEntityType = "case" | "inspection_result" | "finding";

export interface EvidenceLinkRow {
  id: string;
  organizationId: string;
  assetId: string;
  entityType: EvidenceEntityType;
  entityId: string;
  purpose: string | null;
  caption: string | null;
  visibility: Visibility;
  displayOrder: number;
  actorId: string;
  effectiveAt: string;
  createdAt: string;
}

// --- Quote and authorization (0080) ---------------------------------------
// Mirrors supabase/migrations/0080_quote_authorization.sql. `quotes` groups
// `quote_versions`; only the version has a lifecycle (sección 5.4). Money
// fields are minor-unit integers (never float, sección 4.14) — item totals
// and version subtotal/total are always recomputed server-side, never
// trusted from a client.

export interface QuoteRow {
  id: string;
  organizationId: string;
  caseId: string;
  createdAt: string;
  createdBy: string;
}

export type QuoteLineType = "service" | "part" | "labor" | "fee";
export type QuoteItemSourceType = "finding" | "recommendation" | "catalog_item" | "manual";

export interface QuoteVersionRow {
  id: string;
  organizationId: string;
  quoteId: string;
  caseId: string;
  versionNumber: number;
  status: QuoteVersionStatus;
  currency: string;
  /** Recomputed after every draft mutation for display convenience only —
   * `FreezeQuoteVersion` NEVER trusts these; it always recalculates fresh
   * from `quote_items` (sección 9.2: "recalcula desde líneas"). */
  subtotalMinor: number;
  totalMinor: number;
  snapshotHash: string | null;
  snapshotJson: string | null;
  frozenAt: string | null;
  frozenBy: string | null;
  supersededAt: string | null;
  supersededByVersionId: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  createdAt: string;
  createdBy: string;
}

export interface QuoteItemRow {
  id: string;
  organizationId: string;
  quoteVersionId: string;
  lineType: QuoteLineType;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  totalMinor: number;
  visibility: Visibility;
  requiresAuthorization: boolean;
  sourceType: QuoteItemSourceType | null;
  sourceId: string | null;
  displayOrder: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type AuthorizationAccessMethod = "pass_authenticated" | "secure_link";
export type AuthorizationTokenScope = "read" | "read_and_decide";

export interface AuthorizationRequestRow {
  id: string;
  organizationId: string;
  caseId: string;
  quoteVersionId: string;
  audienceCustomerId: string;
  status: AuthorizationRequestStatus;
  allowedMethods: AuthorizationAccessMethod[];
  expiresAt: string;
  preparedAt: string;
  preparedBy: string;
  sentAt: string | null;
  sentBy: string | null;
  sentChannel: string | null;
  sentResult: "sent" | "failed" | null;
  viewedAt: string | null;
  decidedAt: string | null;
  authorizationId: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  /** Set when a later `CreateQuoteVersion` supersedes the version this
   * request pointed to (sección 5.5: "una nueva quote version revoca
   * solicitudes pendientes de la anterior"). */
  supersededByQuoteVersionId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface AuthorizationAccessTokenRow {
  /** Public component of the token — NOT secret by itself (comparable to a
   * key id). The plaintext string handed to the caller of
   * `PrepareAuthorizationRequest` is `${id}.${secret}`; only
   * `sha256(secret)` is ever stored, in `tokenHash` (sección 10.2: "se
   * guarda únicamente el hash"). Looking a row up by `id` first is what
   * lets a WRONG secret still increment the correct row's attempt counter
   * instead of failing to identify any row at all. */
  id: string;
  organizationId: string;
  authorizationRequestId: string;
  tokenHash: string;
  scope: AuthorizationTokenScope;
  audienceCustomerId: string;
  verificationMethod: string;
  expiresAt: string;
  verifiedAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  lockedAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  nonce: string;
  idempotencyKey: string;
  createdAt: string;
}

export type AuthorizationDecisionMethod = "secure_link" | "pass_authenticated" | "staff_manual";

export interface AuthorizationRow {
  id: string;
  organizationId: string;
  caseId: string;
  authorizationRequestId: string;
  quoteVersionId: string;
  quoteVersionHash: string;
  status: AuthorizationStatus;
  actorId: string;
  audienceCustomerId: string;
  method: AuthorizationDecisionMethod;
  rejectionReason: string | null;
  decidedAt: string;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
  invalidatedBy: string | null;
  createdAt: string;
}

export type AuthorizationItemDecision = "accepted" | "rejected";

export interface AuthorizationItemRow {
  id: string;
  organizationId: string;
  authorizationId: string;
  quoteVersionId: string;
  quoteItemId: string;
  // Snapshot at decision time — never a live reference back to
  // `quote_items` (sección 9.4: "snapshot de descripción, cantidad,
  // precio, moneda y términos").
  descriptionSnapshot: string;
  quantitySnapshot: number;
  unitPriceMinorSnapshot: number;
  currencySnapshot: string;
  decision: AuthorizationItemDecision;
  acceptedQuantity: number | null;
  rejectionReason: string | null;
  decidedAt: string;
}

export type AuthorizationEventType =
  | "prepared"
  | "sent"
  | "send_failed"
  | "viewed"
  | "access_denied"
  | "decided"
  | "invalidated"
  | "superseded"
  // Fase 4a — `RevokeAndReprepareAuthorizationRequest`
  // (authorization-commands.ts). Distinct from "superseded": that event
  // means a NEW quote version made this request stale; "revoked" means the
  // SAME frozen version is still valid but a staff member manually killed
  // this request/token pair to reissue a fresh one (blocked/lost link,
  // expiring soon, etc). ola `0085`/`0080` — added to the
  // `authorization_events.event_type` check constraint in
  // `supabase/migrations/0080_quote_authorization.sql` alongside this.
  | "revoked";

export interface AuthorizationEventRow {
  id: string;
  organizationId: string;
  caseId: string;
  authorizationRequestId: string;
  authorizationId: string | null;
  eventType: AuthorizationEventType;
  details: Record<string, unknown>;
  actorId: string;
  occurredAt: string;
  createdAt: string;
}

// --- Fase 4a: catálogo mínimo (0040) para getServicePricePresentation ------
// R0-D Fase 1-3 never implemented a catalog WRITE command (sección 6:
// "catálogo neutral... UI lee de base" was scoped to `0040`'s migration
// only). `getServicePricePresentation` (DATATEK_R0_D sección 3.1) still
// needs SOMETHING real to read from `CrmVehicleState` rather than a static
// fixture, so this is a minimal, seed-only row — same precedent as
// `resources` in `commands/fixtures.ts` (0060) before any `CreateResource`
// command existed: the table is real and seeded, its writer command is
// still future work. Neutral/global (no `organizationId`) per sección 6
// "catálogo neutral" — R0 never implements per-org `service_catalog_overrides`
// either.

export interface ServiceCatalogItemRow {
  id: string;
  key: string;
  name: string;
  priceMode: ServicePriceMode;
  fixedAmountMinor: number | null;
  fromAmountMinor: number | null;
  rangeMinAmountMinor: number | null;
  rangeMaxAmountMinor: number | null;
  currency: string;
  note: string | null;
}

// --- Fase 4a: features (0086) -----------------------------------------------
// SQL model in `supabase/migrations/0086_features.sql`. One real,
// checkable flag: `authorization_reissue` gates
// `RevokeAndReprepareAuthorizationRequest` (authorization-commands.ts) — see
// that command and its tests for the actual enforcement, not just schema.

export interface FeatureFlagRow {
  id: string;
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagOverrideRow {
  id: string;
  organizationId: string;
  featureFlagId: string;
  enabled: boolean;
  reason: string | null;
  createdAt: string;
  createdBy: string;
}

/** `authorization_reissue` — gates `RevokeAndReprepareAuthorizationRequest`.
 * R0-D Fase 4a has no `SetFeatureFlagOverride` command yet (out of scope —
 * see docs/domain/query-contracts.md), so overrides are only reachable by
 * constructing state directly in a test, same precedent as seeding
 * `resources` by hand in `commands/test-helpers.ts` before any
 * `CreateResource` command existed. */
export const FEATURE_KEY_AUTHORIZATION_REISSUE = "authorization_reissue" as const;

/** Org-level override wins over the flag's `defaultEnabled` when present.
 * An unknown key (no row in `featureFlags`) resolves to `false` — a typo or
 * a flag that was never seeded must never silently behave as "on". */
export function isFeatureEnabled(
  state: CrmVehicleState,
  organizationId: string,
  key: string,
): boolean {
  const flag = state.featureFlags.find((f) => f.key === key);
  if (!flag) return false;
  const override = state.featureFlagOverrides.find(
    (o) => o.organizationId === organizationId && o.featureFlagId === flag.id,
  );
  return override ? override.enabled : flag.defaultEnabled;
}

// --- Cross-cutting: organization counters, idempotency, audit -----------
// Mirrors `organization_counters` (0010) + the
// `datatek_platform.next_organization_counter` helper added in
// 0050_intake_cases.sql — folio secuencial POR ORGANIZACIÓN, nunca global.

export interface OrganizationCounterRecord {
  organizationId: string;
  counterKey: string;
  nextValue: number;
}

/** Same upsert semantics as `datatek_platform.next_organization_counter`:
 * returns the value to USE now and advances the stored counter by one. */
export function consumeOrganizationCounter(
  state: CrmVehicleState,
  organizationId: string,
  counterKey: string,
): { value: number; nextState: CrmVehicleState } {
  const existing = state.organizationCounters.find(
    (c) => c.organizationId === organizationId && c.counterKey === counterKey,
  );
  const value = existing?.nextValue ?? 1;
  const updated: OrganizationCounterRecord = { organizationId, counterKey, nextValue: value + 1 };
  const organizationCounters = existing
    ? state.organizationCounters.map((c) =>
        c.organizationId === organizationId && c.counterKey === counterKey ? updated : c,
      )
    : [...state.organizationCounters, updated];
  return { value, nextState: { ...state, organizationCounters } };
}

export interface IdempotencyRecord {
  key: string;
  organizationId: string;
  commandName: string;
  /** sha256 hex of a canonical serialization of the command's input —
   * DATATEK_R0_E hardening sección 7 ("hash de input"). Optional and, as of
   * this pass, only populated by the 6 commands sección 7 names as
   * "obligatorios" (`CreateCaseFromIntake`, `ScheduleAppointment`,
   * `ConfirmEvidenceUpload`, `FreezeQuoteVersion`,
   * `PrepareAuthorizationRequest`, `RecordAuthorization` — see
   * `checkIdempotencyKeyConflict` below and its call sites). Every other
   * command in this engine still matches a replay on
   * `(organizationId, commandName, key)` alone, same as before this pass —
   * a known, documented gap (DATATEK_R0_E_FASE1_REPORT.md), not silently
   * widened to every command in one sweep. */
  inputHash?: string;
  /** Serializable snapshot of the successful result, replayed verbatim on a
   * repeat call with the same key instead of re-running the command. */
  resultSummary: unknown;
  createdAt: string;
}

export interface AuditEventRecord {
  id: string;
  organizationId: string;
  actorId: string;
  correlationId: string;
  commandName: string;
  occurredAt: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface CrmVehicleState {
  customers: CustomerRow[];
  customerContacts: CustomerContactRow[];
  customerAuthLinks: CustomerAuthLinkRow[];
  vehicles: VehicleRow[];
  vehicleIdentifiers: VehicleIdentifierRow[];
  vehicleOwnershipClaims: VehicleOwnershipClaimRow[];
  vehicleAccessGrants: VehicleAccessGrantRow[];
  vehicleOdometerEvents: VehicleOdometerEventRow[];
  // --- 0050 intake and cases ---
  intakeThreads: IntakeThreadRow[];
  intakeEntries: IntakeEntryRow[];
  cases: CaseRow[];
  caseParticipants: CaseParticipantRow[];
  caseAssignments: CaseAssignmentRow[];
  serviceRequests: ServiceRequestRow[];
  reportedSymptoms: ReportedSymptomRow[];
  caseNotes: CaseNoteRow[];
  caseStatusEvents: CaseStatusEventRow[];
  // --- 0060 agenda and reservations ---
  resources: ResourceRow[];
  resourceCapabilities: ResourceCapabilityRow[];
  appointments: AppointmentRow[];
  appointmentResources: AppointmentResourceRow[];
  assignmentEvents: AssignmentEventRow[];
  resourceReservations: ResourceReservationRow[];
  // --- 0070 inspection and evidence ---
  inspections: InspectionRow[];
  inspectionResults: InspectionResultRow[];
  measurements: MeasurementRow[];
  findings: FindingRow[];
  maintenanceRecommendations: MaintenanceRecommendationRow[];
  uploadIntents: UploadIntentRow[];
  evidenceAssets: EvidenceAssetRow[];
  evidenceLinks: EvidenceLinkRow[];
  // --- 0080 quote and authorization ---
  quotes: QuoteRow[];
  quoteVersions: QuoteVersionRow[];
  quoteItems: QuoteItemRow[];
  authorizationRequests: AuthorizationRequestRow[];
  authorizationAccessTokens: AuthorizationAccessTokenRow[];
  authorizations: AuthorizationRow[];
  authorizationItems: AuthorizationItemRow[];
  authorizationEvents: AuthorizationEventRow[];
  // --- Fase 4a: catálogo mínimo (0040) + features (0086) ---
  serviceCatalogItems: ServiceCatalogItemRow[];
  featureFlags: FeatureFlagRow[];
  featureFlagOverrides: FeatureFlagOverrideRow[];
  idempotencyRecords: IdempotencyRecord[];
  auditLog: AuditEventRecord[];
  organizationCounters: OrganizationCounterRecord[];
}

export function createEmptyState(): CrmVehicleState {
  return {
    customers: [],
    customerContacts: [],
    customerAuthLinks: [],
    vehicles: [],
    vehicleIdentifiers: [],
    vehicleOwnershipClaims: [],
    vehicleAccessGrants: [],
    vehicleOdometerEvents: [],
    intakeThreads: [],
    intakeEntries: [],
    cases: [],
    caseParticipants: [],
    caseAssignments: [],
    serviceRequests: [],
    reportedSymptoms: [],
    caseNotes: [],
    caseStatusEvents: [],
    resources: [],
    resourceCapabilities: [],
    appointments: [],
    appointmentResources: [],
    assignmentEvents: [],
    resourceReservations: [],
    inspections: [],
    inspectionResults: [],
    measurements: [],
    findings: [],
    maintenanceRecommendations: [],
    uploadIntents: [],
    evidenceAssets: [],
    evidenceLinks: [],
    quotes: [],
    quoteVersions: [],
    quoteItems: [],
    authorizationRequests: [],
    authorizationAccessTokens: [],
    authorizations: [],
    authorizationItems: [],
    authorizationEvents: [],
    serviceCatalogItems: [],
    featureFlags: [],
    featureFlagOverrides: [],
    idempotencyRecords: [],
    auditLog: [],
    organizationCounters: [],
  };
}

// --- Shared command outcome shape ---------------------------------------

import type { CommandError, CommandContext } from "./context.ts";

// The optional `nextState` on the failure branch exists for exactly one
// use case (0080, authorization-commands.ts): a WRONG token secret is a
// command failure, but DATATEK_R0_A sección 10.2 still requires the
// attempt counter on that token row to increment and lock after 5 tries —
// the failed attempt itself has a side effect. Every other command in this
// engine leaves it `undefined`, and `createCommandEngine`'s `apply()`
// leaves `state` untouched when it is absent — this is purely additive.
export type CommandOutcome<T> =
  | { ok: true; nextState: CrmVehicleState; data: T; replayed: boolean }
  | { ok: false; error: CommandError; nextState?: CrmVehicleState };

export function findIdempotentReplay<T>(
  state: CrmVehicleState,
  ctx: CommandContext,
  commandName: string,
): T | undefined {
  const found = state.idempotencyRecords.find(
    (r) =>
      r.organizationId === ctx.organizationId &&
      r.commandName === commandName &&
      r.key === ctx.idempotencyKey,
  );
  return found ? (found.resultSummary as T) : undefined;
}

export function appendIdempotencyRecord(
  ctx: CommandContext,
  commandName: string,
  resultSummary: unknown,
  inputHash?: string,
): IdempotencyRecord {
  return {
    key: ctx.idempotencyKey,
    organizationId: ctx.organizationId,
    commandName,
    resultSummary,
    createdAt: ctx.now.toISOString(),
    ...(inputHash != null ? { inputHash } : {}),
  };
}

/** Deterministic, sorted-key clone used only to make `JSON.stringify`
 * produce the SAME string for two structurally-equal objects regardless of
 * the order their keys were set in — plain `JSON.stringify` preserves
 * insertion order, which would make `hashCommandInput` produce different
 * hashes for semantically identical inputs built in a different order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value != null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** sha256 hex of a canonical (sorted-key) JSON serialization of `input` —
 * DATATEK_R0_E hardening sección 7, "hash de input". Used ONLY to detect
 * "misma idempotency key, input DISTINTO" (sección 7: "falla con error
 * claro; no debe devolver silenciosamente el resultado viejo") — never to
 * identify or authenticate anything. Every mandated caller below hashes its
 * own already-validated command `input` object directly (ids, enums,
 * amounts, dates) — sección 7 also requires "claves [de idempotencia] no
 * contienen PII"; this hash is not the key itself, but the same
 * expectation applies to what it is derived from, and none of the 6
 * mandated commands' inputs carry a customer's name/phone/email (those live
 * on rows the input only references by id). */
export function hashCommandInput(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)), "utf8")
    .digest("hex");
}

/** DATATEK_R0_E hardening sección 7: "misma key + input distinto falla". A
 * narrow, ADDITIVE guard a command calls before its normal
 * `findIdempotentReplay` check. Only changes behavior when a PRIOR record
 * exists for the same `(organizationId, commandName, key)` AND that record
 * carries a stored `inputHash` AND it differs from `expectedInputHash` — in
 * every other case (no prior record; prior record has no `inputHash` because
 * it predates this pass or belongs to a command that does not opt in; hashes
 * match) this returns `null` and the caller proceeds exactly as before. This
 * is what keeps the fix bounded to the 6 sección-7-mandated commands instead
 * of touching every command's idempotency behavior in one sweep — see the
 * comment on `IdempotencyRecord.inputHash`. */
export function checkIdempotencyKeyConflict(
  state: CrmVehicleState,
  ctx: CommandContext,
  commandName: string,
  expectedInputHash: string,
): CommandError | null {
  const found = state.idempotencyRecords.find(
    (r) =>
      r.organizationId === ctx.organizationId &&
      r.commandName === commandName &&
      r.key === ctx.idempotencyKey,
  );
  if (found && found.inputHash != null && found.inputHash !== expectedInputHash) {
    return {
      code: "CONFLICT",
      message:
        "Esta idempotency key ya se usó con un input distinto para este comando — una misma key debe representar siempre el mismo intento, con el mismo contenido.",
    };
  }
  return null;
}

export function appendAuditEvent(
  ctx: CommandContext,
  commandName: string,
  summary: string,
  payload: Record<string, unknown>,
): AuditEventRecord {
  return {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    correlationId: ctx.correlationId,
    commandName,
    occurredAt: ctx.now.toISOString(),
    summary,
    payload,
  };
}

/** Every row id in this engine is generated the same way real Postgres rows
 * would be (`gen_random_uuid()`), except commands are "pure" only in the
 * architectural sense used across this codebase — no fetch, no framework,
 * no hidden I/O — not in the mathematical sense of always returning the
 * same output for the same input. `crypto.randomUUID()` is the one
 * intentional exception, exactly like `gen_random_uuid()` is in SQL. */
export function cryptoRandomId(): string {
  return globalThis.crypto.randomUUID();
}
