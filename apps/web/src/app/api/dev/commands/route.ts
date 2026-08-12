import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveOrganizationCapabilities } from "@datatek/auth";
import { buildFixtureTenancySnapshot, FIXTURE_ORGANIZATIONS } from "@datatek/application";
import { buildCommandContext } from "@datatek/application/commands";
import { getCommandsEngine } from "../../../../lib/commands-engine";
import {
  isCommandName,
  COMMAND_SCHEMAS,
  createProvisionalCustomerSchema,
  addCustomerContactSchema,
  linkCustomerAuthIdentitySchema,
  registerVehicleSchema,
  createVehicleOwnershipClaimSchema,
  recordOdometerEventSchema,
  createManualIntakeSchema,
  appendIntakeEntrySchema,
  interpretReportedSymptomSchema,
  createCaseFromIntakeSchema,
  assignCaseParticipantSchema,
  transitionCaseSchema,
  addCaseNoteSchema,
  createTemporaryReservationSchema,
  scheduleAppointmentSchema,
  confirmAppointmentSchema,
  cancelAppointmentSchema,
  receiveVehicleSchema,
  startInspectionSchema,
  recordInspectionResultSchema,
  recordMeasurementSchema,
  recordFindingSchema,
  createMaintenanceRecommendationSchema,
  createUploadIntentSchema,
  confirmEvidenceUploadSchema,
  linkEvidenceSchema,
  completeInspectionSchema,
  createQuoteSchema,
  createQuoteVersionSchema,
  addQuoteItemSchema,
  updateDraftQuoteItemSchema,
  freezeQuoteVersionSchema,
  prepareAuthorizationRequestSchema,
  markAuthorizationRequestSentSchema,
  verifyAuthorizationAccessSchema,
  recordAuthorizationSchema,
  invalidateAuthorizationSchema,
  revokeAndReprepareAuthorizationRequestSchema,
} from "./schemas";

// TEMPORARY DEV-ONLY ROUTE — DATATEK_R0_D Fase 1 + Fase 2 + Fase 3.
//
// This is scaffolding, not a product surface. R0-D requires all 36 CRM/
// vehicle/intake/case/agenda/inspection/evidence/quote/authorization
// commands to be invokable and verifiable end-to-end against the in-memory
// fixture engine (no Postgres reachable yet — see
// docs/runbooks/database-reset.md), rather
// than left as pure functions nothing exercises outside unit tests. This
// route is that harness: it has none of the hardening a real endpoint
// needs (no CSRF, no rate limiting, no session cookie — the actor is
// passed explicitly in the body instead of resolved from a session, unlike
// every real Pro page) and refuses to respond outside development. A later
// R0-D phase replaces it with the real Pro UI calling these same command
// functions from a server action/loader once Postgres is reachable — the
// functions and the engine they run on do not change, only who calls them.
export const dynamic = "force-dynamic";

const TENANCY_SNAPSHOT = buildFixtureTenancySnapshot();

const requestSchema = z.object({
  command: z.string(),
  orgSlug: z.string(),
  actorId: z.string(),
  branchId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
  correlationId: z.string().optional(),
  input: z.unknown().optional(),
});

function devOnlyGuard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export function GET() {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;
  return NextResponse.json({ state: getCommandsEngine().getState() });
}

