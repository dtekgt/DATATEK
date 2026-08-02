// Agenda commands — DATATEK_R0_D sección 8.
//
// `CreateTemporaryReservation`, `ScheduleAppointment`, `ConfirmAppointment`,
// `CancelAppointment`, `ReceiveVehicle`.
//
// `resource_reservations` in `supabase/migrations/0060_scheduling.sql` uses
// `EXCLUDE USING gist (resource_id with =, tstzrange(starts_at, ends_at, '[)')
// with &&) where (status <> 'released')` — dos transacciones concurrentes no
// reservan el mismo espacio. Postgres is not reachable in this sandbox, so
// `overlapsActiveReservation` below is this engine's TypeScript replica of
// that same rule: an `[starts_at, ends_at)` half-open range overlap check
// against every reservation for the resource that is not `released`. Once
// Postgres is reachable, the constraint above is the real source of truth —
// this function must keep matching it exactly.
//
// `ScheduleAppointment` deliberately does NOT call `resolveCaseTransition` —
// see the comment on that function in
// `packages/domain/src/case/case-transitions.ts`: only `TransitionCase`,
// `ReceiveVehicle`, `StartInspection` and `CompleteInspection` move a case's
// status. Reaching `scheduled` before `ReceiveVehicle` is the caller's job,
// via the generic `TransitionCase` command (`new` -> `triage` -> `scheduled`).
import {
  resolveCaseTransition,
  evaluateOdometerReading,
  odometerValueInKm,
  type Provenance,
} from "@datatek/domain";
import {
  requirePermission,
  validationError,
  notFoundError,
  conflictError,
  type CommandContext,
} from "./context.ts";
import {
  appendAuditEvent,
  appendIdempotencyRecord,
  cryptoRandomId,
  findIdempotentReplay,
  type CommandOutcome,
  type CrmVehicleState,
  type ResourceReservationRow,
  type AppointmentRow,
  type AppointmentResourceRow,
  type AssignmentEventRow,
  type VehicleOdometerEventRow,
  type CaseRow,
} from "./state.ts";

const AGENDA_PERMISSION = "agenda.manage" as const;
const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** Half-open `[starts_at, ends_at)` overlap — mirrors the `&&` operator of
 * Postgres's `tstzrange` used by the real `EXCLUDE` constraint. */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
  );
}

function overlapsActiveReservation(
  state: CrmVehicleState,
  resourceId: string,
  startsAt: string,
  endsAt: string,
): boolean {
  return state.resourceReservations.some(
    (r) =>
      r.resourceId === resourceId &&
      r.status !== "released" &&
      rangesOverlap(r.startsAt, r.endsAt, startsAt, endsAt),
  );
}

function validateRange(startsAt: string, endsAt: string): string | null {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "Fechas inválidas.";
  if (end <= start) return "endsAt debe ser posterior a startsAt.";
  return null;
}

// --- CreateTemporaryReservation ----------------------------------------------
// A standalone `hold` on a resource for a range, tied to an already-existing
// appointment (schema requires `appointment_id` NOT NULL) — used to reserve a
// slot before it is confirmed. Expires automatically after `holdMinutes`.

export interface CreateTemporaryReservationInput {
  appointmentId: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  holdMinutes?: number;
}

const COMMAND_CREATE_TEMPORARY_RESERVATION = "CreateTemporaryReservation";

export function createTemporaryReservation(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateTemporaryReservationInput,
): CommandOutcome<ResourceReservationRow> {
  const replay = findIdempotentReplay<ResourceReservationRow>(
    state,
    ctx,
    COMMAND_CREATE_TEMPORARY_RESERVATION,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, AGENDA_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const rangeError = validateRange(input.startsAt, input.endsAt);
  if (rangeError) return { ok: false, error: validationError(rangeError, "endsAt") };

  const appointment = state.appointments.find(
    (a) => a.id === input.appointmentId && a.organizationId === ctx.organizationId,
  );
  if (!appointment) return { ok: false, error: notFoundError() };

  const resource = state.resources.find(
    (r) => r.id === input.resourceId && r.organizationId === ctx.organizationId,
  );
  if (!resource) return { ok: false, error: notFoundError() };

  // Same rule as the real `EXCLUDE USING gist` constraint — see file header.
  if (overlapsActiveReservation(state, input.resourceId, input.startsAt, input.endsAt)) {
    return {
      ok: false,
      error: conflictError(
        "El recurso ya tiene una reserva activa que se solapa con este rango (conflicto de agenda).",
      ),
    };
  }

  const holdMinutes = input.holdMinutes ?? 15;
  const expiresAt = new Date(ctx.now.getTime() + holdMinutes * 60_000).toISOString();

  const reservation: ResourceReservationRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    resourceId: input.resourceId,
    appointmentId: appointment.id,
    status: "hold",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    expiresAt,
    idempotencyKey: ctx.idempotencyKey,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
    releasedAt: null,
    releasedReason: null,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CREATE_TEMPORARY_RESERVATION,
    "Reserva temporal creada",
    { resourceId: resource.id, reservationId: reservation.id },
  );

  const nextState: CrmVehicleState = {
    ...state,
    resourceReservations: [...state.resourceReservations, reservation],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_TEMPORARY_RESERVATION, reservation),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: reservation, replayed: false };
}

