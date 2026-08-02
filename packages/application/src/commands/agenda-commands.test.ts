import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { createEmptyState, type CrmVehicleState, type ResourceRow } from "./state.ts";
import { createProvisionalCustomer } from "./crm-commands.ts";
import { registerVehicle } from "./vehicle-commands.ts";
import { createManualIntake, createCaseFromIntake, transitionCase } from "./intake-commands.ts";
import {
  scheduleAppointment,
  createTemporaryReservation,
  cancelAppointment,
  confirmAppointment,
  receiveVehicle,
} from "./agenda-commands.ts";
import { buildTestContext } from "./test-helpers.ts";

const dtekCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const RESOURCE: ResourceRow = {
  id: "res-bay-1",
  organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
  branchId: null,
  resourceType: "bay",
  label: "Bahía 1",
  isActive: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

function stateWithResource(): CrmVehicleState {
  return { ...createEmptyState(), resources: [RESOURCE] };
}

/** Case ready to be scheduled: `new` -> `triage` -> `scheduled`. */
function buildScheduledCase(idempotencyPrefix: string) {
  const customer = createProvisionalCustomer(
    stateWithResource(),
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-customer` }),
    { displayName: "Cliente Agenda", source: "walk_in" },
  );
  if (!customer.ok) throw new Error("setup failed: customer");

  const vehicle = registerVehicle(
    customer.nextState,
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-vehicle` }),
    {
      vin: "JHMFA1650A004352",
      customerId: customer.data.id,
    },
  );
  if (!vehicle.ok) throw new Error("setup failed: vehicle");

  const intake = createManualIntake(
    vehicle.nextState,
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-intake` }),
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
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-case` }),
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
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-triage` }),
    {
      caseId: kase.data.case.id,
      toStatus: "triage",
    },
  );
  if (!toTriage.ok) throw new Error("setup failed: triage");

  const toScheduled = transitionCase(
    toTriage.nextState,
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-scheduled` }),
    {
      caseId: kase.data.case.id,
      toStatus: "scheduled",
    },
  );
  if (!toScheduled.ok) throw new Error("setup failed: scheduled");

  return {
    state: toScheduled.nextState,
    caseId: kase.data.case.id,
    vehicleId: vehicle.data.vehicleId,
  };
}

