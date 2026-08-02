// Shared test-only helper: builds a real `CommandContext` by running the
// actual R0-C resolver (`resolveOrganizationCapabilities`) over the R0-C
// fixture tenancy graph — the same one `apps/web` uses. Tests never
// hand-roll a fake `capabilities` object; they get it exactly the way a
// server loader would.
import { resolveOrganizationCapabilities } from "@datatek/auth";
import { brakesTemplateRequiredSlots, findBrakeItemDef } from "@datatek/domain";
import {
  buildFixtureTenancySnapshot,
  FIXTURE_ACTOR_IDS,
  FIXTURE_ORGANIZATION_IDS,
} from "../fixtures/tenancy.ts";
import { buildCommandContext, type CommandContext } from "./context.ts";
import { createEmptyState, type CrmVehicleState, type ResourceRow } from "./state.ts";
import { createProvisionalCustomer } from "./crm-commands.ts";
import { registerVehicle } from "./vehicle-commands.ts";
import { createManualIntake, createCaseFromIntake, transitionCase } from "./intake-commands.ts";
import { scheduleAppointment, receiveVehicle } from "./agenda-commands.ts";
import {
  startInspection,
  recordInspectionResult,
  recordMeasurement,
  completeInspection,
} from "./inspection-commands.ts";

const SNAPSHOT = buildFixtureTenancySnapshot();

export function buildTestContext(params: {
  actorId: string;
  organizationId: string;
  branchId?: string | null;
  idempotencyKey?: string;
  correlationId?: string;
  now?: Date;
}): CommandContext {
  const now = params.now ?? new Date("2026-08-01T12:00:00.000Z");
  const resolution = resolveOrganizationCapabilities(
    params.actorId,
    params.organizationId,
    now,
    SNAPSHOT,
  );
  return buildCommandContext({
    actorId: params.actorId,
    organizationId: params.organizationId,
    branchId: params.branchId ?? null,
    capabilities: resolution,
    idempotencyKey: params.idempotencyKey ?? globalThis.crypto.randomUUID(),
    correlationId: params.correlationId ?? "corr-test",
    now,
  });
}

// Monotonic counter for synthetic VINs — deliberately NOT derived from
// `idempotencyPrefix` (test prefixes like "quote-..."/"authorization-..."
// commonly contain letters `normalizeVin` accepts but the VIN charset
// itself rejects, e.g. "O"/"Q"/"I" — see `packages/application/src/
// commands/normalize.ts`). "VF" + digits stays inside `[A-HJ-NPR-Z0-9]`
// for any counter value and is unique per test-process run.
let testVinCounter = 0;
function nextTestVin(): string {
  testVinCounter += 1;
  return `VF${String(testVinCounter).padStart(15, "0")}`;
}

export interface ReadyToQuoteCase {
  state: CrmVehicleState;
  caseId: string;
  vehicleId: string;
  customerId: string;
}

/** Shared setup for R0-D Fase 3 (quote/authorization) tests: runs the exact
 * same pipeline `inspection-commands.test.ts` uses privately —
 * customer -> vehicle -> intake -> case (new -> triage -> scheduled) ->
 * appointment -> ReceiveVehicle -> StartInspection -> every required brakes
 * slot filled -> CompleteInspection — so every quote/authorization test
 * starts from a real case with a completed inspection, still `inspection`
 * (NOT `waiting_authorization` — that would be a false state: no quote
 * exists yet to authorize. See `completeInspection`'s doc comment). It only
 * reaches `waiting_authorization` once a test itself calls
 * `PrepareAuthorizationRequest` against a frozen version, same as
 * production. `idempotencyPrefix` must be unique per test (every command
 * call below derives its idempotency key from it). */