// --- ScheduleAppointment -------------------------------------------------------

export interface ScheduleAppointmentInput {
  caseId: string;
  branchId?: string | null;
  startsAt: string;
  endsAt: string;
  purpose?: string | null;
  resourceIds: string[];
}

export interface ScheduleAppointmentOutput {
  appointment: AppointmentRow;
  reservations: ResourceReservationRow[];
}

const COMMAND_SCHEDULE_APPOINTMENT = "ScheduleAppointment";

export function scheduleAppointment(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: ScheduleAppointmentInput,
): CommandOutcome<ScheduleAppointmentOutput> {
  const replay = findIdempotentReplay<ScheduleAppointmentOutput>(
    state,
    ctx,
    COMMAND_SCHEDULE_APPOINTMENT,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, AGENDA_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const rangeError = validateRange(input.startsAt, input.endsAt);
  if (rangeError) return { ok: false, error: validationError(rangeError, "endsAt") };

  if (input.resourceIds.length === 0) {
    return { ok: false, error: validationError("Se requiere al menos un recurso.", "resourceIds") };
  }

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  for (const resourceId of input.resourceIds) {
    const resource = state.resources.find(
      (r) => r.id === resourceId && r.organizationId === ctx.organizationId,
    );
    if (!resource) return { ok: false, error: notFoundError() };
    // Same rule as the real `EXCLUDE USING gist` constraint — see file
    // header. Checked BEFORE any mutation so a colliding second reservation
    // never gets created silently, for any of the requested resources.
    if (overlapsActiveReservation(state, resourceId, input.startsAt, input.endsAt)) {
      return {
        ok: false,
        error: conflictError(
          `El recurso ${resourceId} ya tiene una reserva activa que se solapa con este rango (conflicto de agenda).`,
        ),
      };
    }
  }

  const appointment: AppointmentRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    branchId: input.branchId ?? kase.branchId,
    caseId: kase.id,
    status: "tentative",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    purpose: input.purpose ?? null,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
    updatedAt: ctx.now.toISOString(),
    cancelledAt: null,
    cancelledReason: null,
    arrivedAt: null,
    completedAt: null,
  };

  const reservations: ResourceReservationRow[] = input.resourceIds.map((resourceId) => ({
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    resourceId,
    appointmentId: appointment.id,
    status: "active",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    expiresAt: null,
    idempotencyKey: ctx.idempotencyKey,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
    releasedAt: null,
    releasedReason: null,
  }));

  const appointmentResources: AppointmentResourceRow[] = input.resourceIds.map((resourceId) => ({
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    appointmentId: appointment.id,
    resourceId,
    createdAt: ctx.now.toISOString(),
  }));

  const assignmentEvents: AssignmentEventRow[] = input.resourceIds.map((resourceId) => ({
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    appointmentId: appointment.id,
    resourceId,
    eventType: "resource_added",
    details: { startsAt: input.startsAt, endsAt: input.endsAt },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  }));

  const output: ScheduleAppointmentOutput = { appointment, reservations };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_SCHEDULE_APPOINTMENT,
    "Cita agendada sin colisión",
    {
      caseId: kase.id,
      appointmentId: appointment.id,
      resourceIds: input.resourceIds,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    appointments: [...state.appointments, appointment],
    resourceReservations: [...state.resourceReservations, ...reservations],
    appointmentResources: [...state.appointmentResources, ...appointmentResources],
    assignmentEvents: [...state.assignmentEvents, ...assignmentEvents],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_SCHEDULE_APPOINTMENT, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

// --- ConfirmAppointment ---------------------------------------------------------

export interface ConfirmAppointmentInput {
  appointmentId: string;
}

const COMMAND_CONFIRM_APPOINTMENT = "ConfirmAppointment";

export function confirmAppointment(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: ConfirmAppointmentInput,
): CommandOutcome<AppointmentRow> {
  const replay = findIdempotentReplay<AppointmentRow>(state, ctx, COMMAND_CONFIRM_APPOINTMENT);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, AGENDA_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const appointment = state.appointments.find(
    (a) => a.id === input.appointmentId && a.organizationId === ctx.organizationId,
  );
  if (!appointment) return { ok: false, error: notFoundError() };
  if (appointment.status !== "tentative") {
    return {
      ok: false,
      error: conflictError(
        `Solo una cita 'tentative' puede confirmarse (estado actual: ${appointment.status}).`,
      ),
    };
  }

  const updated: AppointmentRow = {
    ...appointment,
    status: "confirmed",
    updatedAt: ctx.now.toISOString(),
  };

  const event: AssignmentEventRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    appointmentId: appointment.id,
    resourceId: null,
    eventType: "status_changed",
    details: { from: appointment.status, to: "confirmed" },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_CONFIRM_APPOINTMENT, "Cita confirmada", {
    appointmentId: appointment.id,
  });

  const nextState: CrmVehicleState = {
    ...state,
    appointments: state.appointments.map((a) => (a.id === appointment.id ? updated : a)),
    assignmentEvents: [...state.assignmentEvents, event],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CONFIRM_APPOINTMENT, updated),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: updated, replayed: false };
}