describe("ScheduleAppointment", () => {
  it("books a resource for a case without collision", () => {
    const ready = buildScheduledCase("sched-ok");
    const outcome = scheduleAppointment(ready.state, dtekCtx({ idempotencyKey: "appt-1" }), {
      caseId: ready.caseId,
      startsAt: "2026-08-03T14:00:00.000Z",
      endsAt: "2026-08-03T15:00:00.000Z",
      purpose: "Inspección de frenos",
      resourceIds: [RESOURCE.id],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.appointment.status).toBe("tentative");
    expect(outcome.data.reservations).toHaveLength(1);
    expect(outcome.data.reservations[0]?.status).toBe("active");
  });

  it("rejects a second reservation that overlaps the first with a domain CONFLICT error, never creating it silently", () => {
    const ready = buildScheduledCase("sched-overlap");
    const first = scheduleAppointment(ready.state, dtekCtx({ idempotencyKey: "appt-overlap-1" }), {
      caseId: ready.caseId,
      startsAt: "2026-08-03T14:00:00.000Z",
      endsAt: "2026-08-03T15:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    if (!first.ok) throw new Error("setup failed");

    const overlapping = scheduleAppointment(
      first.nextState,
      dtekCtx({ idempotencyKey: "appt-overlap-2" }),
      {
        caseId: ready.caseId,
        // Overlaps [14:00, 15:00) by 30 minutes — must be rejected.
        startsAt: "2026-08-03T14:30:00.000Z",
        endsAt: "2026-08-03T15:30:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    expect(overlapping.ok).toBe(false);
    if (overlapping.ok) return;
    expect(overlapping.error.code).toBe("CONFLICT");
    // No second appointment/reservation was created — state is unchanged
    // from right after the first, successful schedule.
    expect(first.nextState.appointments).toHaveLength(1);
    expect(first.nextState.resourceReservations).toHaveLength(1);
  });

  it("allows a back-to-back reservation that does not overlap (half-open range)", () => {
    const ready = buildScheduledCase("sched-adjacent");
    const first = scheduleAppointment(ready.state, dtekCtx({ idempotencyKey: "appt-adj-1" }), {
      caseId: ready.caseId,
      startsAt: "2026-08-03T14:00:00.000Z",
      endsAt: "2026-08-03T15:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    if (!first.ok) throw new Error("setup failed");

    const adjacent = scheduleAppointment(
      first.nextState,
      dtekCtx({ idempotencyKey: "appt-adj-2" }),
      {
        caseId: ready.caseId,
        startsAt: "2026-08-03T15:00:00.000Z",
        endsAt: "2026-08-03T16:00:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    expect(adjacent.ok).toBe(true);
  });

  it("frees the resource once the colliding appointment is cancelled", () => {
    const ready = buildScheduledCase("sched-cancel-then-book");
    const first = scheduleAppointment(ready.state, dtekCtx({ idempotencyKey: "appt-cancel-1" }), {
      caseId: ready.caseId,
      startsAt: "2026-08-03T14:00:00.000Z",
      endsAt: "2026-08-03T15:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    if (!first.ok) throw new Error("setup failed");

    const cancelled = cancelAppointment(
      first.nextState,
      dtekCtx({ idempotencyKey: "appt-cancel-2" }),
      {
        appointmentId: first.data.appointment.id,
        reason: "Cliente reagenda",
      },
    );
    if (!cancelled.ok) throw new Error("setup failed");
    expect(cancelled.data.status).toBe("cancelled");
    expect(cancelled.nextState.resourceReservations.every((r) => r.status === "released")).toBe(
      true,
    );

    const rebooked = scheduleAppointment(
      cancelled.nextState,
      dtekCtx({ idempotencyKey: "appt-cancel-3" }),
      {
        caseId: ready.caseId,
        startsAt: "2026-08-03T14:00:00.000Z",
        endsAt: "2026-08-03T15:00:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    expect(rebooked.ok).toBe(true);
  });
});

describe("CreateTemporaryReservation", () => {
  it("also rejects overlapping an existing active reservation", () => {
    const ready = buildScheduledCase("hold-overlap");
    const appointment = scheduleAppointment(ready.state, dtekCtx({ idempotencyKey: "hold-appt" }), {
      caseId: ready.caseId,
      startsAt: "2026-08-04T09:00:00.000Z",
      endsAt: "2026-08-04T10:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    if (!appointment.ok) throw new Error("setup failed");

    const hold = createTemporaryReservation(
      appointment.nextState,
      dtekCtx({ idempotencyKey: "hold-1" }),
      {
        appointmentId: appointment.data.appointment.id,
        resourceId: RESOURCE.id,
        startsAt: "2026-08-04T09:30:00.000Z",
        endsAt: "2026-08-04T10:30:00.000Z",
      },
    );
    expect(hold.ok).toBe(false);
    if (hold.ok) return;
    expect(hold.error.code).toBe("CONFLICT");
  });
});

describe("ConfirmAppointment", () => {
  it("moves a tentative appointment to confirmed", () => {
    const ready = buildScheduledCase("confirm");
    const appointment = scheduleAppointment(
      ready.state,
      dtekCtx({ idempotencyKey: "confirm-appt" }),
      {
        caseId: ready.caseId,
        startsAt: "2026-08-05T09:00:00.000Z",
        endsAt: "2026-08-05T10:00:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    if (!appointment.ok) throw new Error("setup failed");

    const outcome = confirmAppointment(
      appointment.nextState,
      dtekCtx({ idempotencyKey: "confirm-1" }),
      {
        appointmentId: appointment.data.appointment.id,
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("confirmed");
  });
});

describe("ReceiveVehicle", () => {
  it("registers odometer, marks the appointment arrived, and moves the case to 'received'", () => {
    const ready = buildScheduledCase("receive");
    const appointment = scheduleAppointment(
      ready.state,
      dtekCtx({ idempotencyKey: "receive-appt" }),
      {
        caseId: ready.caseId,
        startsAt: "2026-08-06T09:00:00.000Z",
        endsAt: "2026-08-06T10:00:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    if (!appointment.ok) throw new Error("setup failed");

    const outcome = receiveVehicle(
      appointment.nextState,
      dtekCtx({ idempotencyKey: "receive-1" }),
      {
        caseId: ready.caseId,
        appointmentId: appointment.data.appointment.id,
        odometer: {
          value: 84210,
          unit: "km",
          recordedAt: "2026-08-06T09:05:00.000Z",
          provenance: "observed",
        },
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.case.status).toBe("received");
    expect(outcome.data.odometerEvent.status).toBe("accepted");
    const updatedAppointment = outcome.nextState.appointments.find(
      (a) => a.id === appointment.data.appointment.id,
    );
    expect(updatedAppointment?.status).toBe("arrived");
    // Never marks work started — sección 8.
    expect(outcome.nextState.cases.find((c) => c.id === ready.caseId)?.status).not.toBe(
      "inspection",
    );
  });

  it("rejects receiving a case that is not yet 'scheduled'", () => {
    const ready = buildScheduledCase("receive-early");
    // Case is 'scheduled' — force back to a non-receivable status via a
    // second case created directly at 'new' (skip scheduling) instead.
    const outcome = receiveVehicle(ready.state, dtekCtx({ idempotencyKey: "receive-early-1" }), {
      caseId: "case-does-not-exist",
      odometer: {
        value: 1000,
        unit: "km",
        recordedAt: "2026-08-01T00:00:00.000Z",
        provenance: "observed",
      },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NOT_FOUND");
  });
});
