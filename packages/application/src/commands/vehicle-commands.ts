// Vehicle commands — DATATEK_R0_D sección 5.
//
// `RegisterVehicle`, `CreateVehicleOwnershipClaim`, `RecordOdometerEvent`.
// See `state.ts` for why `vehicles`/`vehicle_identifiers` are NOT
// organization-scoped while everything else in this file is.
import { evaluateOdometerReading, odometerValueInKm, type Provenance } from "@datatek/domain";
import {
  requirePermission,
  validationError,
  notFoundError,
  type CommandContext,
} from "./context.ts";
import {
  appendAuditEvent,
  appendIdempotencyRecord,
  cryptoRandomId,
  findIdempotentReplay,
  type CommandOutcome,
  type CrmVehicleState,
  type VehicleRow,
  type VehicleIdentifierRow,
  type VehicleOwnershipClaimRow,
  type VehicleOwnershipClaimKind,
  type VehicleAccessGrantRow,
  type VehicleOdometerEventRow,
} from "./state.ts";
import { normalizeVin, normalizePlate, validateVin, validatePlate } from "./normalize.ts";

// --- RegisterVehicle -------------------------------------------------------

export interface RegisterVehicleInput {
  vin?: string;
  plate?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  /** Local customer (same org) this registration is performed on behalf
   * of. Optional: staff may register a vehicle before a customer is
   * attached to it. When present, a provisional ownership claim is created
   * in the same step (sección 5, step 5). */
  customerId?: string;
}

/** Never exposes WHICH org/customer originally created the matched vehicle
 * — only whether THIS registration reused an existing global vehicle row
 * or created a new one. The caller already has a legitimate, freshly
 * granted access row for `vehicleId` either way (sección 5, step 6: "concede
 * solo el acceso necesario"). This flag is for internal/ops use (tests,
 * audit) — product copy must never render it as "ese VIN ya existía". */
export interface RegisterVehicleOutput {
  vehicleId: string;
  linkedToExistingVehicle: boolean;
  accessGrantId: string;
  ownershipClaimId: string | null;
}

const COMMAND_REGISTER_VEHICLE = "RegisterVehicle";

