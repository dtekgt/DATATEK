// Idempotencia — DATATEK_R0_E hardening sección 7.
//
// Prueba los 6 comandos obligatorios de sección 7
// (`CreateCaseFromIntake`, `ScheduleAppointment`, `ConfirmEvidenceUpload`,
// `FreezeQuoteVersion`, `PrepareAuthorizationRequest`, `RecordAuthorization`)
// contra las dos reglas literales:
//
//   - misma key + mismo input -> mismo resultado (replay), sin re-ejecutar
//     el comando ni crear una segunda fila;
//   - misma key + input DISTINTO -> falla con un error claro (CONFLICT),
//     nunca devuelve en silencio el resultado viejo.
//
// La segunda regla NO se cumplía antes de este pase — `findIdempotentReplay`
// (state.ts) solo comparaba `(organizationId, commandName, key)`, nunca el
// contenido del input, así que una key reutilizada con un input distinto
// devolvía el resultado VIEJO sin ningún aviso. Este archivo prueba el fix
// acotado (`hashCommandInput`/`checkIdempotencyKeyConflict`, state.ts) que
// cierra esa brecha SOLO para estos 6 comandos — ver el comentario en
// `IdempotencyRecord.inputHash` (state.ts) y el reporte de cierre de fase
// para el resto de comandos, que conservan el comportamiento anterior.
import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { buildTestContext, buildReadyToQuoteCase } from "./test-helpers.ts";
import { createEmptyState, type CrmVehicleState, type ResourceRow } from "./state.ts";
import { createProvisionalCustomer } from "./crm-commands.ts";
import { registerVehicle } from "./vehicle-commands.ts";
import { createManualIntake, createCaseFromIntake, transitionCase } from "./intake-commands.ts";
import { scheduleAppointment } from "./agenda-commands.ts";
import { createUploadIntent, confirmEvidenceUpload } from "./inspection-commands.ts";
import {
  createQuote,
  createQuoteVersion,
  addQuoteItem,
  freezeQuoteVersion,
} from "./quote-commands.ts";
import { prepareAuthorizationRequest, recordAuthorization } from "./authorization-commands.ts";

const dtekCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const guestCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: "guest-no-account",
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

const RESOURCE: ResourceRow = {
  id: "res-bay-idem-1",
  organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
  branchId: null,
  resourceType: "bay",
  label: "Bahía de prueba (idempotencia)",
  isActive: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

function stateWithResource(): CrmVehicleState {
  return { ...createEmptyState(), resources: [RESOURCE] };
}

let vinCounter = 0;
function nextVin(): string {
  vinCounter += 1;
  // "VJ" avoids the VIN charset exclusions (no I/O/Q) — see normalize.ts.
  return `VJ${String(vinCounter).padStart(15, "0")}`;
}

function buildScheduledCase(prefix: string) {
  const customer = createProvisionalCustomer(
    stateWithResource(),
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
  return {
    state: intake.nextState,
    threadId: intake.data.thread.id,
    customerId: customer.data.id,
    vehicleId: vehicle.data.vehicleId,
  };
}

// ===========================================================================
// CreateCaseFromIntake
// ===========================================================================

describe("Idempotencia — CreateCaseFromIntake", () => {
  it("misma key + mismo input: replay, mismo caso, sin folio nuevo", () => {
    const ready = buildScheduledCase("idem-case-same");
    const ctx = dtekCtx({ idempotencyKey: "idem-case-same-key" });
    const input = {
      intakeThreadId: ready.threadId,
      customerId: ready.customerId,
      vehicleId: ready.vehicleId,
      summary: "Frenos",
    };
    const first = createCaseFromIntake(ready.state, ctx, input);
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);
    expect(first.replayed).toBe(false);

    const retry = createCaseFromIntake(first.nextState, ctx, input);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.case.id).toBe(first.data.case.id);
    expect(retry.data.case.folioNumber).toBe(first.data.case.folioNumber);
    expect(retry.nextState.cases).toHaveLength(1);
  });

  it("misma key + input DISTINTO: falla con CONFLICT, no devuelve el resultado viejo ni crea un segundo caso", () => {
    const ready = buildScheduledCase("idem-case-diff");
    const ctx = dtekCtx({ idempotencyKey: "idem-case-diff-key" });
    const first = createCaseFromIntake(ready.state, ctx, {
      intakeThreadId: ready.threadId,
      customerId: ready.customerId,
      vehicleId: ready.vehicleId,
      summary: "Frenos",
    });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const differentInput = createCaseFromIntake(first.nextState, ctx, {
      intakeThreadId: ready.threadId,
      customerId: ready.customerId,
      vehicleId: ready.vehicleId,
      summary: "Motor — cambio de resumen, mismo intake/key", // único campo distinto
    });
    expect(differentInput.ok).toBe(false);
    if (differentInput.ok) return;
    expect(differentInput.error.code).toBe("CONFLICT");
    expect(differentInput.error.message).toMatch(/input distinto/);
    // Ningún estado nuevo se produjo — sigue habiendo un solo caso.
    expect(first.nextState.cases).toHaveLength(1);
  });
});

