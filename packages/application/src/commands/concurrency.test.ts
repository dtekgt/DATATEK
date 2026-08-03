// Concurrencia — DATATEK_R0_E hardening sección 6.
//
// ARQUITECTURA — léase antes de juzgar cualquier "Promise.all" de abajo:
// `createCommandEngine()` (engine.ts) envuelve funciones puras y SÍNCRONAS
// sobre una única variable `state` cerrada en el closure. Node es
// single-threaded: `Promise.all([Promise.resolve().then(fnA),
// Promise.resolve().then(fnB)])` encola dos microtareas en orden FIFO — fnA
// corre HASTA COMPLETARSE (incluida su escritura en el engine) antes de que
// fnB siquiera empiece, porque ninguna de las dos tiene un `await` interno.
// El orden entre "las dos llamadas disparadas con Promise.all" es por lo
// tanto determinista (gana la primera de la lista), NO una carrera real de
// dos hilos u dos transacciones Postgres. Lo que SÍ es real y vale la pena
// probar es que la SEGUNDA llamada — aunque disparada "al mismo tiempo" vía
// Promise.all contra la MISMA instancia de engine, tal como pide sección 6
// — ve el estado que la primera ya confirmó y es rechazada con un error de
// dominio estable, nunca creando un segundo recurso en silencio. Eso es lo
// que cada test "vía engine" de abajo demuestra: es el comportamiento REAL
// que tendría hoy `apps/web`'s singleton engine (ver el comentario de
// engine.ts) si dos requests HTTP llegaran "al mismo tiempo" a un único
// proceso Node.
//
// Donde importa la distinción, un segundo test complementario invoca las
// funciones puras de comando DIRECTAMENTE (sin pasar por el engine) contra
// el MISMO snapshot de estado capturado una sola vez — eso sí modela con
// fidelidad dos transacciones que leen ANTES de que cualquiera escriba,
// exactamente lo que ocurriría con dos conexiones Postgres concurrentes.
// Esos tests están marcados explícitamente como tal; varios documentan que
// el motor en memoria, aislado de Postgres, depende hoy de la aplicación
// serializada (single JS thread) para su seguridad — no de un
// check-and-set atómico — y que el constraint SQL real (p.ej. el `EXCLUDE
// USING gist` de `resource_reservations`, 0060) sigue siendo la fuente de
// verdad una vez Postgres esté alcanzable. Ningún test de este archivo
// afirma ni simula que Postgres corrió.
import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { buildTestContext, buildReadyToQuoteCase } from "./test-helpers.ts";
import { createCommandEngine } from "./engine.ts";
import {
  createEmptyState,
  type CrmVehicleState,
  type ResourceRow,
  type FeatureFlagRow,
  type FeatureFlagOverrideRow,
} from "./state.ts";
import { FEATURE_KEY_AUTHORIZATION_REISSUE } from "./state.ts";
import { createProvisionalCustomer } from "./crm-commands.ts";
import { registerVehicle } from "./vehicle-commands.ts";
import { createManualIntake, createCaseFromIntake, transitionCase } from "./intake-commands.ts";
import {
  scheduleAppointment,
  cancelAppointment,
  createTemporaryReservation,
} from "./agenda-commands.ts";
import { createUploadIntent, confirmEvidenceUpload } from "./inspection-commands.ts";
import {
  createQuote,
  createQuoteVersion,
  addQuoteItem,
  freezeQuoteVersion,
} from "./quote-commands.ts";
import { prepareAuthorizationRequest } from "./authorization-commands.ts";

const dtekCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const ownerDtekCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.ownerDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const ownerDemoCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.ownerDemo,
    organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    ...overrides,
  });

/** Actor id absent from the R0-C fixture tenancy graph — resolves to
 * `membershipStatus: "missing"`, exactly like a real guest customer with no
 * Pro/Control account. `secure_link` decisions never call
 * `requirePermission` (see authorization-commands.ts header), so this is
 * enough to exercise them, same precedent as `guestCtx` in
 * authorization-commands.test.ts. */
const guestCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: "guest-no-account",
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const RESOURCE: ResourceRow = {
  id: "res-bay-conc-1",
  organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
  branchId: null,
  resourceType: "bay",
  label: "Bahía de prueba (concurrencia)",
  isActive: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

function stateWithResource(): CrmVehicleState {
  return { ...createEmptyState(), resources: [RESOURCE] };
}

let vinCounter = 0;
function nextVin(): string {
  vinCounter += 1;
  return `VC${String(vinCounter).padStart(15, "0")}`;
}

/** Case at `scheduled`, ready for `ScheduleAppointment`. Pass `baseState` to
 * continue building on an ALREADY-evolved state (e.g. one that already has
 * a reservation to cancel) instead of starting a disconnected fresh one —
 * required whenever a test needs two cases to coexist in the same engine
 * snapshot. */
function buildScheduledCase(prefix: string, baseState?: CrmVehicleState) {
  const seed = baseState ?? stateWithResource();
  const customer = createProvisionalCustomer(
    seed,
    dtekCtx({ idempotencyKey: `${prefix}-customer` }),
    {
      displayName: `Cliente ${prefix}`,
      source: "walk_in",
    },
  );
  if (!customer.ok) throw new Error(`setup failed: customer (${customer.error.message})`);

  const vehicle = registerVehicle(
    customer.nextState,
    dtekCtx({ idempotencyKey: `${prefix}-vehicle` }),
    {
      vin: nextVin(),
      customerId: customer.data.id,
    },
  );
  if (!vehicle.ok) throw new Error(`setup failed: vehicle (${vehicle.error.message})`);

  const intake = createManualIntake(
    vehicle.nextState,
    dtekCtx({ idempotencyKey: `${prefix}-intake` }),
    {
      customerId: customer.data.id,
      channel: "whatsapp_manual",
      originalText: "Frenos hacen ruido",
      reportedAt: "2026-07-30T10:00:00.000Z",
    },
  );
  if (!intake.ok) throw new Error(`setup failed: intake (${intake.error.message})`);

  const kase = createCaseFromIntake(
    intake.nextState,
    dtekCtx({ idempotencyKey: `${prefix}-case` }),
    {
      intakeThreadId: intake.data.thread.id,
      customerId: customer.data.id,
      vehicleId: vehicle.data.vehicleId,
      summary: "Frenos",
    },
  );
  if (!kase.ok) throw new Error(`setup failed: case (${kase.error.message})`);

  const toTriage = transitionCase(kase.nextState, dtekCtx({ idempotencyKey: `${prefix}-triage` }), {
    caseId: kase.data.case.id,
    toStatus: "triage",
  });
  if (!toTriage.ok) throw new Error(`setup failed: triage (${toTriage.error.message})`);

  const toScheduled = transitionCase(
    toTriage.nextState,
    dtekCtx({ idempotencyKey: `${prefix}-scheduled` }),
    {
      caseId: kase.data.case.id,
      toStatus: "scheduled",
    },
  );
  if (!toScheduled.ok) throw new Error(`setup failed: scheduled (${toScheduled.error.message})`);

  return {
    state: toScheduled.nextState,
    caseId: kase.data.case.id,
    vehicleId: vehicle.data.vehicleId,
    customerId: customer.data.id,
  };
}

// ===========================================================================
// Agenda
// ===========================================================================

describe("Concurrencia — Agenda", () => {
  it("dos ScheduleAppointment disparados con Promise.all para el mismo recurso/rango: exactamente una reserva activa, la otra falla con CONFLICT", async () => {
    const ready = buildScheduledCase("conc-agenda-1");
    const engine = createCommandEngine(ready.state);
    const range = { startsAt: "2026-08-05T09:00:00.000Z", endsAt: "2026-08-05T10:00:00.000Z" };

    const [r1, r2] = await Promise.all([
      Promise.resolve().then(() =>
        engine.scheduleAppointment(dtekCtx({ idempotencyKey: "conc-agenda-1-a" }), {
          caseId: ready.caseId,
          ...range,
          resourceIds: [RESOURCE.id],
        }),
      ),
      Promise.resolve().then(() =>
        engine.scheduleAppointment(dtekCtx({ idempotencyKey: "conc-agenda-1-b" }), {
          caseId: ready.caseId,
          ...range,
          resourceIds: [RESOURCE.id],
        }),
      ),
    ]);

    const results = [r1, r2];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed && !failed.ok ? failed.error.code : null).toBe("CONFLICT");

    const active = engine
      .getState()
      .resourceReservations.filter((r) => r.resourceId === RESOURCE.id && r.status !== "released");
    expect(active).toHaveLength(1);
  });

  it("mismo snapshot inicial (dos transacciones que leen ANTES de que cualquiera escriba): ambas creerían tener éxito — el motor en memoria depende de la aplicación serializada del engine, no de un check-and-set atómico; el EXCLUDE constraint de 0060 es la fuente de verdad real una vez Postgres esté alcanzable", () => {
    const ready = buildScheduledCase("conc-agenda-2");
    const snapshot = ready.state; // AMBAS "transacciones" parten del mismo estado.
    const range = { startsAt: "2026-08-06T09:00:00.000Z", endsAt: "2026-08-06T10:00:00.000Z" };

    const outcome1 = scheduleAppointment(snapshot, dtekCtx({ idempotencyKey: "conc-agenda-2-a" }), {
      caseId: ready.caseId,
      ...range,
      resourceIds: [RESOURCE.id],
    });
    const outcome2 = scheduleAppointment(snapshot, dtekCtx({ idempotencyKey: "conc-agenda-2-b" }), {
      caseId: ready.caseId,
      ...range,
      resourceIds: [RESOURCE.id],
    });

    // Ninguna de las dos vio la escritura de la otra — ambas "ganan" en
    // aislamiento, exactamente como dos transacciones Postgres bajo
    // snapshot isolation sin el EXCLUDE constraint. Esto NO es un bug de
    // esta función — es la razón documentada por la que 0060 dice
    // explícitamente que su constraint SQL, no esta réplica en TypeScript,
    // es la fuente de verdad real.
    expect(outcome1.ok).toBe(true);
    expect(outcome2.ok).toBe(true);
  });

  it("un hold que expira NO libera el recurso automáticamente hoy — brecha documentada (sección 8 del handoff: sin worker en R0), no un concepto nuevo inventado en esta prueba", () => {
    const ready = buildScheduledCase("conc-agenda-hold");
    const appt = scheduleAppointment(
      ready.state,
      dtekCtx({ idempotencyKey: "conc-agenda-hold-appt" }),
      {
        caseId: ready.caseId,
        startsAt: "2026-08-07T09:00:00.000Z",
        endsAt: "2026-08-07T10:00:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    if (!appt.ok) throw new Error(`setup failed: appointment (${appt.error.message})`);

    const HOLD_RESOURCE: ResourceRow = { ...RESOURCE, id: "res-bay-conc-hold" };
    const stateWithHoldResource: CrmVehicleState = {
      ...appt.nextState,
      resources: [...appt.nextState.resources, HOLD_RESOURCE],
    };

    const hold = createTemporaryReservation(
      stateWithHoldResource,
      dtekCtx({ idempotencyKey: "conc-agenda-hold-1", now: new Date("2026-08-07T08:00:00.000Z") }),
      {
        appointmentId: appt.data.appointment.id,
        resourceId: HOLD_RESOURCE.id,
        startsAt: "2026-08-07T11:00:00.000Z",
        endsAt: "2026-08-07T12:00:00.000Z",
        holdMinutes: 5, // expira 08:05
      },
    );
    if (!hold.ok) throw new Error(`setup failed: hold (${hold.error.message})`);
    expect(hold.data.status).toBe("hold");
    expect(hold.data.expiresAt).toBe("2026-08-07T08:05:00.000Z");

    // "now" avanza bien pasado expiresAt — como si el cliente hubiera
    // abandonado el flujo de reserva — antes de que otro caso intente el
    // MISMO recurso/rango.
    const other = buildScheduledCase("conc-agenda-hold-other", hold.nextState);
    const secondAttempt = scheduleAppointment(
      other.state,
      dtekCtx({ idempotencyKey: "conc-agenda-hold-2", now: new Date("2026-08-07T09:00:00.000Z") }),
      {
        caseId: other.caseId,
        startsAt: "2026-08-07T11:00:00.000Z",
        endsAt: "2026-08-07T12:00:00.000Z",
        resourceIds: [HOLD_RESOURCE.id],
      },
    );

    // `overlapsActiveReservation` (agenda-commands.ts) solo revisa
    // `status !== "released"` — nunca lee `expiresAt`. Nada en R0 promueve
    // un hold a `active` ni lo libera al vencer (no hay worker — sección 8
    // del handoff R0-E lo difiere explícitamente). Un hold abandonado
    // bloquea su slot indefinidamente hasta que alguien lo cancele a mano.
    // Esta prueba demuestra el comportamiento REAL de hoy; ver el reporte
    // de cierre para el hallazgo.
    expect(secondAttempt.ok).toBe(false);
    if (secondAttempt.ok) return;
    expect(secondAttempt.error.code).toBe("CONFLICT");
  });

  it("cancelación libera la reserva y una nueva reserva en el mismo slot es válida", () => {
    const ready = buildScheduledCase("conc-agenda-cancel");
    const first = scheduleAppointment(
      ready.state,
      dtekCtx({ idempotencyKey: "conc-agenda-cancel-1" }),
      {
        caseId: ready.caseId,
        startsAt: "2026-08-08T09:00:00.000Z",
        endsAt: "2026-08-08T10:00:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const cancelled = cancelAppointment(
      first.nextState,
      dtekCtx({ idempotencyKey: "conc-agenda-cancel-2" }),
      {
        appointmentId: first.data.appointment.id,
        reason: "Cliente reprogramó",
      },
    );
    if (!cancelled.ok) throw new Error(`setup failed: cancel (${cancelled.error.message})`);

    const other = buildScheduledCase("conc-agenda-cancel-other", cancelled.nextState);
    const rebooked = scheduleAppointment(
      other.state,
      dtekCtx({ idempotencyKey: "conc-agenda-cancel-3" }),
      {
        caseId: other.caseId,
        startsAt: "2026-08-08T09:00:00.000Z",
        endsAt: "2026-08-08T10:00:00.000Z",
        resourceIds: [RESOURCE.id],
      },
    );
    expect(rebooked.ok).toBe(true);
  });

  it("reintento de ScheduleAppointment con la misma idempotency key devuelve el mismo resultado, no una segunda reserva", () => {
    const ready = buildScheduledCase("conc-agenda-retry");
    const ctx = dtekCtx({ idempotencyKey: "conc-agenda-retry-key" });
    const first = scheduleAppointment(ready.state, ctx, {
      caseId: ready.caseId,
      startsAt: "2026-08-09T09:00:00.000Z",
      endsAt: "2026-08-09T10:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);
    expect(first.replayed).toBe(false);

    const retry = scheduleAppointment(first.nextState, ctx, {
      caseId: ready.caseId,
      startsAt: "2026-08-09T09:00:00.000Z",
      endsAt: "2026-08-09T10:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.appointment.id).toBe(first.data.appointment.id);

    const reservations = retry.nextState.resourceReservations.filter(
      (r) => r.resourceId === RESOURCE.id,
    );
    expect(reservations).toHaveLength(1);
  });
});

// ===========================================================================
// Folios
// ===========================================================================

describe("Concurrencia — Folios", () => {
  it("dos CreateCaseFromIntake disparados con Promise.all en la MISMA organización: folios consecutivos únicos, sin colisión", async () => {
    const base = stateWithResource();
    const c1 = createProvisionalCustomer(base, dtekCtx({ idempotencyKey: "conc-folio-c1" }), {
      displayName: "Cliente Folio 1",
      source: "walk_in",
    });
    if (!c1.ok) throw new Error(`setup failed: c1 (${c1.error.message})`);
    const v1 = registerVehicle(c1.nextState, dtekCtx({ idempotencyKey: "conc-folio-v1" }), {
      vin: nextVin(),
      customerId: c1.data.id,
    });
    if (!v1.ok) throw new Error(`setup failed: v1 (${v1.error.message})`);
    const i1 = createManualIntake(v1.nextState, dtekCtx({ idempotencyKey: "conc-folio-i1" }), {
      customerId: c1.data.id,
      channel: "whatsapp_manual",
      originalText: "Frenos 1",
      reportedAt: "2026-07-30T10:00:00.000Z",
    });
    if (!i1.ok) throw new Error(`setup failed: i1 (${i1.error.message})`);

    const c2 = createProvisionalCustomer(
      i1.nextState,
      dtekCtx({ idempotencyKey: "conc-folio-c2" }),
      {
        displayName: "Cliente Folio 2",
        source: "walk_in",
      },
    );
    if (!c2.ok) throw new Error(`setup failed: c2 (${c2.error.message})`);
    const v2 = registerVehicle(c2.nextState, dtekCtx({ idempotencyKey: "conc-folio-v2" }), {
      vin: nextVin(),
      customerId: c2.data.id,
    });
    if (!v2.ok) throw new Error(`setup failed: v2 (${v2.error.message})`);
    const i2 = createManualIntake(v2.nextState, dtekCtx({ idempotencyKey: "conc-folio-i2" }), {
      customerId: c2.data.id,
      channel: "whatsapp_manual",
      originalText: "Frenos 2",
      reportedAt: "2026-07-30T10:05:00.000Z",
    });
    if (!i2.ok) throw new Error(`setup failed: i2 (${i2.error.message})`);

    const engine = createCommandEngine(i2.nextState);

    const [r1, r2] = await Promise.all([
      Promise.resolve().then(() =>
        engine.createCaseFromIntake(dtekCtx({ idempotencyKey: "conc-folio-case-1" }), {
          intakeThreadId: i1.data.thread.id,
          customerId: c1.data.id,
          vehicleId: v1.data.vehicleId,
          summary: "Frenos 1",
        }),
      ),
      Promise.resolve().then(() =>
        engine.createCaseFromIntake(dtekCtx({ idempotencyKey: "conc-folio-case-2" }), {
          intakeThreadId: i2.data.thread.id,
          customerId: c2.data.id,
          vehicleId: v2.data.vehicleId,
          summary: "Frenos 2",
        }),
      ),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    const folios = [r1.data.case.folioNumber, r2.data.case.folioNumber].sort((a, b) => a - b);
    expect(folios[1]).toBe(folios[0]! + 1);
    expect(r1.data.case.folioCode).not.toBe(r2.data.case.folioCode);
  });

  it("mismo snapshot inicial: consumeOrganizationCounter (TypeScript, en memoria) NO es atómico frente a dos lectores concurrentes — colisión que el UPDATE...RETURNING de `next_organization_counter` (0050) sí evita en Postgres real", () => {
    const base = stateWithResource();
    const c1 = createProvisionalCustomer(base, dtekCtx({ idempotencyKey: "conc-folio-race-c1" }), {
      displayName: "Cliente Folio Race 1",
      source: "walk_in",
    });
    if (!c1.ok) throw new Error("setup failed: c1");
    const v1 = registerVehicle(c1.nextState, dtekCtx({ idempotencyKey: "conc-folio-race-v1" }), {
      vin: nextVin(),
      customerId: c1.data.id,
    });
    if (!v1.ok) throw new Error("setup failed: v1");
    const i1 = createManualIntake(v1.nextState, dtekCtx({ idempotencyKey: "conc-folio-race-i1" }), {
      customerId: c1.data.id,
      channel: "whatsapp_manual",
      originalText: "Frenos race 1",
      reportedAt: "2026-07-30T10:00:00.000Z",
    });
    if (!i1.ok) throw new Error("setup failed: i1");

    const c2 = createProvisionalCustomer(
      i1.nextState,
      dtekCtx({ idempotencyKey: "conc-folio-race-c2" }),
      {
        displayName: "Cliente Folio Race 2",
        source: "walk_in",
      },
    );
    if (!c2.ok) throw new Error("setup failed: c2");
    const v2 = registerVehicle(c2.nextState, dtekCtx({ idempotencyKey: "conc-folio-race-v2" }), {
      vin: nextVin(),
      customerId: c2.data.id,
    });
    if (!v2.ok) throw new Error("setup failed: v2");
    const i2 = createManualIntake(v2.nextState, dtekCtx({ idempotencyKey: "conc-folio-race-i2" }), {
      customerId: c2.data.id,
      channel: "whatsapp_manual",
      originalText: "Frenos race 2",
      reportedAt: "2026-07-30T10:05:00.000Z",
    });
    if (!i2.ok) throw new Error("setup failed: i2");

    const snapshot = i2.nextState; // AMBAS llamadas parten del mismo estado.
    const outcome1 = createCaseFromIntake(
      snapshot,
      dtekCtx({ idempotencyKey: "conc-folio-race-case-1" }),
      {
        intakeThreadId: i1.data.thread.id,
        customerId: c1.data.id,
        vehicleId: v1.data.vehicleId,
        summary: "Frenos race 1",
      },
    );
    const outcome2 = createCaseFromIntake(
      snapshot,
      dtekCtx({ idempotencyKey: "conc-folio-race-case-2" }),
      {
        intakeThreadId: i2.data.thread.id,
        customerId: c2.data.id,
        vehicleId: v2.data.vehicleId,
        summary: "Frenos race 2",
      },
    );

    expect(outcome1.ok).toBe(true);
    expect(outcome2.ok).toBe(true);
    if (!outcome1.ok || !outcome2.ok) return;
    // Ambas leyeron el MISMO `organizationCounters.nextValue` de partida y
    // calcularon el mismo folio — la colisión que este test documenta.
    expect(outcome1.data.case.folioNumber).toBe(outcome2.data.case.folioNumber);
  });

  it("dos casos simultáneos en organizaciones DIFERENTES: cada organización mantiene su propia secuencia, sin salto global compartido", async () => {
    const base = stateWithResource();
    const c1 = createProvisionalCustomer(base, dtekCtx({ idempotencyKey: "conc-folio-org-c1" }), {
      displayName: "Cliente DTEK",
      source: "walk_in",
    });
    if (!c1.ok) throw new Error("setup failed: c1");
    const v1 = registerVehicle(c1.nextState, dtekCtx({ idempotencyKey: "conc-folio-org-v1" }), {
      vin: nextVin(),
      customerId: c1.data.id,
    });
    if (!v1.ok) throw new Error("setup failed: v1");
    const i1 = createManualIntake(v1.nextState, dtekCtx({ idempotencyKey: "conc-folio-org-i1" }), {
      customerId: c1.data.id,
      channel: "whatsapp_manual",
      originalText: "Frenos DTEK",
      reportedAt: "2026-07-30T10:00:00.000Z",
    });
    if (!i1.ok) throw new Error("setup failed: i1");

    const c2 = createProvisionalCustomer(
      i1.nextState,
      ownerDemoCtx({ idempotencyKey: "conc-folio-org-c2" }),
      {
        displayName: "Cliente Demo",
        source: "walk_in",
      },
    );
    if (!c2.ok) throw new Error("setup failed: c2");
    const v2 = registerVehicle(
      c2.nextState,
      ownerDemoCtx({ idempotencyKey: "conc-folio-org-v2" }),
      {
        vin: nextVin(),
        customerId: c2.data.id,
      },
    );
    if (!v2.ok) throw new Error("setup failed: v2");
    const i2 = createManualIntake(
      v2.nextState,
      ownerDemoCtx({ idempotencyKey: "conc-folio-org-i2" }),
      {
        customerId: c2.data.id,
        channel: "whatsapp_manual",
        originalText: "Frenos Demo",
        reportedAt: "2026-07-30T10:05:00.000Z",
      },
    );
    if (!i2.ok) throw new Error("setup failed: i2");

    const engine = createCommandEngine(i2.nextState);
    const [r1, r2] = await Promise.all([
      Promise.resolve().then(() =>
        engine.createCaseFromIntake(dtekCtx({ idempotencyKey: "conc-folio-org-case-1" }), {
          intakeThreadId: i1.data.thread.id,
          customerId: c1.data.id,
          vehicleId: v1.data.vehicleId,
          summary: "Frenos DTEK",
        }),
      ),
      Promise.resolve().then(() =>
        engine.createCaseFromIntake(ownerDemoCtx({ idempotencyKey: "conc-folio-org-case-2" }), {
          intakeThreadId: i2.data.thread.id,
          customerId: c2.data.id,
          vehicleId: v2.data.vehicleId,
          summary: "Frenos Demo",
        }),
      ),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.data.case.folioNumber).toBe(1);
    expect(r2.data.case.folioNumber).toBe(1); // secuencia independiente, no un salto global
    expect(r1.data.case.organizationId).toBe(FIXTURE_ORGANIZATION_IDS.dtek);
    expect(r2.data.case.organizationId).toBe(FIXTURE_ORGANIZATION_IDS.demo);
  });
});

// ===========================================================================
// Freeze
// ===========================================================================

function buildDraftVersion(prefix: string) {
  const kase = buildReadyToQuoteCase(prefix);
  const quote = createQuote(kase.state, dtekCtx({ idempotencyKey: `${prefix}-quote` }), {
    caseId: kase.caseId,
  });
  if (!quote.ok) throw new Error(`setup failed: quote (${quote.error.message})`);
  const version = createQuoteVersion(
    quote.nextState,
    dtekCtx({ idempotencyKey: `${prefix}-version` }),
    {
      quoteId: quote.data.id,
      currency: "GTQ",
    },
  );
  if (!version.ok) throw new Error(`setup failed: version (${version.error.message})`);
  const item = addQuoteItem(version.nextState, dtekCtx({ idempotencyKey: `${prefix}-item` }), {
    quoteVersionId: version.data.version.id,
    lineType: "part",
    description: "Pastillas de freno delanteras",
    quantity: 1,
    unitPriceMinor: 45000,
    currency: "GTQ",
  });
  if (!item.ok) throw new Error(`setup failed: item (${item.error.message})`);
  return {
    state: item.nextState,
    caseId: kase.caseId,
    quoteId: quote.data.id,
    versionId: version.data.version.id,
    versionNumber: version.data.version.versionNumber,
  };
}

describe("Concurrencia — Freeze", () => {
  it("dos FreezeQuoteVersion disparados con Promise.all sobre la misma expectedVersionNumber: exactamente uno gana, el otro recibe CONFLICT", async () => {
    const draft = buildDraftVersion("conc-freeze-1");
    const engine = createCommandEngine(draft.state);

    const [f1, f2] = await Promise.all([
      Promise.resolve().then(() =>
        engine.freezeQuoteVersion(dtekCtx({ idempotencyKey: "conc-freeze-1-a" }), {
          quoteVersionId: draft.versionId,
          expectedVersionNumber: draft.versionNumber,
        }),
      ),
      Promise.resolve().then(() =>
        engine.freezeQuoteVersion(dtekCtx({ idempotencyKey: "conc-freeze-1-b" }), {
          quoteVersionId: draft.versionId,
          expectedVersionNumber: draft.versionNumber,
        }),
      ),
    ]);

    const results = [f1, f2];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed && !failed.ok ? failed.error.code : null).toBe("CONFLICT");

    const frozen = engine
      .getState()
      .quoteVersions.filter((v) => v.id === draft.versionId && v.status === "frozen");
    expect(frozen).toHaveLength(1);
  });

  it("una edición concurrente durante el freeze nunca se pierde en silencio ni deja una versión congelada a medio escribir — probado en ambos órdenes de aplicación", () => {
    // Orden A: el freeze gana primero -> la edición posterior falla limpio,
    // nunca en silencio, y el snapshot ya congelado no la incluye.
    const draftA = buildDraftVersion("conc-freeze-edit-a");
    const engineA = createCommandEngine(draftA.state);
    const freezeFirst = engineA.freezeQuoteVersion(dtekCtx({ idempotencyKey: "cfe-a-freeze" }), {
      quoteVersionId: draftA.versionId,
    });
    const editSecond = engineA.addQuoteItem(dtekCtx({ idempotencyKey: "cfe-a-edit" }), {
      quoteVersionId: draftA.versionId,
      lineType: "part",
      description: "Balatas traseras",
      quantity: 1,
      unitPriceMinor: 30000,
      currency: "GTQ",
    });
    expect(freezeFirst.ok).toBe(true);
    expect(editSecond.ok).toBe(false);
    if (!editSecond.ok) expect(editSecond.error.code).toBe("CONFLICT");
    if (freezeFirst.ok) {
      const snapshot = JSON.parse(freezeFirst.data.snapshotJson as string) as { lines: unknown[] };
      expect(snapshot.lines).toHaveLength(1); // solo la línea original — nada a medio escribir
    }

    // Orden B: la edición gana primero -> el freeze posterior la incluye
    // legítimamente (freeze siempre relee el estado VIGENTE, esto no es un
    // bug — ver el comentario de FreezeQuoteVersion en quote-commands.ts).
    const draftB = buildDraftVersion("conc-freeze-edit-b");
    const engineB = createCommandEngine(draftB.state);
    const editFirst = engineB.addQuoteItem(dtekCtx({ idempotencyKey: "cfe-b-edit" }), {
      quoteVersionId: draftB.versionId,
      lineType: "part",
      description: "Balatas traseras",
      quantity: 1,
      unitPriceMinor: 30000,
      currency: "GTQ",
    });
    expect(editFirst.ok).toBe(true);
    const freezeSecond = engineB.freezeQuoteVersion(dtekCtx({ idempotencyKey: "cfe-b-freeze" }), {
      quoteVersionId: draftB.versionId,
    });
    expect(freezeSecond.ok).toBe(true);
    if (freezeSecond.ok) {
      const snapshot = JSON.parse(freezeSecond.data.snapshotJson as string) as { lines: unknown[] };
      expect(snapshot.lines).toHaveLength(2); // línea original + la edición
    }
  });

  it("FreezeQuoteVersion reintentado con la misma idempotency key devuelve el mismo snapshot/hash, no una segunda versión frozen", () => {
    const draft = buildDraftVersion("conc-freeze-retry");
    const ctx = dtekCtx({ idempotencyKey: "conc-freeze-retry-key" });
    const first = freezeQuoteVersion(draft.state, ctx, { quoteVersionId: draft.versionId });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const retry = freezeQuoteVersion(first.nextState, ctx, { quoteVersionId: draft.versionId });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.snapshotHash).toBe(first.data.snapshotHash);

    const frozenCount = retry.nextState.quoteVersions.filter(
      (v) => v.status === "frozen" && v.quoteId === draft.quoteId,
    ).length;
    expect(frozenCount).toBe(1);
  });
});

// ===========================================================================
// Authorization
// ===========================================================================

function buildFrozenVersion(prefix: string) {
  const kase = buildReadyToQuoteCase(prefix);
  const quote = createQuote(kase.state, dtekCtx({ idempotencyKey: `${prefix}-quote` }), {
    caseId: kase.caseId,
  });
  if (!quote.ok) throw new Error(`setup failed: quote (${quote.error.message})`);
  const version = createQuoteVersion(
    quote.nextState,
    dtekCtx({ idempotencyKey: `${prefix}-version` }),
    {
      quoteId: quote.data.id,
      currency: "GTQ",
    },
  );
  if (!version.ok) throw new Error(`setup failed: version (${version.error.message})`);
  const item = addQuoteItem(version.nextState, dtekCtx({ idempotencyKey: `${prefix}-item` }), {
    quoteVersionId: version.data.version.id,
    lineType: "part",
    description: "Pastillas de freno delanteras",
    quantity: 1,
    unitPriceMinor: 45000,
    currency: "GTQ",
  });
  if (!item.ok) throw new Error(`setup failed: item (${item.error.message})`);
  const frozen = freezeQuoteVersion(
    item.nextState,
    dtekCtx({ idempotencyKey: `${prefix}-freeze` }),
    {
      quoteVersionId: version.data.version.id,
    },
  );
  if (!frozen.ok) throw new Error(`setup failed: freeze (${frozen.error.message})`);
  return {
    state: frozen.nextState,
    caseId: kase.caseId,
    customerId: kase.customerId,
    versionId: version.data.version.id,
    hash: frozen.data.snapshotHash as string,
  };
}

function buildPreparedRequest(prefix: string) {
  const built = buildFrozenVersion(prefix);
  const prepared = prepareAuthorizationRequest(
    built.state,
    dtekCtx({ idempotencyKey: `${prefix}-prepare` }),
    {
      quoteVersionId: built.versionId,
      audienceCustomerId: built.customerId,
    },
  );
  if (!prepared.ok) throw new Error(`setup failed: prepare (${prepared.error.message})`);
  return {
    ...built,
    state: prepared.nextState,
    requestId: prepared.data.request.id,
    plainToken: prepared.data.plainToken,
  };
}

/** Same helper as `authorization-commands.test.ts` — `isFeatureEnabled`
 * resolves to `false` for a flag that was never seeded (see the comment on
 * that function, state.ts), so every `RevokeAndReprepareAuthorizationRequest`
 * test must inject the flag by hand. */
function withReissueFlag(state: CrmVehicleState, organizationId: string): CrmVehicleState {
  const flag: FeatureFlagRow = {
    id: "flag-authorization-reissue-conc-test",
    key: FEATURE_KEY_AUTHORIZATION_REISSUE,
    label: "Reenvío de solicitud de autorización",
    description: "test",
    defaultEnabled: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const featureFlagOverrides: FeatureFlagOverrideRow[] = [];
  void organizationId;
  return { ...state, featureFlags: [flag], featureFlagOverrides };
}

describe("Concurrencia — Authorization", () => {
  it("doble submit del mismo token disparado con Promise.all (misma decisión, dos idempotency keys distintas): una sola decisión persiste, el segundo intento recibe el error neutral ya documentado", async () => {
    const built = buildPreparedRequest("conc-auth-1");
    const engine = createCommandEngine(built.state);

    const decisionInput = {
      method: "secure_link" as const,
      token: built.plainToken,
      quoteVersionId: built.versionId,
      quoteVersionHash: built.hash,
      decision: "accept_all" as const,
    };

    const [d1, d2] = await Promise.all([
      Promise.resolve().then(() =>
        engine.recordAuthorization(guestCtx({ idempotencyKey: "conc-auth-1-a" }), decisionInput),
      ),
      Promise.resolve().then(() =>
        engine.recordAuthorization(guestCtx({ idempotencyKey: "conc-auth-1-b" }), decisionInput),
      ),
    ]);

    const results = [d1, d2];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    // `tokenInvalidError()` — mismo error neutral para cualquier motivo de
    // rechazo del token (sección 10.2), incluido "ya fue consumido".
    expect(failed && !failed.ok ? failed.error.code : null).toBe("TOKEN_INVALID");

    const authorizations = engine
      .getState()
      .authorizations.filter((a) => a.authorizationRequestId === built.requestId);
    expect(authorizations).toHaveLength(1);
  });

  it("el mismo token usado simultáneamente por dos requests con decisiones DISTINTAS: el resultado es determinista, nunca dos autorizaciones para el mismo authorizationRequestId", async () => {
    const built = buildPreparedRequest("conc-auth-2");
    const engine = createCommandEngine(built.state);

    const [accept, reject] = await Promise.all([
      Promise.resolve().then(() =>
        engine.recordAuthorization(guestCtx({ idempotencyKey: "conc-auth-2-accept" }), {
          method: "secure_link",
          token: built.plainToken,
          quoteVersionId: built.versionId,
          quoteVersionHash: built.hash,
          decision: "accept_all",
        }),
      ),
      Promise.resolve().then(() =>
        engine.recordAuthorization(guestCtx({ idempotencyKey: "conc-auth-2-reject" }), {
          method: "secure_link",
          token: built.plainToken,
          quoteVersionId: built.versionId,
          quoteVersionHash: built.hash,
          decision: "reject",
        }),
      ),
    ]);

    const results = [accept, reject];
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const authorizations = engine
      .getState()
      .authorizations.filter((a) => a.authorizationRequestId === built.requestId);
    expect(authorizations).toHaveLength(1);

    const kase = engine.getState().cases.find((c) => c.id === built.caseId);
    expect(["ready", "closed"]).toContain(kase?.status);
  });

  it("RevokeAndReprepareAuthorizationRequest concurrente con una decisión del cliente sobre la MISMA solicitud: el resultado es determinista en cualquier orden, nunca dos decisiones válidas simultáneas", () => {
    // Orden A: revoke gana primero -> la decisión con el token viejo falla neutral.
    const builtA = buildPreparedRequest("conc-auth-revoke-a");
    const engineA = createCommandEngine(
      withReissueFlag(builtA.state, FIXTURE_ORGANIZATION_IDS.dtek),
    );
    const revokeFirst = engineA.revokeAndReprepareAuthorizationRequest(
      ownerDtekCtx({ idempotencyKey: "car-a-revoke" }),
      { authorizationRequestId: builtA.requestId, reason: "Cliente perdió el enlace" },
    );
    expect(revokeFirst.ok).toBe(true);
    const decideSecond = engineA.recordAuthorization(guestCtx({ idempotencyKey: "car-a-decide" }), {
      method: "secure_link",
      token: builtA.plainToken,
      quoteVersionId: builtA.versionId,
      quoteVersionHash: builtA.hash,
      decision: "accept_all",
    });
    expect(decideSecond.ok).toBe(false);
    if (!decideSecond.ok) expect(decideSecond.error.code).toBe("TOKEN_INVALID");

    // Orden B: la decisión gana primero -> el revoke posterior falla porque
    // la solicitud ya no está vigente (ya no es prepared/sent/viewed).
    const builtB = buildPreparedRequest("conc-auth-revoke-b");
    const engineB = createCommandEngine(
      withReissueFlag(builtB.state, FIXTURE_ORGANIZATION_IDS.dtek),
    );
    const decideFirst = engineB.recordAuthorization(guestCtx({ idempotencyKey: "car-b-decide" }), {
      method: "secure_link",
      token: builtB.plainToken,
      quoteVersionId: builtB.versionId,
      quoteVersionHash: builtB.hash,
      decision: "accept_all",
    });
    expect(decideFirst.ok).toBe(true);
    const revokeSecond = engineB.revokeAndReprepareAuthorizationRequest(
      ownerDtekCtx({ idempotencyKey: "car-b-revoke" }),
      { authorizationRequestId: builtB.requestId, reason: "Intento tardío" },
    );
    expect(revokeSecond.ok).toBe(false);
    if (!revokeSecond.ok) expect(revokeSecond.error.code).toBe("CONFLICT");

    // En ambos órdenes, a lo sumo una decisión válida quedó registrada.
    expect(
      engineA
        .getState()
        .authorizations.filter((a) => a.authorizationRequestId === builtA.requestId),
    ).toHaveLength(0);
    expect(
      engineB
        .getState()
        .authorizations.filter((a) => a.authorizationRequestId === builtB.requestId),
    ).toHaveLength(1);
  });
});

// ===========================================================================
// Evidencia — `ConfirmEvidenceUpload` SÍ existe como comando en R0-D Fase 2
// (inspection-commands.ts), a diferencia de lo que el handoff R0-E
// contemplaba como posibilidad ("si no existe todavía"). Se prueban los dos
// casos con condición de carrera clara que el comando expone; "objeto
// eliminado antes de confirmar" se reinterpreta honestamente como
// "vencido" — no existe un comando `CancelUploadIntent`/`DeleteEvidence` en
// R0, solo vencimiento natural de `upload_intents.expires_at` (ver el
// reporte de cierre).
// ===========================================================================

describe("Concurrencia — Evidencia", () => {
  it("dos ConfirmEvidenceUpload disparados con Promise.all sobre el MISMO upload intent: uno gana, el otro CONFLICT, un solo evidence_asset", async () => {
    const ready = buildScheduledCase("conc-evidence-1");
    const intent = createUploadIntent(
      ready.state,
      dtekCtx({ idempotencyKey: "conc-evidence-1-intent" }),
      {
        caseId: ready.caseId,
        purpose: "Foto de pastilla desgastada",
        declaredMime: "image/jpeg",
        visibilityRequested: "internal",
      },
    );
    if (!intent.ok) throw new Error(`setup failed: intent (${intent.error.message})`);

    const engine = createCommandEngine(intent.nextState);
    const confirmInput = {
      uploadIntentId: intent.data.id,
      mimeDetected: "image/jpeg",
      bytes: 204800,
      hash: "a".repeat(64),
    };

    const [c1, c2] = await Promise.all([
      Promise.resolve().then(() =>
        engine.confirmEvidenceUpload(
          dtekCtx({ idempotencyKey: "conc-evidence-1-a" }),
          confirmInput,
        ),
      ),
      Promise.resolve().then(() =>
        engine.confirmEvidenceUpload(
          dtekCtx({ idempotencyKey: "conc-evidence-1-b" }),
          confirmInput,
        ),
      ),
    ]);

    const results = [c1, c2];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed && !failed.ok ? failed.error.code : null).toBe("CONFLICT");
    expect(
      engine.getState().evidenceAssets.filter((a) => a.uploadIntentId === intent.data.id),
    ).toHaveLength(1);
  });

  it("confirmar un upload intent ya vencido falla limpio — brecha documentada: no existe comando de cancelación/eliminación explícita de upload_intents en R0, solo vencimiento natural", () => {
    const ready = buildScheduledCase("conc-evidence-2");
    const createdAt = new Date("2026-08-10T09:00:00.000Z");
    const intent = createUploadIntent(
      ready.state,
      dtekCtx({ idempotencyKey: "conc-evidence-2-intent", now: createdAt }),
      {
        caseId: ready.caseId,
        purpose: "Foto",
        declaredMime: "image/jpeg",
        visibilityRequested: "internal",
        expiresInMinutes: 1,
      },
    );
    if (!intent.ok) throw new Error(`setup failed: intent (${intent.error.message})`);

    const lateCtx = dtekCtx({
      idempotencyKey: "conc-evidence-2-confirm",
      now: new Date("2026-08-10T09:05:00.000Z"),
    });
    const confirmed = confirmEvidenceUpload(intent.nextState, lateCtx, {
      uploadIntentId: intent.data.id,
      mimeDetected: "image/jpeg",
      bytes: 1000,
      hash: "b".repeat(64),
    });
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) expect(confirmed.error.code).toBe("CONFLICT");
    expect(intent.nextState.evidenceAssets).toHaveLength(0);
  });

  it("dos LinkEvidence concurrentes sobre el mismo asset con visibilidades DISTINTAS: ambos se crean como links independientes (diseño válido — múltiples links por asset), y ninguno amplía la visibilidad más allá del techo del asset", async () => {
    const ready = buildScheduledCase("conc-evidence-3");
    const intent = createUploadIntent(
      ready.state,
      dtekCtx({ idempotencyKey: "conc-evidence-3-intent" }),
      {
        caseId: ready.caseId,
        purpose: "Foto",
        declaredMime: "image/jpeg",
        visibilityRequested: "internal",
      },
    );
    if (!intent.ok) throw new Error(`setup failed: intent (${intent.error.message})`);
    const asset = confirmEvidenceUpload(
      intent.nextState,
      dtekCtx({ idempotencyKey: "conc-evidence-3-confirm" }),
      {
        uploadIntentId: intent.data.id,
        mimeDetected: "image/jpeg",
        bytes: 1000,
        hash: "c".repeat(64),
      },
    );
    if (!asset.ok) throw new Error(`setup failed: confirm (${asset.error.message})`);

    const engine = createCommandEngine(asset.nextState);
    const [l1, l2] = await Promise.all([
      Promise.resolve().then(() =>
        engine.linkEvidence(dtekCtx({ idempotencyKey: "conc-evidence-3-a" }), {
          assetId: asset.data.id,
          entityType: "case",
          entityId: ready.caseId,
          visibility: "customer",
        }),
      ),
      Promise.resolve().then(() =>
        engine.linkEvidence(dtekCtx({ idempotencyKey: "conc-evidence-3-b" }), {
          assetId: asset.data.id,
          entityType: "case",
          entityId: ready.caseId,
          visibility: "shared_case",
        }),
      ),
    ]);

    expect(l1.ok).toBe(true);
    expect(l2.ok).toBe(true);
    // El techo (`visibilityMax`) del asset es `internal` — ninguna
    // visibilidad SOLICITADA por un link puede superarlo (sección 8.3).
    if (l1.ok) expect(l1.data.effectiveVisibility).toBe("internal");
    if (l2.ok) expect(l2.data.effectiveVisibility).toBe("internal");
    expect(engine.getState().evidenceLinks.filter((l) => l.assetId === asset.data.id)).toHaveLength(
      2,
    );
  });
});
