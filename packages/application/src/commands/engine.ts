// In-memory fixture command engine — DATATEK_R0_D.
//
// Wraps the pure command functions with a single mutable `state` reference
// so callers (apps/web's temporary dev route, tests) can invoke commands
// imperatively without re-threading state by hand. This is the "imperative
// shell" around the "functional core" in commands/*.ts — the engine itself
// contains no business logic, only orchestration (apply the outcome, keep
// the latest state).
//
// apps/web instantiates exactly one of these as a module-level singleton
// (see apps/web/src/lib/commands-engine.ts) so it survives for the life of
// the `pnpm dev` Node process — there is no Postgres to persist to yet.
//
// Fase 2 adds the 20 intake/case, agenda and inspection/evidence commands
// alongside the 6 Fase 1 CRM/vehicle commands — same `apply(...)` pattern,
// one method per command.
import type { CommandContext, CommandError } from "./context.ts";
import {
  createEmptyState,
  type CrmVehicleState,
  type CustomerRow,
  type CustomerContactRow,
  type CustomerAuthLinkRow,
  type VehicleOwnershipClaimRow,
  type VehicleOdometerEventRow,
  type IntakeEntryRow,
  type ReportedSymptomRow,
  type CaseRow,
  type CaseAssignmentRow,
  type CaseNoteRow,
  type ResourceReservationRow,
  type AppointmentRow,
  type InspectionResultRow,
  type MeasurementRow,
  type FindingRow,
  type MaintenanceRecommendationRow,
  type UploadIntentRow,
  type EvidenceAssetRow,
  type QuoteRow,
  type QuoteVersionRow,
  type QuoteItemRow,
  type AuthorizationRequestRow,
  type AuthorizationRow,
  type ProductCatalogItemRow,
  type MarketQuoteRequestRow,
  type MarketOfferRow,
} from "./state.ts";
import {
  createProvisionalCustomer,
  addCustomerContact,
  linkCustomerAuthIdentity,
  type CreateProvisionalCustomerInput,
  type AddCustomerContactInput,
  type LinkCustomerAuthIdentityInput,
} from "./crm-commands.ts";
import {
  registerVehicle,
  createVehicleOwnershipClaim,
  recordOdometerEvent,
  type RegisterVehicleInput,
  type RegisterVehicleOutput,
  type CreateVehicleOwnershipClaimInput,
  type RecordOdometerEventInput,
} from "./vehicle-commands.ts";
import {
  createManualIntake,
  appendIntakeEntry,
  interpretReportedSymptom,
  createCaseFromIntake,
  assignCaseParticipant,
  transitionCase,
  addCaseNote,
  type CreateManualIntakeInput,
  type CreateManualIntakeOutput,
  type AppendIntakeEntryInput,
  type InterpretReportedSymptomInput,
  type CreateCaseFromIntakeInput,
  type CreateCaseFromIntakeOutput,
  type AssignCaseParticipantInput,
  type TransitionCaseInput,
  type AddCaseNoteInput,
} from "./intake-commands.ts";
import {
  createTemporaryReservation,
  scheduleAppointment,
  confirmAppointment,
  cancelAppointment,
  receiveVehicle,
  type CreateTemporaryReservationInput,
  type ScheduleAppointmentInput,
  type ScheduleAppointmentOutput,
  type ConfirmAppointmentInput,
  type CancelAppointmentInput,
  type ReceiveVehicleInput,
  type ReceiveVehicleOutput,
} from "./agenda-commands.ts";
import {
  startInspection,
  recordInspectionResult,
  recordMeasurement,
  recordFinding,
  createMaintenanceRecommendation,
  createUploadIntent,
  confirmEvidenceUpload,
  linkEvidence,
  completeInspection,
  type StartInspectionInput,
  type StartInspectionOutput,
  type RecordInspectionResultInput,
  type RecordMeasurementInput,
  type RecordFindingInput,
  type CreateMaintenanceRecommendationInput,
  type CreateUploadIntentInput,
  type ConfirmEvidenceUploadInput,
  type LinkEvidenceInput,
  type LinkEvidenceOutput,
  type CompleteInspectionInput,
  type CompleteInspectionOutput,
} from "./inspection-commands.ts";
import {
  createQuote,
  createQuoteVersion,
  addQuoteItem,
  updateDraftQuoteItem,
  freezeQuoteVersion,
  type CreateQuoteInput,
  type CreateQuoteVersionInput,
  type CreateQuoteVersionOutput,
  type AddQuoteItemInput,
  type UpdateDraftQuoteItemInput,
  type FreezeQuoteVersionInput,
} from "./quote-commands.ts";
import {
  prepareAuthorizationRequest,
  markAuthorizationRequestSent,
  verifyAuthorizationAccess,
  recordAuthorization,
  invalidateAuthorization,
  revokeAndReprepareAuthorizationRequest,
  type PrepareAuthorizationRequestInput,
  type PrepareAuthorizationRequestOutput,
  type MarkAuthorizationRequestSentInput,
  type VerifyAuthorizationAccessInput,
  type VerifyAuthorizationAccessOutput,
  type RecordAuthorizationInput,
  type RecordAuthorizationOutput,
  type InvalidateAuthorizationInput,
  type RevokeAndReprepareAuthorizationRequestInput,
  type RevokeAndReprepareAuthorizationRequestOutput,
} from "./authorization-commands.ts";
import {
  openCaseFromRequest,
  type OpenCaseFromRequestInput,
  type OpenCaseFromRequestOutput,
} from "./open-case-journey.ts";
import {
  registerProduct,
  adjustProductStock,
  type RegisterProductInput,
  type AdjustProductStockInput,
} from "./product-catalog-commands.ts";
import {
  createMarketQuoteRequest,
  submitMarketOffer,
  respondToMarketOffer,
  type CreateMarketQuoteRequestInput,
  type SubmitMarketOfferInput,
  type RespondToMarketOfferInput,
} from "./market-request-commands.ts";