// ===========================================================================
// ScheduleAppointment
// ===========================================================================

describe("Idempotencia — ScheduleAppointment", () => {
  function buildTriagedCase(prefix: string) {
    const ready = buildScheduledCase(prefix);
    const kase = createCaseFromIntake(ready.state, dtekCtx({ idempotencyKey: `${prefix}-case` }), {
      intakeThreadId: ready.threadId,
      customerId: ready.customerId,
      vehicleId: ready.vehicleId,
      summary: "Frenos",
    });
    if (!kase.ok) throw new Error(`setup failed: case (${kase.error.message})`);
    const toTriage = transitionCase(
      kase.nextState,
      dtekCtx({ idempotencyKey: `${prefix}-triage` }),
      {
        caseId: kase.data.case.id,
        toStatus: "triage",
      },
    );
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
    return { state: toScheduled.nextState, caseId: kase.data.case.id };
  }

  it("misma key + mismo input: replay, no una segunda reserva", () => {
    const ready = buildTriagedCase("idem-sched-same");
    const ctx = dtekCtx({ idempotencyKey: "idem-sched-same-key" });
    const input = {
      caseId: ready.caseId,
      startsAt: "2026-08-11T09:00:00.000Z",
      endsAt: "2026-08-11T10:00:00.000Z",
      resourceIds: [RESOURCE.id],
    };
    const first = scheduleAppointment(ready.state, ctx, input);
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const retry = scheduleAppointment(first.nextState, ctx, input);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.appointment.id).toBe(first.data.appointment.id);
    expect(retry.nextState.appointments).toHaveLength(1);
    expect(retry.nextState.resourceReservations).toHaveLength(1);
  });

  it("misma key + input DISTINTO (rango distinto): falla con CONFLICT, no crea una segunda cita/reserva", () => {
    const ready = buildTriagedCase("idem-sched-diff");
    const ctx = dtekCtx({ idempotencyKey: "idem-sched-diff-key" });
    const first = scheduleAppointment(ready.state, ctx, {
      caseId: ready.caseId,
      startsAt: "2026-08-12T09:00:00.000Z",
      endsAt: "2026-08-12T10:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const differentInput = scheduleAppointment(first.nextState, ctx, {
      caseId: ready.caseId,
      startsAt: "2026-08-12T14:00:00.000Z", // horario distinto, misma key
      endsAt: "2026-08-12T15:00:00.000Z",
      resourceIds: [RESOURCE.id],
    });
    expect(differentInput.ok).toBe(false);
    if (differentInput.ok) return;
    expect(differentInput.error.code).toBe("CONFLICT");
    expect(first.nextState.appointments).toHaveLength(1);
    expect(first.nextState.resourceReservations).toHaveLength(1);
  });
});

// ===========================================================================
// ConfirmEvidenceUpload
// ===========================================================================

