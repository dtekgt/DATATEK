import type { APIRequestContext } from "@playwright/test";

// Setup helper for R0-D Fase 5 E2E — builds real state through the SAME
// in-memory command engine `pnpm dev` serves, using the temporary dev route
// (`apps/web/src/app/api/dev/commands/route.ts`) exactly like
// `docs/runbooks/quote-authorization-journey.md`'s curl script does, so the
// scenarios in `r0d-brakes-authorization.spec.ts` start from a real
// inspected case instead of re-deriving the whole vertical by hand inside
// every test. The part each scenario actually asserts on — preparing/
// sending a request, deciding at `/a/[token]`, Pro reflecting the outcome —
// always goes through the real rendered UI, never this helper.

export const ORG_SLUG = "dtek-servicios";

// Matches `packages/application/src/fixtures/tenancy.ts` FIXTURE_ACTOR_IDS —
// owner has every organization permission these setup commands need
// (`crm.manage`, `intake.manage`, `agenda.manage`, `inspection.publish`,
// `quote.manage`, `authorization.request`), so setup never has to juggle
// multiple logged-in identities the way the manual curl runbook did.
export const OWNER_ACTOR_ID = "u-owner-dtek";

// Seeded bay resource — `packages/application/src/commands/fixtures.ts`,
// `FIXTURE_CRM_VEHICLE_IDS.resourceDtek`.
export const SEEDED_RESOURCE_ID = "res-dtek-bay-1";

const COMMANDS_URL = "/api/dev/commands";

export interface CommandResult<T = Record<string, unknown>> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  replayed?: boolean;
}

let seq = 0;
/** Unique idempotency key per call within a single test run — the dev route
 * requires a non-empty key and treats a repeated one as a replay, so every
 * distinct mutation this helper issues needs its own. */