export type CommandResult<T> =
  { ok: true; data: T; replayed: boolean } | { ok: false; error: CommandError };

export interface CommandEngine {
  getState(): CrmVehicleState;
  reset(seed?: CrmVehicleState): void;

  /** Atomic Pro intake: customer + vehicle + original request + case. */
  openCaseFromRequest(
    ctx: CommandContext,
    input: OpenCaseFromRequestInput,
  ): CommandResult<OpenCaseFromRequestOutput>;

  // --- CRM and vehicle (Fase 1) ---
  createProvisionalCustomer(
    ctx: CommandContext,
    input: CreateProvisionalCustomerInput,
  ): CommandResult<CustomerRow>;
  addCustomerContact(
    ctx: CommandContext,
    input: AddCustomerContactInput,
  ): CommandResult<CustomerContactRow>;
  linkCustomerAuthIdentity(
    ctx: CommandContext,
    input: LinkCustomerAuthIdentityInput,
  ): CommandResult<CustomerAuthLinkRow>;
  registerVehicle(
    ctx: CommandContext,
    input: RegisterVehicleInput,
  ): CommandResult<RegisterVehicleOutput>;
  createVehicleOwnershipClaim(
    ctx: CommandContext,
    input: CreateVehicleOwnershipClaimInput,
  ): CommandResult<VehicleOwnershipClaimRow>;
  recordOdometerEvent(
    ctx: CommandContext,
    input: RecordOdometerEventInput,
  ): CommandResult<VehicleOdometerEventRow>;

  // --- Intake and case (Fase 2) ---
  createManualIntake(
    ctx: CommandContext,
    input: CreateManualIntakeInput,
  ): CommandResult<CreateManualIntakeOutput>;
  appendIntakeEntry(
    ctx: CommandContext,
    input: AppendIntakeEntryInput,
  ): CommandResult<IntakeEntryRow>;
  interpretReportedSymptom(
    ctx: CommandContext,
    input: InterpretReportedSymptomInput,
  ): CommandResult<ReportedSymptomRow>;
  createCaseFromIntake(
    ctx: CommandContext,
    input: CreateCaseFromIntakeInput,
  ): CommandResult<CreateCaseFromIntakeOutput>;
  assignCaseParticipant(
    ctx: CommandContext,
    input: AssignCaseParticipantInput,
  ): CommandResult<CaseAssignmentRow>;
  transitionCase(ctx: CommandContext, input: TransitionCaseInput): CommandResult<CaseRow>;
  addCaseNote(ctx: CommandContext, input: AddCaseNoteInput): CommandResult<CaseNoteRow>;

  // --- Agenda (Fase 2) ---
  createTemporaryReservation(
    ctx: CommandContext,
    input: CreateTemporaryReservationInput,
  ): CommandResult<ResourceReservationRow>;
  scheduleAppointment(
    ctx: CommandContext,
    input: ScheduleAppointmentInput,
  ): CommandResult<ScheduleAppointmentOutput>;
  confirmAppointment(
    ctx: CommandContext,
    input: ConfirmAppointmentInput,
  ): CommandResult<AppointmentRow>;
  cancelAppointment(
    ctx: CommandContext,
    input: CancelAppointmentInput,
  ): CommandResult<AppointmentRow>;
  receiveVehicle(
    ctx: CommandContext,
    input: ReceiveVehicleInput,
  ): CommandResult<ReceiveVehicleOutput>;