export function registerVehicle(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RegisterVehicleInput,
): CommandOutcome<RegisterVehicleOutput> {
  const replay = findIdempotentReplay<RegisterVehicleOutput>(state, ctx, COMMAND_REGISTER_VEHICLE);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  // Step: normaliza identificadores.
  const permError = requirePermission(ctx, "vehicle.manage");
  if (permError) return { ok: false, error: permError };

  if (!input.vin && !input.plate) {
    return {
      ok: false,
      error: validationError("Se requiere al menos VIN o placa para registrar un vehículo.", "vin"),
    };
  }

  let normalizedVin: string | null = null;
  if (input.vin) {
    const vinError = validateVin(input.vin);
    if (vinError) return { ok: false, error: vinError };
    normalizedVin = normalizeVin(input.vin);
  }

  let normalizedPlate: string | null = null;
  if (input.plate) {
    const plateError = validatePlate(input.plate);
    if (plateError) return { ok: false, error: plateError };
    normalizedPlate = normalizePlate(input.plate);
  }

  if (input.customerId) {
    const customer = state.customers.find(
      (c) => c.id === input.customerId && c.organizationId === ctx.organizationId,
    );
    if (!customer) return { ok: false, error: notFoundError() };
  }

  // Step: busca de forma privada; no revela coincidencias. The search
  // happens across every organization's identifiers — this is the "private"
  // part: no separate lookup endpoint exists that could be probed with a
  // VIN/plate to learn whether it exists. The ONLY effect a match has is
  // which branch below executes; the returned shape is identical either way.
  const matchedIdentifier = state.vehicleIdentifiers.find(
    (row) =>
      (normalizedVin != null &&
        row.identifierType === "vin" &&
        row.normalizedValue === normalizedVin) ||
      (normalizedPlate != null &&
        row.identifierType === "plate" &&
        row.normalizedValue === normalizedPlate),
  );

  let vehicle: VehicleRow;
  const newIdentifiers: VehicleIdentifierRow[] = [];
  const linkedToExistingVehicle = matchedIdentifier != null;

  if (matchedIdentifier) {
    // Step: crea vehículo o solicitud de vínculo -> vínculo. A match never
    // confirms ownership (sección 5 "una coincidencia no confirma
    // propietario") and never merges/overwrites the existing vehicle row —
    // it only becomes the target of a new access grant below. If this
    // registration supplied an identifier the matched vehicle does not have
    // yet (e.g. plate changed hands), record it as an additional
    // identifier rather than silently dropping it — never overwriting an
    // existing identifier row.
    const existing = state.vehicles.find((v) => v.id === matchedIdentifier.vehicleId);
    if (!existing) {
      // Data integrity guard: an identifier row must always resolve to a
      // vehicle row. Treated as NOT_FOUND (never leaks internal state).
      return { ok: false, error: notFoundError() };
    }
    vehicle = existing;

    const hasVin =
      normalizedVin != null &&
      state.vehicleIdentifiers.some(
        (row) => row.vehicleId === vehicle.id && row.identifierType === "vin",
      );
    const hasPlate =
      normalizedPlate != null &&
      state.vehicleIdentifiers.some(
        (row) =>
          row.vehicleId === vehicle.id &&
          row.identifierType === "plate" &&
          row.normalizedValue === normalizedPlate,
      );
    if (normalizedVin != null && !hasVin) {
      newIdentifiers.push(
        buildIdentifierRow(vehicle.id, "vin", normalizedVin, input.vin ?? "", ctx),
      );
    }
    if (normalizedPlate != null && !hasPlate) {
      newIdentifiers.push(
        buildIdentifierRow(vehicle.id, "plate", normalizedPlate, input.plate ?? "", ctx),
      );
    }
  } else {
    // Step: crea vehículo.
    vehicle = {
      id: cryptoRandomId(),
      primaryVin: normalizedVin,
      primaryPlate: normalizedPlate,
      make: input.make ?? null,
      model: input.model ?? null,
      year: input.year ?? null,
      color: input.color ?? null,
      createdAt: ctx.now.toISOString(),
      createdBy: ctx.actorId,
    };
    if (normalizedVin) {
      newIdentifiers.push(
        buildIdentifierRow(vehicle.id, "vin", normalizedVin, input.vin ?? "", ctx),
      );
    }
    if (normalizedPlate) {
      newIdentifiers.push(
        buildIdentifierRow(vehicle.id, "plate", normalizedPlate, input.plate ?? "", ctx),
      );
    }
  }

  // Step: concede solo el acceso necesario.
  const accessGrant: VehicleAccessGrantRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    vehicleId: vehicle.id,
    grantedToCustomerId: input.customerId ?? null,
    scope: "read_own_case",
    source: "registration",
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
    revokedAt: null,
  };

  // Step: crea claim provisional local (only when a customer was supplied).
  let ownershipClaim: VehicleOwnershipClaimRow | null = null;
  if (input.customerId) {
    ownershipClaim = buildOwnershipClaimRow(input.customerId, vehicle.id, "self_reported", ctx);
  }

  const output: RegisterVehicleOutput = {
    vehicleId: vehicle.id,
    linkedToExistingVehicle,
    accessGrantId: accessGrant.id,
    ownershipClaimId: ownershipClaim?.id ?? null,
  };

  // Step: audita.
  const auditEvent = appendAuditEvent(ctx, COMMAND_REGISTER_VEHICLE, "Vehículo registrado", {
    vehicleId: vehicle.id,
    linkedToExistingVehicle,
    accessGrantId: accessGrant.id,
    ownershipClaimId: ownershipClaim?.id ?? null,
  });

  const nextState: CrmVehicleState = {
    ...state,
    vehicles: linkedToExistingVehicle ? state.vehicles : [...state.vehicles, vehicle],
    vehicleIdentifiers: [...state.vehicleIdentifiers, ...newIdentifiers],
    vehicleAccessGrants: [...state.vehicleAccessGrants, accessGrant],
    vehicleOwnershipClaims: ownershipClaim
      ? [...state.vehicleOwnershipClaims, ownershipClaim]
      : state.vehicleOwnershipClaims,
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_REGISTER_VEHICLE, output),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: output, replayed: false };
}

function buildIdentifierRow(
  vehicleId: string,
  identifierType: "vin" | "plate",
  normalizedValue: string,
  rawValue: string,
  ctx: CommandContext,
): VehicleIdentifierRow {
  return {
    id: cryptoRandomId(),
    vehicleId,
    identifierType,
    normalizedValue,
    rawValue: rawValue.trim(),
    recordedByOrganizationId: ctx.organizationId,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };
}

function buildOwnershipClaimRow(
  customerId: string,
  vehicleId: string,
  claimKind: VehicleOwnershipClaimKind,
  ctx: CommandContext,
): VehicleOwnershipClaimRow {
  return {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    customerId,
    vehicleId,
    claimKind,
    // A claim is never ownership: sección 5 "ownership claim no es
    // ownership verificado". Verifying it (-> `vehicle_ownerships`) is a
    // separate, later flow, not part of R0-D Fase 1.
    status: "provisional",
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };
}

// --- CreateVehicleOwnershipClaim -------------------------------------------

export interface CreateVehicleOwnershipClaimInput {
  customerId: string;
  vehicleId: string;
  claimKind: VehicleOwnershipClaimKind;
}

const COMMAND_CREATE_OWNERSHIP_CLAIM = "CreateVehicleOwnershipClaim";