export function buildReadyToQuoteCase(idempotencyPrefix: string): ReadyToQuoteCase {
  const advisorCtx = (suffix: string) =>
    buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      idempotencyKey: `${idempotencyPrefix}-${suffix}`,
    });
  const inspectorCtx = (suffix: string) =>
    buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.inspectorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      idempotencyKey: `${idempotencyPrefix}-${suffix}`,
    });

  const resource: ResourceRow = {
    id: `res-${idempotencyPrefix}`,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    branchId: null,
    resourceType: "bay",
    label: "Bahía de prueba",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
  };
  const seeded: CrmVehicleState = { ...createEmptyState(), resources: [resource] };

  const customer = createProvisionalCustomer(seeded, advisorCtx("customer"), {
    displayName: `Cliente ${idempotencyPrefix}`,
    source: "walk_in",
  });
  if (!customer.ok) throw new Error(`setup failed: customer (${customer.error.message})`);

  const vehicle = registerVehicle(customer.nextState, advisorCtx("vehicle"), {
    vin: nextTestVin(),
    customerId: customer.data.id,
  });
  if (!vehicle.ok) throw new Error(`setup failed: vehicle (${vehicle.error.message})`);

  const intake = createManualIntake(vehicle.nextState, advisorCtx("intake"), {
    customerId: customer.data.id,
    channel: "whatsapp_manual",
    originalText: "Frenos hacen ruido",
    reportedAt: "2026-07-30T10:00:00.000Z",
  });
  if (!intake.ok) throw new Error(`setup failed: intake (${intake.error.message})`);

  const kase = createCaseFromIntake(intake.nextState, advisorCtx("case"), {
    intakeThreadId: intake.data.thread.id,
    customerId: customer.data.id,
    vehicleId: vehicle.data.vehicleId,
    summary: "Frenos",
  });
  if (!kase.ok) throw new Error(`setup failed: case (${kase.error.message})`);

  const toTriage = transitionCase(kase.nextState, advisorCtx("triage"), {
    caseId: kase.data.case.id,
    toStatus: "triage",
  });
  if (!toTriage.ok) throw new Error(`setup failed: triage (${toTriage.error.message})`);

  const toScheduled = transitionCase(toTriage.nextState, advisorCtx("scheduled"), {
    caseId: kase.data.case.id,
    toStatus: "scheduled",
  });
  if (!toScheduled.ok) throw new Error(`setup failed: scheduled (${toScheduled.error.message})`);

  const appointment = scheduleAppointment(toScheduled.nextState, advisorCtx("appt"), {
    caseId: kase.data.case.id,
    startsAt: "2026-08-03T09:00:00.000Z",
    endsAt: "2026-08-03T10:00:00.000Z",
    resourceIds: [resource.id],
  });
  if (!appointment.ok) throw new Error(`setup failed: appointment (${appointment.error.message})`);

  const received = receiveVehicle(appointment.nextState, advisorCtx("receive"), {
    caseId: kase.data.case.id,
    appointmentId: appointment.data.appointment.id,
    odometer: {
      value: 84210,
      unit: "km",
      recordedAt: "2026-08-03T09:05:00.000Z",
      provenance: "observed",
    },
  });
  if (!received.ok) throw new Error(`setup failed: receive (${received.error.message})`);

  const started = startInspection(received.nextState, inspectorCtx("start"), {
    caseId: kase.data.case.id,
    odometerKmAtInspection: 84210,
  });
  if (!started.ok) throw new Error(`setup failed: start inspection (${started.error.message})`);

  let current = started.nextState;
  let i = 0;
  for (const slot of brakesTemplateRequiredSlots()) {
    i += 1;
    const itemDef = findBrakeItemDef(slot.itemKey);
    const result = recordInspectionResult(current, inspectorCtx(`r${i}`), {
      inspectionId: started.data.inspection.id,
      itemKey: slot.itemKey,
      axle: slot.axle,
      side: slot.side,
      condition: "pass",
      provenance: "measured",
    });
    if (!result.ok)
      throw new Error(`setup failed recording ${slot.itemKey}: ${result.error.message}`);
    current = result.nextState;

    if (itemDef?.requiresMeasurement) {
      const measurement = recordMeasurement(current, inspectorCtx(`m${i}`), {
        inspectionResultId: result.data.id,
        value: 8,
        unit: itemDef.measurementUnit ?? "mm",
        provenance: "measured",
      });
      if (!measurement.ok) {
        throw new Error(`setup failed measuring ${slot.itemKey}: ${measurement.error.message}`);
      }
      current = measurement.nextState;
    }
  }

  const completed = completeInspection(current, inspectorCtx("complete"), {
    inspectionId: started.data.inspection.id,
  });
  if (!completed.ok)
    throw new Error(`setup failed: complete inspection (${completed.error.message})`);

  return {
    state: completed.nextState,
    caseId: kase.data.case.id,
    vehicleId: vehicle.data.vehicleId,
    customerId: customer.data.id,
  };
}