  // --- Inspection and evidence (Fase 2) ---
  startInspection(
    ctx: CommandContext,
    input: StartInspectionInput,
  ): CommandResult<StartInspectionOutput>;
  recordInspectionResult(
    ctx: CommandContext,
    input: RecordInspectionResultInput,
  ): CommandResult<InspectionResultRow>;
  recordMeasurement(
    ctx: CommandContext,
    input: RecordMeasurementInput,
  ): CommandResult<MeasurementRow>;
  recordFinding(ctx: CommandContext, input: RecordFindingInput): CommandResult<FindingRow>;
  createMaintenanceRecommendation(
    ctx: CommandContext,
    input: CreateMaintenanceRecommendationInput,
  ): CommandResult<MaintenanceRecommendationRow>;
  createUploadIntent(
    ctx: CommandContext,
    input: CreateUploadIntentInput,
  ): CommandResult<UploadIntentRow>;
  confirmEvidenceUpload(
    ctx: CommandContext,
    input: ConfirmEvidenceUploadInput,
  ): CommandResult<EvidenceAssetRow>;
  linkEvidence(ctx: CommandContext, input: LinkEvidenceInput): CommandResult<LinkEvidenceOutput>;
  completeInspection(
    ctx: CommandContext,
    input: CompleteInspectionInput,
  ): CommandResult<CompleteInspectionOutput>;

  // --- Quote (Fase 3) ---
  createQuote(ctx: CommandContext, input: CreateQuoteInput): CommandResult<QuoteRow>;
  createQuoteVersion(
    ctx: CommandContext,
    input: CreateQuoteVersionInput,
  ): CommandResult<CreateQuoteVersionOutput>;
  addQuoteItem(ctx: CommandContext, input: AddQuoteItemInput): CommandResult<QuoteItemRow>;
  updateDraftQuoteItem(
    ctx: CommandContext,
    input: UpdateDraftQuoteItemInput,
  ): CommandResult<QuoteItemRow>;
  freezeQuoteVersion(
    ctx: CommandContext,
    input: FreezeQuoteVersionInput,
  ): CommandResult<QuoteVersionRow>;

  // --- Authorization (Fase 3) ---
  prepareAuthorizationRequest(
    ctx: CommandContext,
    input: PrepareAuthorizationRequestInput,
  ): CommandResult<PrepareAuthorizationRequestOutput>;
  markAuthorizationRequestSent(
    ctx: CommandContext,
    input: MarkAuthorizationRequestSentInput,
  ): CommandResult<AuthorizationRequestRow>;
  verifyAuthorizationAccess(
    ctx: CommandContext,
    input: VerifyAuthorizationAccessInput,
  ): CommandResult<VerifyAuthorizationAccessOutput>;
  recordAuthorization(
    ctx: CommandContext,
    input: RecordAuthorizationInput,
  ): CommandResult<RecordAuthorizationOutput>;
  invalidateAuthorization(
    ctx: CommandContext,
    input: InvalidateAuthorizationInput,
  ): CommandResult<AuthorizationRow>;
  revokeAndReprepareAuthorizationRequest(
    ctx: CommandContext,
    input: RevokeAndReprepareAuthorizationRequestInput,
  ): CommandResult<RevokeAndReprepareAuthorizationRequestOutput>;

  // --- Product catalog (Fase 4a, F0.5) ---
  registerProduct(
    ctx: CommandContext,
    input: RegisterProductInput,
  ): CommandResult<ProductCatalogItemRow>;
  adjustProductStock(
    ctx: CommandContext,
    input: AdjustProductStockInput,
  ): CommandResult<ProductCatalogItemRow>;

  // --- Market: solicitudes de cotización de invitado ---
  createMarketQuoteRequest(
    ctx: CommandContext,
    input: CreateMarketQuoteRequestInput,
  ): CommandResult<MarketQuoteRequestRow>;
  submitMarketOffer(ctx: CommandContext, input: SubmitMarketOfferInput): CommandResult<MarketOfferRow>;
  respondToMarketOffer(
    ctx: CommandContext,
    input: RespondToMarketOfferInput,
  ): CommandResult<MarketQuoteRequestRow>;
}

