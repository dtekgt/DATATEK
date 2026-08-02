import { describe, it } from "node:test";
import { expect } from "expect";
import { brakesTemplateRequiredSlots, findBrakeItemDef } from "@datatek/domain";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
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
  createUploadIntent,
  confirmEvidenceUpload,
  linkEvidence,
} from "./inspection-commands.ts";
import { buildTestContext } from "./test-helpers.ts";

const advisorCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const inspectorCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.inspectorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const RESOURCE: ResourceRow = {
  id: "res-bay-insp",
  organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
  branchId: null,
  resourceType: "bay",
  label: "Bahía Inspección",
  isActive: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

function stateWithResource(): CrmVehicleState {
  return { ...createEmptyState(), resources: [RESOURCE] };
}

/** Full pipeline up to `received`: customer -> vehicle -> intake -> case
 * (new -> triage -> scheduled) -> appointment -> ReceiveVehicle. Ready for
 * `StartInspection`. */
function buildReceivedCase(idempotencyPrefix: string) {
  const customer = createProvisionalCustomer(
    stateWithResource(),
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-customer` }),
    { displayName: "Cliente Inspección", source: "walk_in" },
  );
  if (!customer.ok) throw new Error("setup failed: customer");

  const vehicle = registerVehicle(
    customer.nextState,
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-vehicle` }),
    {
      vin: "3VWFE21C04M000123",
      customerId: customer.data.id,
    },
  );
  if (!vehicle.ok) throw new Error("setup failed: vehicle");

  const intake = createManualIntake(
    vehicle.nextState,
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-intake` }),
    {
      customerId: customer.data.id,
      channel: "whatsapp_manual",
      originalText: "Frenos hacen ruido",
      reportedAt: "2026-07-30T10:00:00.000Z",
    },
  );
  if (!intake.ok) throw new Error("setup failed: intake");

  const kase = createCaseFromIntake(
    intake.nextState,
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-case` }),
    {
      intakeThreadId: intake.data.thread.id,
      customerId: customer.data.id,
      vehicleId: vehicle.data.vehicleId,
      summary: "Frenos",
    },
  );
  if (!kase.ok) throw new Error("setup failed: case");

  const toTriage = transitionCase(
    kase.nextState,
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-triage` }),
    {
      caseId: kase.data.case.id,
      toStatus: "triage",
    },
  );
  if (!toTriage.ok) throw new Error("setup failed: triage");

  const toScheduled = transitionCase(
    toTriage.nextState,
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-scheduled` }),
    {
      caseId: kase.data.case.id,
      toStatus: "scheduled",
    },
  );
  if (!toScheduled.ok) throw new Error("setup failed: scheduled");

  const appointment = scheduleAppointment(
    toScheduled.nextState,
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-appt` }),
    {
      caseId: kase.data.case.id,
      startsAt: "2026-08-03T09:00:00.000Z",
      endsAt: "2026-08-03T10:00:00.000Z",
      resourceIds: [RESOURCE.id],
    },
  );
  if (!appointment.ok) throw new Error("setup failed: appointment");

  const received = receiveVehicle(
    appointment.nextState,
    advisorCtx({ idempotencyKey: `${idempotencyPrefix}-receive` }),
    {
      caseId: kase.data.case.id,
      appointmentId: appointment.data.appointment.id,
      odometer: {
        value: 84210,
        unit: "km",
        recordedAt: "2026-08-03T09:05:00.000Z",
        provenance: "observed",
      },
    },
  );
  if (!received.ok) throw new Error("setup failed: receive");

  return {
    state: received.nextState,
    caseId: kase.data.case.id,
    vehicleId: vehicle.data.vehicleId,
  };
}

function buildInProgressInspection(idempotencyPrefix: string) {
  const received = buildReceivedCase(idempotencyPrefix);
  const started = startInspection(
    received.state,
    inspectorCtx({ idempotencyKey: `${idempotencyPrefix}-start` }),
    {
      caseId: received.caseId,
      odometerKmAtInspection: 84210,
    },
  );
  if (!started.ok) throw new Error("setup failed: start inspection");
  return {
    state: started.nextState,
    caseId: received.caseId,
    inspectionId: started.data.inspection.id,
  };
}

describe("StartInspection", () => {
  it("fixes the brakes template version and moves the case to 'inspection'", () => {
    const received = buildReceivedCase("start-ok");
    const outcome = startInspection(received.state, inspectorCtx({ idempotencyKey: "start-1" }), {
      caseId: received.caseId,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.inspection.templateKey).toBe("brakes");
    expect(outcome.data.inspection.templateVersionStillActive).toBe(true);
    expect(outcome.data.inspection.status).toBe("in_progress");
    expect(outcome.data.case.status).toBe("inspection");
  });

  it("rejects starting an inspection for a case that has not been received", () => {
    const outcome = startInspection(
      createEmptyState(),
      inspectorCtx({ idempotencyKey: "start-missing" }),
      {
        caseId: "case-does-not-exist",
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NOT_FOUND");
  });
});

describe("RecordInspectionResult / RecordMeasurement", () => {
  it("records a measured item across two axle/side combinations", () => {
    const ready = buildInProgressInspection("record");
    const frontLeft = recordInspectionResult(
      ready.state,
      inspectorCtx({ idempotencyKey: "rec-fl" }),
      {
        inspectionId: ready.inspectionId,
        itemKey: "pad_thickness_inner",
        axle: "front",
        side: "left",
        condition: "pass",
        provenance: "measured",
      },
    );
    expect(frontLeft.ok).toBe(true);
    if (!frontLeft.ok) return;

    const measurement = recordMeasurement(
      frontLeft.nextState,
      inspectorCtx({ idempotencyKey: "meas-fl" }),
      {
        inspectionResultId: frontLeft.data.id,
        value: 7.5,
        unit: "mm",
        provenance: "measured",
      },
    );
    expect(measurement.ok).toBe(true);
    if (!measurement.ok) return;
    expect(measurement.data.unit).toBe("mm");

    const rearRight = recordInspectionResult(
      measurement.nextState,
      inspectorCtx({ idempotencyKey: "rec-rr" }),
      {
        inspectionId: ready.inspectionId,
        itemKey: "pad_thickness_inner",
        axle: "rear",
        side: "right",
        condition: "attention",
        provenance: "measured",
      },
    );
    expect(rearRight.ok).toBe(true);
    if (!rearRight.ok) return;
    expect(rearRight.nextState.inspectionResults).toHaveLength(2);
  });

  it("requires a reason when condition is not_inspected", () => {
    const ready = buildInProgressInspection("record-reason");
    const outcome = recordInspectionResult(
      ready.state,
      inspectorCtx({ idempotencyKey: "rec-no-reason" }),
      {
        inspectionId: ready.inspectionId,
        itemKey: "fluid_condition",
        condition: "not_inspected",
        provenance: "observed",
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });
});

/** Fills every required slot of the brakes template with a passing/valid
 * result (+ measurement where required) so `CompleteInspection` can
 * succeed. Returns the resulting state. */
function fillEveryRequiredSlot(
  state: CrmVehicleState,
  inspectionId: string,
  idempotencyPrefix: string,
) {
  let current = state;
  let i = 0;
  for (const slot of brakesTemplateRequiredSlots()) {
    i += 1;
    const itemDef = findBrakeItemDef(slot.itemKey);
    const result = recordInspectionResult(
      current,
      inspectorCtx({ idempotencyKey: `${idempotencyPrefix}-r${i}` }),
      {
        inspectionId,
        itemKey: slot.itemKey,
        axle: slot.axle,
        side: slot.side,
        condition: "pass",
        provenance: "measured",
      },
    );
    if (!result.ok)
      throw new Error(`setup failed recording ${slot.itemKey}: ${result.error.message}`);
    current = result.nextState;

    if (itemDef?.requiresMeasurement) {
      const measurement = recordMeasurement(
        current,
        inspectorCtx({ idempotencyKey: `${idempotencyPrefix}-m${i}` }),
        {
          inspectionResultId: result.data.id,
          value: 8,
          unit: itemDef.measurementUnit ?? "mm",
          provenance: "measured",
        },
      );
      if (!measurement.ok)
        throw new Error(`setup failed measuring ${slot.itemKey}: ${measurement.error.message}`);
      current = measurement.nextState;
    }
  }
  return current;
}

describe("CompleteInspection", () => {
  it("fails and does not transition the case when required fields are missing (e.g. a not_inspected item without a full record)", () => {
    const ready = buildInProgressInspection("complete-missing");
    // Record only ONE of the ~36 required slots — everything else is
    // missing, so the gate must fail.
    const partial = recordInspectionResult(
      ready.state,
      inspectorCtx({ idempotencyKey: "complete-missing-1" }),
      {
        inspectionId: ready.inspectionId,
        itemKey: "fluid_condition",
        condition: "pass",
        provenance: "observed",
      },
    );
    if (!partial.ok) throw new Error("setup failed");

    const outcome = completeInspection(
      partial.nextState,
      inspectorCtx({ idempotencyKey: "complete-missing-2" }),
      {
        inspectionId: ready.inspectionId,
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
    expect(outcome.error.message).toContain("Falta el campo requerido");

    // The case never left 'inspection' and the inspection never left
    // 'in_progress' — a rejected gate must not mutate either.
    const kase = partial.nextState.cases.find((c) => c.id === ready.caseId);
    expect(kase?.status).toBe("inspection");
    const inspection = partial.nextState.inspections.find((i) => i.id === ready.inspectionId);
    expect(inspection?.status).toBe("in_progress");
  });

  it("succeeds once every required slot is recorded, completing the inspection while the case STAYS 'inspection' (no quote exists yet to authorize)", () => {
    const ready = buildInProgressInspection("complete-full");
    const filled = fillEveryRequiredSlot(ready.state, ready.inspectionId, "complete-full");

    const outcome = completeInspection(
      filled,
      inspectorCtx({ idempotencyKey: "complete-full-done" }),
      {
        inspectionId: ready.inspectionId,
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.inspection.status).toBe("completed");
    // Saying "esperando tu decisión" before a quote is even frozen would be
    // exactly the false state DATATEK_R0_A prohibits — see the comment on
    // `completeInspection`. The case only reaches `waiting_authorization`
    // later, in `PrepareAuthorizationRequest` (authorization-commands.test.ts).
    expect(outcome.data.case.status).toBe("inspection");
    const kase = outcome.nextState.cases.find((c) => c.id === outcome.data.case.id);
    expect(kase?.status).toBe("inspection");
  });

  it("fails when a required upload intent is still unconfirmed", () => {
    const ready = buildInProgressInspection("complete-evidence");
    const filled = fillEveryRequiredSlot(ready.state, ready.inspectionId, "complete-evidence");

    const pendingIntent = createUploadIntent(
      filled,
      inspectorCtx({ idempotencyKey: "complete-evidence-intent" }),
      {
        caseId: ready.caseId,
        purpose: "brake_pad_photo",
        declaredMime: "image/jpeg",
        visibilityRequested: "internal",
      },
    );
    if (!pendingIntent.ok) throw new Error("setup failed");

    const outcome = completeInspection(
      pendingIntent.nextState,
      inspectorCtx({ idempotencyKey: "complete-evidence-done" }),
      {
        inspectionId: ready.inspectionId,
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toContain("intención de subida");
  });
});

describe("LinkEvidence — visibility never widens", () => {
  it("keeps the effective visibility internal even when the link requests customer", () => {
    const ready = buildInProgressInspection("evidence-visibility");
    const intent = createUploadIntent(ready.state, inspectorCtx({ idempotencyKey: "vis-intent" }), {
      caseId: ready.caseId,
      purpose: "internal_note_photo",
      declaredMime: "image/jpeg",
      visibilityRequested: "internal",
    });
    if (!intent.ok) throw new Error("setup failed");

    const asset = confirmEvidenceUpload(
      intent.nextState,
      inspectorCtx({ idempotencyKey: "vis-confirm" }),
      {
        uploadIntentId: intent.data.id,
        mimeDetected: "image/jpeg",
        bytes: 204800,
        hash: "abc123deadbeef",
      },
    );
    if (!asset.ok) throw new Error("setup failed");
    expect(asset.data.visibilityMax).toBe("internal");

    const link = linkEvidence(asset.nextState, inspectorCtx({ idempotencyKey: "vis-link" }), {
      assetId: asset.data.id,
      entityType: "case",
      entityId: ready.caseId,
      visibility: "customer",
    });
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(link.data.link.visibility).toBe("customer");
    // A looser link never widens the asset's ceiling.
    expect(link.data.effectiveVisibility).toBe("internal");
  });

  it("keeps a customer-visibility asset effectively internal when the link itself restricts it", () => {
    const ready = buildInProgressInspection("evidence-visibility-2");
    const intent = createUploadIntent(
      ready.state,
      inspectorCtx({ idempotencyKey: "vis2-intent" }),
      {
        caseId: ready.caseId,
        purpose: "customer_facing_photo",
        declaredMime: "image/jpeg",
        visibilityRequested: "customer",
      },
    );
    if (!intent.ok) throw new Error("setup failed");

    const asset = confirmEvidenceUpload(
      intent.nextState,
      inspectorCtx({ idempotencyKey: "vis2-confirm" }),
      {
        uploadIntentId: intent.data.id,
        mimeDetected: "image/jpeg",
        bytes: 204800,
        hash: "def456deadbeef",
      },
    );
    if (!asset.ok) throw new Error("setup failed");

    const link = linkEvidence(asset.nextState, inspectorCtx({ idempotencyKey: "vis2-link" }), {
      assetId: asset.data.id,
      entityType: "finding",
      entityId: "finding-does-not-need-to-exist-for-this-check",
      visibility: "internal",
    });
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(link.data.effectiveVisibility).toBe("internal");
  });
});