// --- CancelAppointment -----------------------------------------------------------

export interface CancelAppointmentInput {
  appointmentId: string;
  reason: string;
}

const COMMAND_CANCEL_APPOINTMENT = "CancelAppointment";

export function cancelAppointment(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CancelAppointmentInput,
): CommandOutcome<AppointmentRow> {
  const replay = findIdempotentReplay<AppointmentRow>(state, ctx, COMMAND_CANCEL_APPOINTMENT);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, AGENDA_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const appointment = state.appointments.find(
    (a) => a.id === input.appointmentId && a.organizationId === ctx.organizationId,
  );
  if (!appointment) return { ok: false, error: notFoundError() };
  if (appointment.status === "cancelled" || appointment.status === "completed") {
    return {
      ok: false,
      error: conflictError(`No se puede cancelar una cita en estado '${appointment.status}'.`),
    };
  }
  if (!NON_EMPTY(input.reason)) {
    return { ok: false, error: validationError("reason es obligatorio.", "reason") };
  }

  const updated: AppointmentRow = {
    ...appointment,
    status: "cancelled",
    cancelledAt: ctx.now.toISOString(),
    cancelledReason: input.reason.trim(),
    updatedAt: ctx.now.toISOString(),
  };

  // Releasing every non-released reservation tied to this appointment is
  // what frees the resource for a later reservation on the same range
  // (sección 8.2 R0-A: "cancelar libera la reserva mediante transición").
  const releasedReservations = state.resourceReservations.map((r) =>
    r.appointmentId === appointment.id && r.status !== "released"
      ? {
          ...r,
          status: "released" as const,
          releasedAt: ctx.now.toISOString(),
          releasedReason: "appointment_cancelled",
        }
      : r,
  );

  const event: AssignmentEventRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    appointmentId: appointment.id,
    resourceId: null,
    eventType: "status_changed",
    details: { from: appointment.status, to: "cancelled", reason: input.reason },
    actorId: ctx.actorId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CANCEL_APPOINTMENT,
    "Cita cancelada; reservas liberadas",
    {
      appointmentId: appointment.id,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    appointments: state.appointments.map((a) => (a.id === appointment.id ? updated : a)),
    resourceReservations: releasedReservations,
    assignmentEvents: [...state.assignmentEvents, event],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CANCEL_APPOINTMENT, updated),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: updated, replayed: false };
}

// --- ReceiveVehicle ----------------------------------------------------------
// One of the three named commands that call `resolveCaseTransition`
// internally (see file header) — requires the case to currently be
// `scheduled`. Registers arrival + odometer, but never marks work started
// (sección 8: "no marca trabajo iniciado").