export function createCommandEngine(seed: CrmVehicleState = createEmptyState()): CommandEngine {
  let state = seed;

  function apply<T>(
    outcome:
      | { ok: true; nextState: CrmVehicleState; data: T; replayed: boolean }
      | { ok: false; error: CommandError; nextState?: CrmVehicleState },
  ): CommandResult<T> {
    if (!outcome.ok) {
      // See the comment on `CommandOutcome` (commands/state.ts): a handful
      // of 0080 commands (token verification) mutate state even on a
      // handled failure — e.g. incrementing a failed-attempt counter.
      if (outcome.nextState) state = outcome.nextState;
      return { ok: false, error: outcome.error };
    }
    state = outcome.nextState;
    return { ok: true, data: outcome.data, replayed: outcome.replayed };
  }

  return {
    getState: () => state,
    reset: (nextSeed = createEmptyState()) => {
      state = nextSeed;
    },

    openCaseFromRequest: (ctx, input) => apply(openCaseFromRequest(state, ctx, input)),

    createProvisionalCustomer: (ctx, input) => apply(createProvisionalCustomer(state, ctx, input)),
    addCustomerContact: (ctx, input) => apply(addCustomerContact(state, ctx, input)),
    linkCustomerAuthIdentity: (ctx, input) => apply(linkCustomerAuthIdentity(state, ctx, input)),
    registerVehicle: (ctx, input) => apply(registerVehicle(state, ctx, input)),
    createVehicleOwnershipClaim: (ctx, input) =>
      apply(createVehicleOwnershipClaim(state, ctx, input)),
    recordOdometerEvent: (ctx, input) => apply(recordOdometerEvent(state, ctx, input)),

    createManualIntake: (ctx, input) => apply(createManualIntake(state, ctx, input)),
    appendIntakeEntry: (ctx, input) => apply(appendIntakeEntry(state, ctx, input)),
    interpretReportedSymptom: (ctx, input) => apply(interpretReportedSymptom(state, ctx, input)),
    createCaseFromIntake: (ctx, input) => apply(createCaseFromIntake(state, ctx, input)),
    assignCaseParticipant: (ctx, input) => apply(assignCaseParticipant(state, ctx, input)),
    transitionCase: (ctx, input) => apply(transitionCase(state, ctx, input)),
    addCaseNote: (ctx, input) => apply(addCaseNote(state, ctx, input)),

    createTemporaryReservation: (ctx, input) =>
      apply(createTemporaryReservation(state, ctx, input)),
    scheduleAppointment: (ctx, input) => apply(scheduleAppointment(state, ctx, input)),
    confirmAppointment: (ctx, input) => apply(confirmAppointment(state, ctx, input)),
    cancelAppointment: (ctx, input) => apply(cancelAppointment(state, ctx, input)),
    receiveVehicle: (ctx, input) => apply(receiveVehicle(state, ctx, input)),

    startInspection: (ctx, input) => apply(startInspection(state, ctx, input)),
    recordInspectionResult: (ctx, input) => apply(recordInspectionResult(state, ctx, input)),
    recordMeasurement: (ctx, input) => apply(recordMeasurement(state, ctx, input)),
    recordFinding: (ctx, input) => apply(recordFinding(state, ctx, input)),
    createMaintenanceRecommendation: (ctx, input) =>
      apply(createMaintenanceRecommendation(state, ctx, input)),
    createUploadIntent: (ctx, input) => apply(createUploadIntent(state, ctx, input)),
    confirmEvidenceUpload: (ctx, input) => apply(confirmEvidenceUpload(state, ctx, input)),
    linkEvidence: (ctx, input) => apply(linkEvidence(state, ctx, input)),
    completeInspection: (ctx, input) => apply(completeInspection(state, ctx, input)),

    createQuote: (ctx, input) => apply(createQuote(state, ctx, input)),
    createQuoteVersion: (ctx, input) => apply(createQuoteVersion(state, ctx, input)),
    addQuoteItem: (ctx, input) => apply(addQuoteItem(state, ctx, input)),
    updateDraftQuoteItem: (ctx, input) => apply(updateDraftQuoteItem(state, ctx, input)),
    freezeQuoteVersion: (ctx, input) => apply(freezeQuoteVersion(state, ctx, input)),

    prepareAuthorizationRequest: (ctx, input) =>
      apply(prepareAuthorizationRequest(state, ctx, input)),
    markAuthorizationRequestSent: (ctx, input) =>
      apply(markAuthorizationRequestSent(state, ctx, input)),
    verifyAuthorizationAccess: (ctx, input) => apply(verifyAuthorizationAccess(state, ctx, input)),
    recordAuthorization: (ctx, input) => apply(recordAuthorization(state, ctx, input)),
    invalidateAuthorization: (ctx, input) => apply(invalidateAuthorization(state, ctx, input)),
    revokeAndReprepareAuthorizationRequest: (ctx, input) =>
      apply(revokeAndReprepareAuthorizationRequest(state, ctx, input)),

    registerProduct: (ctx, input) => apply(registerProduct(state, ctx, input)),
    adjustProductStock: (ctx, input) => apply(adjustProductStock(state, ctx, input)),

    createMarketQuoteRequest: (ctx, input) => apply(createMarketQuoteRequest(state, ctx, input)),
    submitMarketOffer: (ctx, input) => apply(submitMarketOffer(state, ctx, input)),
    respondToMarketOffer: (ctx, input) => apply(respondToMarketOffer(state, ctx, input)),
  };
}
