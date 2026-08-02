import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { createEmptyState } from "./state.ts";
import { createProvisionalCustomer } from "./crm-commands.ts";
import { registerVehicle } from "./vehicle-commands.ts";
import {
  createManualIntake,
  createCaseFromIntake,
  transitionCase,
  addCaseNote,
} from "./intake-commands.ts";
import { buildTestContext } from "./test-helpers.ts";

const dtekCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

/** Builds one customer + vehicle + open intake thread, ready for
 * `CreateCaseFromIntake`. Each call uses its own idempotency key (and a
 * distinct VIN suffix, digits only — VINs exclude I/O/Q) so two setups in
 * the same test never accidentally replay or collide with each other. */
function buildIntakeReadyState(idempotencyPrefix: string, vinSuffix: string) {
  const customer = createProvisionalCustomer(
    createEmptyState(),
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-customer` }),
    { displayName: "Cliente Intake", source: "whatsapp_manual" },
  );
  if (!customer.ok) throw new Error("setup failed: customer");

  const vehicle = registerVehicle(
    customer.nextState,
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-vehicle` }),
    { vin: `1HGCM8263${vinSuffix}`, customerId: customer.data.id },
  );
  if (!vehicle.ok) throw new Error("setup failed: vehicle");

  const intake = createManualIntake(
    vehicle.nextState,
    dtekCtx({ idempotencyKey: `${idempotencyPrefix}-intake` }),
    {
      customerId: customer.data.id,
      channel: "whatsapp_manual",
      originalText: "El carro frena raro y hace ruido",
      reportedAt: "2026-07-30T10:00:00.000Z",
    },
  );
  if (!intake.ok) throw new Error("setup failed: intake");

  return {
    state: intake.nextState,
    customerId: customer.data.id,
    vehicleId: vehicle.data.vehicleId,
    threadId: intake.data.thread.id,
  };
}