describe("Idempotencia — ConfirmEvidenceUpload", () => {
  function buildUploadIntent(prefix: string) {
    const ready = buildScheduledCase(prefix);
    const kase = createCaseFromIntake(ready.state, dtekCtx({ idempotencyKey: `${prefix}-case` }), {
      intakeThreadId: ready.threadId,
      customerId: ready.customerId,
      vehicleId: ready.vehicleId,
      summary: "Frenos",
    });
    if (!kase.ok) throw new Error(`setup failed: case (${kase.error.message})`);
    const intent = createUploadIntent(
      kase.nextState,
      dtekCtx({ idempotencyKey: `${prefix}-intent` }),
      {
        caseId: kase.data.case.id,
        purpose: "Foto",
        declaredMime: "image/jpeg",
        visibilityRequested: "internal",
      },
    );
    if (!intent.ok) throw new Error(`setup failed: intent (${intent.error.message})`);
    return { state: intent.nextState, uploadIntentId: intent.data.id };
  }

  it("misma key + mismo input: replay, un solo evidence_asset", () => {
    const ready = buildUploadIntent("idem-evi-same");
    const ctx = dtekCtx({ idempotencyKey: "idem-evi-same-key" });
    const input = {
      uploadIntentId: ready.uploadIntentId,
      mimeDetected: "image/jpeg",
      bytes: 1000,
      hash: "d".repeat(64),
    };
    const first = confirmEvidenceUpload(ready.state, ctx, input);
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const retry = confirmEvidenceUpload(first.nextState, ctx, input);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.id).toBe(first.data.id);
    expect(retry.nextState.evidenceAssets).toHaveLength(1);
  });

  it("misma key + input DISTINTO (hash distinto): falla con CONFLICT, no crea un segundo evidence_asset", () => {
    const ready = buildUploadIntent("idem-evi-diff");
    const ctx = dtekCtx({ idempotencyKey: "idem-evi-diff-key" });
    const first = confirmEvidenceUpload(ready.state, ctx, {
      uploadIntentId: ready.uploadIntentId,
      mimeDetected: "image/jpeg",
      bytes: 1000,
      hash: "e".repeat(64),
    });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const differentInput = confirmEvidenceUpload(first.nextState, ctx, {
      uploadIntentId: ready.uploadIntentId,
      mimeDetected: "image/jpeg",
      bytes: 1000,
      hash: "f".repeat(64), // hash distinto, misma key — un archivo distinto no puede colarse bajo la misma key
    });
    expect(differentInput.ok).toBe(false);
    if (differentInput.ok) return;
    expect(differentInput.error.code).toBe("CONFLICT");
    expect(first.nextState.evidenceAssets).toHaveLength(1);
  });
});

// ===========================================================================
// FreezeQuoteVersion
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
  return { state: item.nextState, quoteId: quote.data.id, versionId: version.data.version.id };
}

describe("Idempotencia — FreezeQuoteVersion", () => {
  it("misma key + mismo input: replay, mismo hash/snapshot, una sola versión frozen", () => {
    const draft = buildDraftVersion("idem-freeze-same");
    const ctx = dtekCtx({ idempotencyKey: "idem-freeze-same-key" });
    const input = { quoteVersionId: draft.versionId };
    const first = freezeQuoteVersion(draft.state, ctx, input);
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const retry = freezeQuoteVersion(first.nextState, ctx, input);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.snapshotHash).toBe(first.data.snapshotHash);
    expect(
      retry.nextState.quoteVersions.filter(
        (v) => v.quoteId === draft.quoteId && v.status === "frozen",
      ),
    ).toHaveLength(1);
  });

  it("misma key + input DISTINTO (expectedVersionNumber agregado): falla con CONFLICT, no reintenta el freeze con otra semántica bajo la misma key", () => {
    const draft = buildDraftVersion("idem-freeze-diff");
    const ctx = dtekCtx({ idempotencyKey: "idem-freeze-diff-key" });
    const first = freezeQuoteVersion(draft.state, ctx, { quoteVersionId: draft.versionId });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const differentInput = freezeQuoteVersion(first.nextState, ctx, {
      quoteVersionId: draft.versionId,
      expectedVersionNumber: 1, // campo adicional distinto, misma key
    });
    expect(differentInput.ok).toBe(false);
    if (differentInput.ok) return;
    expect(differentInput.error.code).toBe("CONFLICT");
    expect(
      first.nextState.quoteVersions.filter(
        (v) => v.quoteId === draft.quoteId && v.status === "frozen",
      ),
    ).toHaveLength(1);
  });
});

// ===========================================================================
// PrepareAuthorizationRequest
// ===========================================================================

function buildFrozenVersion(prefix: string) {
  const draft = buildDraftVersion(prefix);
  const kase = draft.state.quotes.find((q) => q.id === draft.quoteId)!;
  const frozen = freezeQuoteVersion(draft.state, dtekCtx({ idempotencyKey: `${prefix}-freeze` }), {
    quoteVersionId: draft.versionId,
  });
  if (!frozen.ok) throw new Error(`setup failed: freeze (${frozen.error.message})`);
  const customerId = frozen.nextState.cases.find((c) => c.id === kase.caseId)!.customerId;
  return { state: frozen.nextState, versionId: draft.versionId, caseId: kase.caseId, customerId };
}

