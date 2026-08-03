#!/usr/bin/env node
// Semilla del journey completo de R0-D/R0-E contra el servidor de desarrollo.
//
// No inserta filas: emite los MISMOS comandos que emite la interfaz, contra
// `/api/dev/commands`. Esa distinción es el punto del script — una semilla que
// escribe estado directamente puede producir un estado que la aplicación nunca
// podría alcanzar, y entonces la demo prueba algo que no existe. Aquí, si una
// transición de la máquina de estados es inválida, la semilla falla.
//
//   pnpm seed:demo                       (usa http://localhost:3000)
//   DATATEK_BASE_URL=http://localhost:4177 pnpm seed:demo
//
// Imprime al final los identificadores reales y el enlace de autorización en
// claro. Ese enlace sólo existe en la respuesta del comando: el servidor
// guarda el hash, nunca el secreto (`docs/domain/authorization-security.md`).

const BASE_URL = process.env.DATATEK_BASE_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/dev/commands`;
const ORG_SLUG = "dtek-servicios";
const OWNER_ACTOR_ID = "u-owner-dtek";
const SEEDED_RESOURCE_ID = "res-dtek-bay-1";

// Prefijo por corrida: las claves de idempotencia deben ser únicas entre
// corridas, o la segunda semilla devolvería el resultado cacheado de la
// primera en vez de crear un caso nuevo.
const runId = `demo-${Date.now()}`;
let seq = 0;
const nextKey = (prefix) => `${prefix}-${runId}-${++seq}`;

async function postCommand(command, input, opts = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      command,
      orgSlug: opts.orgSlug ?? ORG_SLUG,
      actorId: opts.actorId ?? OWNER_ACTOR_ID,
      idempotencyKey: opts.idempotencyKey ?? nextKey(command),
      input,
    }),
  });
  const body = await res.json();
  if (!body.ok) {
    throw new Error(
      `${command} falló (HTTP ${res.status}): ${body.error?.code} — ${body.error?.message}`,
    );
  }
  return body;
}

// La plantilla de frenos exige 4 esquinas × 8 ítems + 4 ítems de vehículo.
// `CompleteInspection` rechaza la inspección si falta cualquiera, así que la
// semilla los recorre todos en vez de asumir un subconjunto.
const AXLE_SIDE_ITEMS = [
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

function requiredSlots() {
  const slots = [];
  for (const item of AXLE_SIDE_ITEMS) {
    for (const axle of ["front", "rear"]) {
      for (const side of ["left", "right"]) {
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

async function main() {
  const customer = await postCommand(
    "CreateProvisionalCustomer",
    { displayName: "Maria Fernanda Lopez", source: "walk_in" },
    { idempotencyKey: `${runId}-customer` },
  );
  const customerId = customer.data.id;

  const vehicle = await postCommand(
    "RegisterVehicle",
    { vin: `VDTK${String(Date.now()).slice(-8)}`, customerId },
    { idempotencyKey: `${runId}-vehicle` },
  );
  const vehicleId = vehicle.data.vehicleId;

  const intake = await postCommand(
    "CreateManualIntake",
    {
      customerId,
      channel: "whatsapp_manual",
      originalText: "Los frenos hacen ruido al frenar",
      reportedAt: "2026-08-01T10:00:00.000Z",
    },
    { idempotencyKey: `${runId}-intake` },
  );

  const kase = await postCommand(
    "CreateCaseFromIntake",
    {
      intakeThreadId: intake.data.thread.id,
      customerId,
      vehicleId,
      summary: "Frenos hacen ruido — revision",
    },
    { idempotencyKey: `${runId}-case` },
  );
  const caseId = kase.data.case.id;

  await postCommand(
    "TransitionCase",
    { caseId, toStatus: "triage" },
    { idempotencyKey: `${runId}-triage` },
  );
  await postCommand(
    "TransitionCase",
    { caseId, toStatus: "scheduled" },
    { idempotencyKey: `${runId}-scheduled` },
  );

  // El guard de doble reserva es real, así que una semilla con hora fija sólo
  // funciona la primera vez: la segunda corrida choca con la bahía que la
  // primera dejó ocupada. En vez de fingir una ventana libre, se pide la
  // siguiente hasta encontrar una — y de paso queda demostrado que el guard
  // rechaza el solapamiento en lugar de aceptarlo en silencio.
  const HOUR = 3_600_000;
  let appointment = null;
  let conflictos = 0;
  for (let intento = 0; intento < 48 && !appointment; intento++) {
    const startsAt = new Date(Date.parse("2026-08-03T09:00:00.000Z") + intento * HOUR);
    try {
      appointment = await postCommand(
        "ScheduleAppointment",
        {
          caseId,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + HOUR).toISOString(),
          resourceIds: [SEEDED_RESOURCE_ID],
        },
        { idempotencyKey: `${runId}-appt-${intento}` },
      );
    } catch (err) {
      if (!/CONFLICT/.test(String(err.message))) throw err;
      conflictos += 1;
    }
  }
  if (!appointment) throw new Error("no hay ventana libre en 48 h para la bahía de demo");

  await postCommand(
    "ReceiveVehicle",
    {
      caseId,
      appointmentId: appointment.data.appointment.id,
      odometer: {
        value: 84210,
        unit: "km",
        recordedAt: "2026-08-03T09:05:00.000Z",
        provenance: "observed",
      },
    },
    { idempotencyKey: `${runId}-receive` },
  );

  const inspection = await postCommand(
    "StartInspection",
    { caseId, odometerKmAtInspection: 84210 },
    { idempotencyKey: `${runId}-start-insp` },
  );
  const inspectionId = inspection.data.inspection.id;

  let i = 0;
  for (const slot of requiredSlots()) {
    i += 1;
    const result = await postCommand(
      "RecordInspectionResult",
      {
        inspectionId,
        itemKey: slot.itemKey,
        axle: slot.axle,
        side: slot.side,
        condition: "pass",
        provenance: "measured",
      },
      { idempotencyKey: `${runId}-r${i}` },
    );
    if (slot.requiresMeasurement) {
      await postCommand(
        "RecordMeasurement",
        {
          inspectionResultId: result.data.id,
          value: 8,
          unit: slot.measurementUnit ?? "mm",
          provenance: "measured",
        },
        { idempotencyKey: `${runId}-m${i}` },
      );
    }
  }

  await postCommand(
    "CompleteInspection",
    { inspectionId },
    { idempotencyKey: `${runId}-complete` },
  );

  const quote = await postCommand("CreateQuote", { caseId }, { idempotencyKey: `${runId}-quote` });
  const version = await postCommand(
    "CreateQuoteVersion",
    { quoteId: quote.data.id, currency: "GTQ" },
    { idempotencyKey: `${runId}-version` },
  );
  const quoteVersionId = version.data.version.id;

  const item1 = await postCommand(
    "AddQuoteItem",
    {
      quoteVersionId,
      lineType: "part",
      description: "Pastillas de freno delanteras",
      quantity: 1,
      unitPriceMinor: 45000,
      currency: "GTQ",
    },
    { idempotencyKey: `${runId}-item1` },
  );
  const item2 = await postCommand(
    "AddQuoteItem",
    {
      quoteVersionId,
      lineType: "labor",
      description: "Mano de obra — sistema de frenos",
      quantity: 1,
      unitPriceMinor: 25000,
      currency: "GTQ",
    },
    { idempotencyKey: `${runId}-item2` },
  );

  const frozen = await postCommand(
    "FreezeQuoteVersion",
    { quoteVersionId },
    { idempotencyKey: `${runId}-freeze` },
  );

  const authz = await postCommand(
    "PrepareAuthorizationRequest",
    { quoteVersionId, audienceCustomerId: customerId },
    { idempotencyKey: `${runId}-authz` },
  );

  console.log(
    JSON.stringify(
      {
        caseId,
        folioCode: kase.data.case.folioCode,
        customerId,
        vehicleId,
        quoteVersionId,
        quoteItemIds: [
          item1.data?.id ?? item1.data?.item?.id,
          item2.data?.id ?? item2.data?.item?.id,
        ],
        authorizationRequestId: authz.data.request?.id,
        plainToken: authz.data.plainToken,
        snapshotHash: frozen.data.snapshotHash,
        totalMinor: frozen.data.totalMinor,
        orgSlug: ORG_SLUG,
        conflictosDeAgendaEsquivados: conflictos,
        casoEnPro: `${BASE_URL}/pro/o/${ORG_SLUG}/cases/${caseId}`,
        enlaceDeAutorizacion: `${BASE_URL}/a/${authz.data.plainToken}`,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