export async function POST(request: Request) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsedRequest = requestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsedRequest.error.issues },
      { status: 400 },
    );
  }
  const { command, orgSlug, actorId, branchId, idempotencyKey, correlationId, input } =
    parsedRequest.data;

  if (!isCommandName(command)) {
    return NextResponse.json(
      { error: "unknown_command", commands: Object.keys(COMMAND_SCHEMAS) },
      { status: 400 },
    );
  }

  const org = FIXTURE_ORGANIZATIONS.find((o) => o.slug === orgSlug);
  if (!org) {
    return NextResponse.json({ error: "unknown_org" }, { status: 400 });
  }

  const now = new Date();
  const capabilities = resolveOrganizationCapabilities(actorId, org.id, now, TENANCY_SNAPSHOT);
  const ctx = buildCommandContext({
    actorId,
    organizationId: org.id,
    branchId: branchId ?? null,
    capabilities,
    idempotencyKey,
    correlationId: correlationId ?? globalThis.crypto.randomUUID(),
    now,
  });

  const engine = getCommandsEngine();

  let result;
  switch (command) {
    case "CreateProvisionalCustomer": {
      const parsedInput = createProvisionalCustomerSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createProvisionalCustomer(ctx, parsedInput.data);
      break;
    }
    case "AddCustomerContact": {
      const parsedInput = addCustomerContactSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.addCustomerContact(ctx, parsedInput.data);
      break;
    }
    case "LinkCustomerAuthIdentity": {
      const parsedInput = linkCustomerAuthIdentitySchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.linkCustomerAuthIdentity(ctx, parsedInput.data);
      break;
    }
    case "RegisterVehicle": {
      const parsedInput = registerVehicleSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.registerVehicle(ctx, parsedInput.data);
      break;
    }
    case "CreateVehicleOwnershipClaim": {
      const parsedInput = createVehicleOwnershipClaimSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createVehicleOwnershipClaim(ctx, parsedInput.data);
      break;
    }
    case "RecordOdometerEvent": {
      const parsedInput = recordOdometerEventSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.recordOdometerEvent(ctx, parsedInput.data);
      break;
    }
    case "CreateManualIntake": {
      const parsedInput = createManualIntakeSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createManualIntake(ctx, parsedInput.data);
      break;
    }
    case "AppendIntakeEntry": {
      const parsedInput = appendIntakeEntrySchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.appendIntakeEntry(ctx, parsedInput.data);
      break;
    }
    case "InterpretReportedSymptom": {
      const parsedInput = interpretReportedSymptomSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.interpretReportedSymptom(ctx, parsedInput.data);
      break;
    }
    case "CreateCaseFromIntake": {
      const parsedInput = createCaseFromIntakeSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createCaseFromIntake(ctx, parsedInput.data);
      break;
    }
    case "AssignCaseParticipant": {
      const parsedInput = assignCaseParticipantSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.assignCaseParticipant(ctx, parsedInput.data);
      break;
    }
    case "TransitionCase": {
      const parsedInput = transitionCaseSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.transitionCase(ctx, parsedInput.data);
      break;
    }
    case "AddCaseNote": {
      const parsedInput = addCaseNoteSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.addCaseNote(ctx, parsedInput.data);
      break;
    }
    case "CreateTemporaryReservation": {
      const parsedInput = createTemporaryReservationSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createTemporaryReservation(ctx, parsedInput.data);
      break;
    }
    case "ScheduleAppointment": {
      const parsedInput = scheduleAppointmentSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.scheduleAppointment(ctx, parsedInput.data);
      break;
    }
    case "ConfirmAppointment": {
      const parsedInput = confirmAppointmentSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.confirmAppointment(ctx, parsedInput.data);
      break;
    }
    case "CancelAppointment": {
      const parsedInput = cancelAppointmentSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.cancelAppointment(ctx, parsedInput.data);
      break;
    }
    case "ReceiveVehicle": {
      const parsedInput = receiveVehicleSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.receiveVehicle(ctx, parsedInput.data);
      break;
    }
    case "StartInspection": {
      const parsedInput = startInspectionSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.startInspection(ctx, parsedInput.data);
      break;
    }
    case "RecordInspectionResult": {
      const parsedInput = recordInspectionResultSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.recordInspectionResult(ctx, parsedInput.data);
      break;
    }
    case "RecordMeasurement": {
      const parsedInput = recordMeasurementSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.recordMeasurement(ctx, parsedInput.data);
      break;
    }
    case "RecordFinding": {
      const parsedInput = recordFindingSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.recordFinding(ctx, parsedInput.data);
      break;
    }
    case "CreateMaintenanceRecommendation": {
      const parsedInput = createMaintenanceRecommendationSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createMaintenanceRecommendation(ctx, parsedInput.data);
      break;
    }
    case "CreateUploadIntent": {
      const parsedInput = createUploadIntentSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createUploadIntent(ctx, parsedInput.data);
      break;
    }
    case "ConfirmEvidenceUpload": {
      const parsedInput = confirmEvidenceUploadSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.confirmEvidenceUpload(ctx, parsedInput.data);
      break;
    }
    case "LinkEvidence": {
      const parsedInput = linkEvidenceSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.linkEvidence(ctx, parsedInput.data);
      break;
    }
    case "CompleteInspection": {
      const parsedInput = completeInspectionSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.completeInspection(ctx, parsedInput.data);
      break;
    }
    case "CreateQuote": {
      const parsedInput = createQuoteSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createQuote(ctx, parsedInput.data);
      break;
    }
    case "CreateQuoteVersion": {
      const parsedInput = createQuoteVersionSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.createQuoteVersion(ctx, parsedInput.data);
      break;
    }
    case "AddQuoteItem": {
      const parsedInput = addQuoteItemSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.addQuoteItem(ctx, parsedInput.data);
      break;
    }
    case "UpdateDraftQuoteItem": {
      const parsedInput = updateDraftQuoteItemSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.updateDraftQuoteItem(ctx, parsedInput.data);
      break;
    }
    case "FreezeQuoteVersion": {
      const parsedInput = freezeQuoteVersionSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.freezeQuoteVersion(ctx, parsedInput.data);
      break;
    }
    case "PrepareAuthorizationRequest": {
      const parsedInput = prepareAuthorizationRequestSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.prepareAuthorizationRequest(ctx, parsedInput.data);
      break;
    }
    case "MarkAuthorizationRequestSent": {
      const parsedInput = markAuthorizationRequestSentSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.markAuthorizationRequestSent(ctx, parsedInput.data);
      break;
    }
    case "VerifyAuthorizationAccess": {
      const parsedInput = verifyAuthorizationAccessSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.verifyAuthorizationAccess(ctx, parsedInput.data);
      break;
    }
    case "RecordAuthorization": {
      const parsedInput = recordAuthorizationSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.recordAuthorization(ctx, parsedInput.data);
      break;
    }
    case "InvalidateAuthorization": {
      const parsedInput = invalidateAuthorizationSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.invalidateAuthorization(ctx, parsedInput.data);
      break;
    }
    case "RevokeAndReprepareAuthorizationRequest": {
      const parsedInput = revokeAndReprepareAuthorizationRequestSchema.safeParse(input);
      if (!parsedInput.success) {
        return NextResponse.json(
          { error: "invalid_input", issues: parsedInput.error.issues },
          { status: 400 },
        );
      }
      result = await engine.revokeAndReprepareAuthorizationRequest(ctx, parsedInput.data);
      break;
    }
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