describe("Idempotencia — PrepareAuthorizationRequest", () => {
  it("misma key + mismo input: replay, mismo request/token, sin doble transición de caso", () => {
    const frozen = buildFrozenVersion("idem-prep-same");
    const ctx = dtekCtx({ idempotencyKey: "idem-prep-same-key" });
    const input = { quoteVersionId: frozen.versionId, audienceCustomerId: frozen.customerId };
    const first = prepareAuthorizationRequest(frozen.state, ctx, input);
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const retry = prepareAuthorizationRequest(first.nextState, ctx, input);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.request.id).toBe(first.data.request.id);
    expect(retry.data.plainToken).toBe(first.data.plainToken);
    expect(
      retry.nextState.authorizationRequests.filter((r) => r.caseId === frozen.caseId),
    ).toHaveLength(1);
  });

  it("misma key + input DISTINTO (audienceCustomerId distinto): falla con CONFLICT, no crea una segunda solicitud", () => {
    const frozen = buildFrozenVersion("idem-prep-diff");
    const ctx = dtekCtx({ idempotencyKey: "idem-prep-diff-key" });
    const first = prepareAuthorizationRequest(frozen.state, ctx, {
      quoteVersionId: frozen.versionId,
      audienceCustomerId: frozen.customerId,
    });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const differentInput = prepareAuthorizationRequest(first.nextState, ctx, {
      quoteVersionId: frozen.versionId,
      audienceCustomerId: "otro-customer-id-distinto",
    });
    expect(differentInput.ok).toBe(false);
    if (differentInput.ok) return;
    expect(differentInput.error.code).toBe("CONFLICT");
    expect(
      first.nextState.authorizationRequests.filter((r) => r.caseId === frozen.caseId),
    ).toHaveLength(1);
  });
});

// ===========================================================================
// RecordAuthorization
// ===========================================================================

function buildPreparedRequest(prefix: string) {
  const frozen = buildFrozenVersion(prefix);
  const prepared = prepareAuthorizationRequest(
    frozen.state,
    dtekCtx({ idempotencyKey: `${prefix}-prepare` }),
    {
      quoteVersionId: frozen.versionId,
      audienceCustomerId: frozen.customerId,
    },
  );
  if (!prepared.ok) throw new Error(`setup failed: prepare (${prepared.error.message})`);
  const version = prepared.nextState.quoteVersions.find((v) => v.id === frozen.versionId)!;
  return {
    state: prepared.nextState,
    requestId: prepared.data.request.id,
    plainToken: prepared.data.plainToken,
    versionId: frozen.versionId,
    hash: version.snapshotHash as string,
  };
}

describe("Idempotencia — RecordAuthorization", () => {
  it("misma key + mismo input: replay, una sola autorización, el token sigue consumido una sola vez", () => {
    const built = buildPreparedRequest("idem-rec-same");
    const ctx = guestCtx({ idempotencyKey: "idem-rec-same-key" });
    const input = {
      method: "secure_link" as const,
      token: built.plainToken,
      quoteVersionId: built.versionId,
      quoteVersionHash: built.hash,
      decision: "accept_all" as const,
    };
    const first = recordAuthorization(built.state, ctx, input);
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const retry = recordAuthorization(first.nextState, ctx, input);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.data.authorization.id).toBe(first.data.authorization.id);
    expect(
      retry.nextState.authorizations.filter((a) => a.authorizationRequestId === built.requestId),
    ).toHaveLength(1);
  });

  it("misma key + input DISTINTO (decisión distinta): falla con CONFLICT, no reemplaza la decisión ya registrada", () => {
    const built = buildPreparedRequest("idem-rec-diff");
    const ctx = guestCtx({ idempotencyKey: "idem-rec-diff-key" });
    const first = recordAuthorization(built.state, ctx, {
      method: "secure_link",
      token: built.plainToken,
      quoteVersionId: built.versionId,
      quoteVersionHash: built.hash,
      decision: "accept_all",
    });
    if (!first.ok) throw new Error(`setup failed: first (${first.error.message})`);

    const differentInput = recordAuthorization(first.nextState, ctx, {
      method: "secure_link",
      token: built.plainToken,
      quoteVersionId: built.versionId,
      quoteVersionHash: built.hash,
      decision: "reject", // decisión distinta, misma key
    });
    expect(differentInput.ok).toBe(false);
    if (differentInput.ok) return;
    expect(differentInput.error.code).toBe("CONFLICT");

    const authorizations = first.nextState.authorizations.filter(
      (a) => a.authorizationRequestId === built.requestId,
    );
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0]?.status).toBe("accepted"); // la decisión original, intacta
  });
});