function nextKey(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

export async function postCommand<T = Record<string, unknown>>(
  request: APIRequestContext,
  command: string,
  input: unknown,
  opts: { orgSlug?: string; actorId?: string; idempotencyKey?: string } = {},
): Promise<CommandResult<T>> {
  const response = await request.post(COMMANDS_URL, {
    data: {
      command,
      orgSlug: opts.orgSlug ?? ORG_SLUG,
      actorId: opts.actorId ?? OWNER_ACTOR_ID,
      idempotencyKey: opts.idempotencyKey ?? nextKey(command),
      input,
    },
  });
  const body = (await response.json()) as CommandResult<T>;
  if (!body.ok) {
    throw new Error(
      `${command} failed (HTTP ${response.status()}): ${body.error?.code} — ${body.error?.message}`,
    );
  }
  return body;
}

/** Reads the full in-memory engine state — same shape `GET /api/dev/commands`
 * returns. Used by scenarios that need to look up an id (e.g. an
 * `authorizationRequestId`) the Pro UI's Server Action deliberately does not
 * expose to the browser. */
export async function getEngineState(request: APIRequestContext): Promise<{
  authorizationRequests: Array<{
    id: string;
    caseId: string;
    quoteVersionId: string;
    status: string;
  }>;
}> {
  const response = await request.get(COMMANDS_URL);
  const body = (await response.json()) as {
    state: {
      authorizationRequests: Array<{
        id: string;
        caseId: string;
        quoteVersionId: string;
        status: string;
      }>;
    };
  };
  return body.state;
}

// Brakes template required slots — mirrors
// `packages/domain/src/inspection/brakes-template.ts` `brakesTemplateRequiredSlots()`.
// Duplicated as static data here (rather than imported) so this Playwright
// spec — which runs as its own process against a *running* `pnpm dev` server,
// never inside the monorepo's TS build graph — has no cross-package module
// resolution to worry about. 8 axle_side items x 2 axles x 2 sides = 32,
// + 4 vehicle-scope items = 36, matching
// `docs/runbooks/quote-authorization-journey.md` step 9.
interface BrakeSlot {
  itemKey: string;
  axle: "front" | "rear" | null;
  side: "left" | "right" | null;
  requiresMeasurement: boolean;
  measurementUnit: string | null;
}

const AXLE_SIDE_ITEMS: Array<{ key: string; requiresMeasurement: boolean; unit: string | null }> = [
  { key: "pad_thickness_inner", requiresMeasurement: true, unit: "mm" },
  { key: "pad_thickness_outer", requiresMeasurement: true, unit: "mm" },
  { key: "disc_thickness_measured", requiresMeasurement: true, unit: "mm" },
  { key: "disc_thickness_minimum", requiresMeasurement: true, unit: "mm" },
  { key: "disc_surface_condition", requiresMeasurement: false, unit: null },
  { key: "caliper_condition", requiresMeasurement: false, unit: null },
  { key: "guide_pins_condition", requiresMeasurement: false, unit: null },
  { key: "hoses_condition", requiresMeasurement: false, unit: null },
];
const VEHICLE_ITEMS = [
  "fluid_condition",
  "parking_brake_condition",
  "pedal_result",
  "road_test_result",
];

function brakesTemplateRequiredSlots(): BrakeSlot[] {
  const slots: BrakeSlot[] = [];
  for (const item of AXLE_SIDE_ITEMS) {
    for (const axle of ["front", "rear"] as const) {
      for (const side of ["left", "right"] as const) {
        slots.push({
          itemKey: item.key,
          axle,
          side,
          requiresMeasurement: item.requiresMeasurement,
          measurementUnit: item.unit,
        });
      }
    }
  }
  for (const key of VEHICLE_ITEMS) {
    slots.push({
      itemKey: key,
      axle: null,
      side: null,
      requiresMeasurement: false,
      measurementUnit: null,
    });
  }
  return slots;
}

let vinCounter = 0;
function nextVin(): string {
  vinCounter += 1;
  // Charset excludes I/O/Q — `packages/application/src/commands/normalize.ts`.
  return `VE2E${String(vinCounter).padStart(13, "0")}`;
}

export interface ReadyToQuoteCase {
  caseId: string;
  folioCode: string;
  customerId: string;
  vehicleId: string;
}

/** Real HTTP replica of `packages/application/src/commands/test-helpers.ts`'s
 * `buildReadyToQuoteCase` — customer -> vehicle -> intake -> case (new ->
 * triage -> scheduled) -> appointment -> ReceiveVehicle -> StartInspection ->
 * every required brakes slot -> CompleteInspection, but every step is a real
 * POST against `pnpm dev`, not an in-process function call. Leaves the case
 * at status `inspection` (never `waiting_authorization` — no quote exists
 * yet), matching the documented Fase 2 fix. */
export async function buildReadyToQuoteCase(
  request: APIRequestContext,
  idPrefix: string,
): Promise<ReadyToQuoteCase> {
  const customer = await postCommand<{ id: string }>(
    request,
    "CreateProvisionalCustomer",
    { displayName: `Cliente E2E ${idPrefix}`, source: "walk_in" },
    { idempotencyKey: `${idPrefix}-customer` },
  );
  const customerId = customer.data!.id;

  const vehicle = await postCommand<{ vehicleId: string }>(
    request,
    "RegisterVehicle",
    { vin: nextVin(), customerId },
    { idempotencyKey: `${idPrefix}-vehicle` },
  );
  const vehicleId = vehicle.data!.vehicleId;

  const intake = await postCommand<{ thread: { id: string } }>(
    request,
    "CreateManualIntake",
    {
      customerId,
      channel: "whatsapp_manual",
      originalText: "Frenos hacen ruido (E2E)",
      reportedAt: "2026-07-30T10:00:00.000Z",
    },
    { idempotencyKey: `${idPrefix}-intake` },
  );

  const kase = await postCommand<{ case: { id: string; folioCode: string } }>(
    request,
    "CreateCaseFromIntake",
    {
      intakeThreadId: intake.data!.thread.id,
      customerId,
      vehicleId,
      summary: "Frenos — E2E",
    },
    { idempotencyKey: `${idPrefix}-case` },
  );
  const caseId = kase.data!.case.id;
  const folioCode = kase.data!.case.folioCode;

  await postCommand(
    request,
    "TransitionCase",
    { caseId, toStatus: "triage" },
    { idempotencyKey: `${idPrefix}-triage` },
  );
  await postCommand(
    request,
    "TransitionCase",
    { caseId, toStatus: "scheduled" },
    { idempotencyKey: `${idPrefix}-scheduled` },
  );

  const appointment = await postCommand<{ appointment: { id: string } }>(
    request,
    "ScheduleAppointment",
    {
      caseId,
      startsAt: "2026-08-03T09:00:00.000Z",
      endsAt: "2026-08-03T10:00:00.000Z",
      resourceIds: [SEEDED_RESOURCE_ID],
    },
    { idempotencyKey: `${idPrefix}-appt` },
  );

  await postCommand(
    request,
    "ReceiveVehicle",
    {
      caseId,
      appointmentId: appointment.data!.appointment.id,
      odometer: {
        value: 84210,
        unit: "km",
        recordedAt: "2026-08-03T09:05:00.000Z",
        provenance: "observed",
      },
    },
    { idempotencyKey: `${idPrefix}-receive` },
  );

  const inspection = await postCommand<{ inspection: { id: string } }>(
    request,
    "StartInspection",
    { caseId, odometerKmAtInspection: 84210 },
    { idempotencyKey: `${idPrefix}-start-insp` },
  );
  const inspectionId = inspection.data!.inspection.id;

  let slotIndex = 0;
  for (const slot of brakesTemplateRequiredSlots()) {
    slotIndex += 1;
    const result = await postCommand<{ id: string }>(
      request,
      "RecordInspectionResult",
      {
        inspectionId,
        itemKey: slot.itemKey,
        axle: slot.axle,
        side: slot.side,
        condition: "pass",
        provenance: "measured",
      },
      { idempotencyKey: `${idPrefix}-r${slotIndex}` },
    );
    if (slot.requiresMeasurement) {
      await postCommand(
        request,
        "RecordMeasurement",
        {
          inspectionResultId: result.data!.id,
          value: 8,
          unit: slot.measurementUnit ?? "mm",
          provenance: "measured",
        },
        { idempotencyKey: `${idPrefix}-m${slotIndex}` },
      );
    }
  }

  await postCommand(
    request,
    "CompleteInspection",
    { inspectionId },
    { idempotencyKey: `${idPrefix}-complete` },
  );

  return { caseId, folioCode, customerId, vehicleId };
}

export interface FrozenQuote {
  quoteVersionId: string;
  snapshotHash: string;
  totalMinor: number;
}

/** `CreateQuote` -> `CreateQuoteVersion` -> 2 `AddQuoteItem` -> `FreezeQuoteVersion`.
 * No real Pro UI exists for this step yet (verified: neither `createQuote`
 * nor `addQuoteItem` nor `freezeQuoteVersion` is referenced anywhere under
 * `apps/web/src` outside the dev route) — Fase 4b wired the READ side
 * (`CaseQuoteTotal`) and everything from `PrepareAuthorizationRequest`
 * onward, not quote authoring itself. Documented as open debt in the R0-D
 * verification matrix; this helper stands in for it exactly the way the
 * task brief describes ("motor de comandos real... como setup"). */
export async function freezeQuoteForCase(
  request: APIRequestContext,
  caseId: string,
  idPrefix: string,
): Promise<FrozenQuote> {
  const quote = await postCommand<{ id: string }>(
    request,
    "CreateQuote",
    { caseId },
    { idempotencyKey: `${idPrefix}-quote` },
  );

  const version = await postCommand<{ version: { id: string } }>(
    request,
    "CreateQuoteVersion",
    { quoteId: quote.data!.id, currency: "GTQ" },
    { idempotencyKey: `${idPrefix}-version` },
  );
  const quoteVersionId = version.data!.version.id;

  await postCommand(
    request,
    "AddQuoteItem",
    {
      quoteVersionId,
      lineType: "part",
      description: "Pastillas delanteras (E2E)",
      quantity: 1,
      unitPriceMinor: 45000,
      currency: "GTQ",
    },
    { idempotencyKey: `${idPrefix}-item1` },
  );
  await postCommand(
    request,
    "AddQuoteItem",
    {
      quoteVersionId,
      lineType: "labor",
      description: "Mano de obra — frenos (E2E)",
      quantity: 1,
      unitPriceMinor: 25000,
      currency: "GTQ",
    },
    { idempotencyKey: `${idPrefix}-item2` },
  );

  const frozen = await postCommand<{ snapshotHash: string; totalMinor: number }>(
    request,
    "FreezeQuoteVersion",
    { quoteVersionId },
    { idempotencyKey: `${idPrefix}-freeze` },
  );

  return {
    quoteVersionId,
    snapshotHash: frozen.data!.snapshotHash,
    totalMinor: frozen.data!.totalMinor,
  };
}