export function createVehicleOwnershipClaim(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateVehicleOwnershipClaimInput,
): CommandOutcome<VehicleOwnershipClaimRow> {
  const replay = findIdempotentReplay<VehicleOwnershipClaimRow>(
    state,
    ctx,
    COMMAND_CREATE_OWNERSHIP_CLAIM,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, "vehicle.manage");
  if (permError) return { ok: false, error: permError };

  const customer = state.customers.find(
    (c) => c.id === input.customerId && c.organizationId === ctx.organizationId,
  );
  if (!customer) return { ok: false, error: notFoundError() };

  // A claim may only be created on a vehicle this organization already has
  // an access grant for (created by `RegisterVehicle`, or a future manual
  // grant). This is what keeps "VIN/placa no otorgan lectura" true even for
  // this command: knowing a bare `vehicleId` UUID is not enough — the same
  // neutral not-found response covers "vehicle does not exist" and "exists
  // but this org has no access to it".
  const hasAccess = state.vehicleAccessGrants.some(
    (g) =>
      g.vehicleId === input.vehicleId &&
      g.organizationId === ctx.organizationId &&
      g.revokedAt === null,
  );
  if (!hasAccess) return { ok: false, error: notFoundError() };

  const claim = buildOwnershipClaimRow(input.customerId, input.vehicleId, input.claimKind, ctx);

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CREATE_OWNERSHIP_CLAIM,
    "Claim de propiedad provisional creado",
    { customerId: customer.id, vehicleId: input.vehicleId, claimId: claim.id },
  );

  const nextState: CrmVehicleState = {
    ...state,
    vehicleOwnershipClaims: [...state.vehicleOwnershipClaims, claim],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_OWNERSHIP_CLAIM, claim),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: claim, replayed: false };
}

// --- RecordOdometerEvent ----------------------------------------------------

export interface RecordOdometerEventInput {
  vehicleId: string;
  value: number;
  unit: "km" | "mi";
  recordedAt: string;
  provenance: Provenance;
}

const COMMAND_RECORD_ODOMETER = "RecordOdometerEvent";

export function recordOdometerEvent(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RecordOdometerEventInput,
): CommandOutcome<VehicleOdometerEventRow> {
  const replay = findIdempotentReplay<VehicleOdometerEventRow>(state, ctx, COMMAND_RECORD_ODOMETER);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, "vehicle.manage");
  if (permError) return { ok: false, error: permError };

  const hasAccess = state.vehicleAccessGrants.some(
    (g) =>
      g.vehicleId === input.vehicleId &&
      g.organizationId === ctx.organizationId &&
      g.revokedAt === null,
  );
  if (!hasAccess) return { ok: false, error: notFoundError() };

  if (!Number.isInteger(input.value) || input.value < 0) {
    return {
      ok: false,
      error: validationError("El valor de odómetro debe ser entero y no negativo.", "value"),
    };
  }
  if (Number.isNaN(new Date(input.recordedAt).getTime())) {
    return {
      ok: false,
      error: validationError("recordedAt debe ser una fecha válida.", "recordedAt"),
    };
  }

  const valueKm = odometerValueInKm({ value: input.value, unit: input.unit });

  // Odometer facts belong to the physical vehicle, not to one
  // organization's slice of it — so the "previous" reading used for
  // conflict detection is the latest ACCEPTED event across every org that
  // has ever recorded one for this vehicle (sección 5: "odómetro guarda
  // valor, unidad, procedencia, actor y fecha").
  const previous = state.vehicleOdometerEvents
    .filter((e) => e.vehicleId === input.vehicleId && e.status === "accepted")
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];

  const evaluation = evaluateOdometerReading(
    previous ? { valueKm: previous.valueKm, recordedAt: previous.recordedAt } : null,
    { valueKm, recordedAt: input.recordedAt },
  );

  const event: VehicleOdometerEventRow = {
    id: cryptoRandomId(),
    vehicleId: input.vehicleId,
    organizationId: ctx.organizationId,
    recordedAt: input.recordedAt,
    valueKm,
    rawValue: input.value,
    rawUnit: input.unit,
    provenance: input.provenance,
    actorId: ctx.actorId,
    status: evaluation.status,
    conflictReason: evaluation.reason,
    createdAt: ctx.now.toISOString(),
  };

  // Append-only, always — a conflict is recorded as its own row, never
  // rejected outright and never used to overwrite `previous` (sección 5:
  // "no sobrescritura").
  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_RECORD_ODOMETER,
    evaluation.status === "conflict"
      ? `Lectura de odómetro registrada en conflicto (${evaluation.reason})`
      : "Lectura de odómetro registrada",
    { vehicleId: input.vehicleId, eventId: event.id, status: event.status },
  );

  const nextState: CrmVehicleState = {
    ...state,
    vehicleOdometerEvents: [...state.vehicleOdometerEvents, event],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_RECORD_ODOMETER, event),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: event, replayed: false };
}