export interface ReceiveVehicleInput {
  caseId: string;
  appointmentId?: string | null;
  odometer: {
    value: number;
    unit: "km" | "mi";
    recordedAt: string;
    provenance: Provenance;
  };
}

export interface ReceiveVehicleOutput {
  case: CaseRow;
  odometerEvent: VehicleOdometerEventRow;
}

const COMMAND_RECEIVE_VEHICLE = "ReceiveVehicle";

export function receiveVehicle(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: ReceiveVehicleInput,
): CommandOutcome<ReceiveVehicleOutput> {
  const replay = findIdempotentReplay<ReceiveVehicleOutput>(state, ctx, COMMAND_RECEIVE_VEHICLE);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, AGENDA_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const kase = state.cases.find(
    (c) => c.id === input.caseId && c.organizationId === ctx.organizationId,
  );
  if (!kase) return { ok: false, error: notFoundError() };

  const check = resolveCaseTransition(kase.status, "received");
  if (!check.ok) {
    return {
      ok: false,
      error: conflictError(check.reason ?? "El caso no puede recibirse en este estado."),
    };
  }

  let appointment: AppointmentRow | undefined;
  if (input.appointmentId) {
    appointment = state.appointments.find(
      (a) =>
        a.id === input.appointmentId &&
        a.organizationId === ctx.organizationId &&
        a.caseId === kase.id,
    );
    if (!appointment) return { ok: false, error: notFoundError() };
  }

  if (!Number.isInteger(input.odometer.value) || input.odometer.value < 0) {
    return {
      ok: false,
      error: validationError(
        "El valor de odómetro debe ser entero y no negativo.",
        "odometer.value",
      ),
    };
  }
  if (Number.isNaN(new Date(input.odometer.recordedAt).getTime())) {
    return {
      ok: false,
      error: validationError(
        "odometer.recordedAt debe ser una fecha válida.",
        "odometer.recordedAt",
      ),
    };
  }

  const valueKm = odometerValueInKm({ value: input.odometer.value, unit: input.odometer.unit });
  const previous = state.vehicleOdometerEvents
    .filter((e) => e.vehicleId === kase.vehicleId && e.status === "accepted")
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];
  const evaluation = evaluateOdometerReading(
    previous ? { valueKm: previous.valueKm, recordedAt: previous.recordedAt } : null,
    { valueKm, recordedAt: input.odometer.recordedAt },
  );

  const odometerEvent: VehicleOdometerEventRow = {
    id: cryptoRandomId(),
    vehicleId: kase.vehicleId,
    organizationId: ctx.organizationId,
    recordedAt: input.odometer.recordedAt,
    valueKm,
    rawValue: input.odometer.value,
    rawUnit: input.odometer.unit,
    provenance: input.odometer.provenance,
    actorId: ctx.actorId,
    status: evaluation.status,
    conflictReason: evaluation.reason,
    createdAt: ctx.now.toISOString(),
  };

  const updatedCase: CaseRow = { ...kase, status: "received" };
  const statusEvent = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    caseId: kase.id,
    fromStatus: kase.status,
    toStatus: "received" as const,
    reason: "Vehículo recibido",
    actorId: ctx.actorId,
    correlationId: ctx.correlationId,
    occurredAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
  };

  const updatedAppointment = appointment
    ? {
        ...appointment,
        status: "arrived" as const,
        arrivedAt: ctx.now.toISOString(),
        updatedAt: ctx.now.toISOString(),
      }
    : null;

  const output: ReceiveVehicleOutput = { case: updatedCase, odometerEvent };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_RECEIVE_VEHICLE,
    "Vehículo recibido y odómetro registrado",
    {
      caseId: kase.id,
      odometerEventId: odometerEvent.id,
      odometerStatus: odometerEvent.status,
    },
  );

  const nextState: CrmVehicleState = {
    ...state,
    cases: state.cases.map((c) => (c.id === kase.id ? updatedCase : c)),
    caseStatusEvents: [...state.caseStatusEvents, statusEvent],
    vehicleOdometerEvents: [...state.vehicleOdometerEvents, odometerEvent],
    appointments: updatedAppointment
      ? state.appointments.map((a) => (a.id === updatedAppointment.id ? updatedAppointment : a))
      : state.appointments,
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_RECEIVE_VEHICLE, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}