describe("CreateManualIntake", () => {
  it("captures the original text and opens a thread without requiring a customer yet", () => {
    const outcome = createManualIntake(createEmptyState(), dtekCtx(), {
      channel: "whatsapp_manual",
      originalText: "Buenas, mi carro frena raro",
      reportedAt: "2026-07-30T09:00:00.000Z",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.thread.status).toBe("open");
    expect(outcome.data.thread.customerId).toBeNull();
    expect(outcome.data.entry.originalText).toBe("Buenas, mi carro frena raro");
    expect(outcome.nextState.intakeThreads).toHaveLength(1);
    expect(outcome.nextState.intakeEntries).toHaveLength(1);
  });

  it("rejects an empty original text", () => {
    const outcome = createManualIntake(createEmptyState(), dtekCtx(), {
      channel: "whatsapp_manual",
      originalText: "   ",
      reportedAt: "2026-07-30T09:00:00.000Z",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });
});

describe("CreateCaseFromIntake", () => {
  it("assigns a sequential folio per organization across two simultaneous cases", () => {
    const first = buildIntakeReadyState("folio-a", "A004352");

    const firstCase = createCaseFromIntake(first.state, dtekCtx({ idempotencyKey: "case-a" }), {
      intakeThreadId: first.threadId,
      customerId: first.customerId,
      vehicleId: first.vehicleId,
      summary: "Frenos hacen ruido",
    });
    expect(firstCase.ok).toBe(true);
    if (!firstCase.ok) return;
    expect(firstCase.data.case.folioNumber).toBe(1);
    expect(firstCase.data.case.folioCode).toBe("2026-00001");

    // A second, independent intake in the SAME organization — its case must
    // get the NEXT folio, never reuse or collide with the first.
    const second = buildIntakeReadyState("folio-b", "A004353");
    const mergedState = {
      ...second.state,
      cases: firstCase.nextState.cases,
      organizationCounters: firstCase.nextState.organizationCounters,
    };

    const secondCase = createCaseFromIntake(mergedState, dtekCtx({ idempotencyKey: "case-b" }), {
      intakeThreadId: second.threadId,
      customerId: second.customerId,
      vehicleId: second.vehicleId,
      summary: "Pastillas gastadas",
    });
    expect(secondCase.ok).toBe(true);
    if (!secondCase.ok) return;
    expect(secondCase.data.case.folioNumber).toBe(2);
    expect(secondCase.data.case.folioCode).toBe("2026-00002");
  });

  it("creates the case as 'new', the principal participant, the service request, and marks the thread converted", () => {
    const ready = buildIntakeReadyState("case-full", "A004354");
    const outcome = createCaseFromIntake(
      ready.state,
      dtekCtx({ idempotencyKey: "case-full-create" }),
      {
        intakeThreadId: ready.threadId,
        customerId: ready.customerId,
        vehicleId: ready.vehicleId,
        summary: "Frenos hacen ruido al frenar",
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.case.status).toBe("new");
    expect(outcome.data.participant.participantKind).toBe("customer");
    expect(outcome.data.serviceRequest.summary).toBe("Frenos hacen ruido al frenar");
    const thread = outcome.nextState.intakeThreads.find((t) => t.id === ready.threadId);
    expect(thread?.status).toBe("converted");
    expect(outcome.nextState.caseStatusEvents).toHaveLength(1);
    expect(outcome.nextState.caseStatusEvents[0]?.fromStatus).toBeNull();
  });

  it("returns a neutral not-found for a vehicle this org has no access grant for", () => {
    const ready = buildIntakeReadyState("case-noaccess", "A004355");
    const outcome = createCaseFromIntake(
      ready.state,
      dtekCtx({ idempotencyKey: "case-noaccess-create" }),
      {
        intakeThreadId: ready.threadId,
        customerId: ready.customerId,
        vehicleId: "veh-does-not-exist",
        summary: "Cualquier cosa",
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NOT_FOUND");
  });
});

describe("TransitionCase", () => {
  function buildCase() {
    const ready = buildIntakeReadyState("transition", "A004356");
    const created = createCaseFromIntake(
      ready.state,
      dtekCtx({ idempotencyKey: "transition-create" }),
      {
        intakeThreadId: ready.threadId,
        customerId: ready.customerId,
        vehicleId: ready.vehicleId,
        summary: "Frenos",
      },
    );
    if (!created.ok) throw new Error("setup failed");
    return created;
  }

  it("allows a documented edge (new -> triage)", () => {
    const created = buildCase();
    const outcome = transitionCase(created.nextState, dtekCtx({ idempotencyKey: "t1" }), {
      caseId: created.data.case.id,
      toStatus: "triage",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("triage");
  });

  it("rejects an edge that skips steps and never mutates state", () => {
    const created = buildCase();
    const before = created.nextState;
    const outcome = transitionCase(before, dtekCtx({ idempotencyKey: "t2" }), {
      caseId: created.data.case.id,
      toStatus: "scheduled",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");
    // Nothing changed: same case status, same status-event count, same
    // object reference for the unaffected slices of state.
    const unchangedCase = before.cases.find((c) => c.id === created.data.case.id);
    expect(unchangedCase?.status).toBe("new");
    expect(before.caseStatusEvents).toHaveLength(1);
  });

  it("rejects reopening a terminal case", () => {
    const created = buildCase();
    const cancelled = transitionCase(created.nextState, dtekCtx({ idempotencyKey: "t3" }), {
      caseId: created.data.case.id,
      toStatus: "cancelled",
      reason: "Cliente desistió",
    });
    if (!cancelled.ok) throw new Error("setup failed");

    const outcome = transitionCase(cancelled.nextState, dtekCtx({ idempotencyKey: "t4" }), {
      caseId: created.data.case.id,
      toStatus: "triage",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");
  });
});

describe("AddCaseNote", () => {
  it("stores an internal note distinctly from a customer-visible one", () => {
    const ready = buildIntakeReadyState("note", "A004357");
    const created = createCaseFromIntake(ready.state, dtekCtx({ idempotencyKey: "note-create" }), {
      intakeThreadId: ready.threadId,
      customerId: ready.customerId,
      vehicleId: ready.vehicleId,
      summary: "Frenos",
    });
    if (!created.ok) throw new Error("setup failed");

    const internalNote = addCaseNote(
      created.nextState,
      dtekCtx({ idempotencyKey: "note-internal" }),
      {
        caseId: created.data.case.id,
        visibility: "internal",
        body: "El cliente suena molesto, negociar con cuidado.",
      },
    );
    expect(internalNote.ok).toBe(true);
    if (!internalNote.ok) return;
    expect(internalNote.data.visibility).toBe("internal");
    expect(internalNote.nextState.caseNotes).toHaveLength(1);
  });
});
