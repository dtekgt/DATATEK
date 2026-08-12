// Un cargador por comando (+ uno para `openCaseFromRequest`). Cada uno
// carga, vía `pg`, exactamente las filas que la función pura de ese
// comando necesita para correr sin tocar Postgres — nada más. El resto de
// los 20 arrays de `CrmVehicleState` quedan `[]`. Esto NO es una
// optimización prematura: `registerVehicle` busca `vehicleIdentifiers`
// SIN filtro de organización a propósito (la búsqueda de VIN/placa es
// global, ver vehicle-commands.ts) — cargar todo el estado organización
// por organización rompería silenciosamente ese comportamiento.
//
// Cada loader también carga el registro de idempotencia candidato para su
// propia clave — sin esto, `findIdempotentReplay` dentro de la función
// pura nunca vería un reintento real, porque el slice llegaría siempre
// vacío en ese array.
import type pg from "pg";
import {
  createEmptyState,
  type CrmVehicleState,
  type CommandContext,
  type IdempotencyRecord,
} from "@datatek/application/commands";
import type {
  AddCustomerContactInput,
  LinkCustomerAuthIdentityInput,
  RegisterVehicleInput,
  CreateVehicleOwnershipClaimInput,
  RecordOdometerEventInput,
  CreateManualIntakeInput,
  AppendIntakeEntryInput,
  InterpretReportedSymptomInput,
  CreateCaseFromIntakeInput,
  AssignCaseParticipantInput,
  TransitionCaseInput,
  AddCaseNoteInput,
  OpenCaseFromRequestInput,
} from "@datatek/application/commands";
import { normalizeVin, normalizePlate } from "@datatek/application/commands";

// --- helpers compartidos ---------------------------------------------------

async function loadIdempotency(
  client: pg.PoolClient,
  organizationId: string,
  commandName: string,
  keys: string[],
): Promise<IdempotencyRecord[]> {
  const { rows } = await client.query(
    `select command_name, key, result_summary, input_hash, created_at
       from idempotency_keys
      where organization_id = $1 and command_name = $2 and key = any($3::text[])`,
    [organizationId, commandName, keys],
  );
  return rows.map((row) => ({
    key: row.key as string,
    organizationId,
    commandName: row.command_name as string,
    resultSummary: row.result_summary,
    inputHash: row.input_hash ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

async function loadCustomerById(
  client: pg.PoolClient,
  organizationId: string,
  customerId: string,
): Promise<CrmVehicleState["customers"]> {
  const { rows } = await client.query(
    `select id, organization_id, display_name, customer_type, status, source, created_at, effective_at, created_by
       from customers where id = $1 and organization_id = $2`,
    [customerId, organizationId],
  );
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    displayName: r.display_name,
    customerType: r.customer_type,
    status: r.status,
    source: r.source,
    createdAt: r.created_at.toISOString(),
    effectiveAt: r.effective_at.toISOString(),
    createdBy: r.created_by,
  }));
}

async function loadVehiclesByIds(
  client: pg.PoolClient,
  vehicleIds: string[],
): Promise<CrmVehicleState["vehicles"]> {
  if (vehicleIds.length === 0) return [];
  const { rows } = await client.query(
    `select id, primary_vin, primary_plate, make, model, year, color, created_at, created_by
       from vehicles where id = any($1::uuid[])`,
    [vehicleIds],
  );
  return rows.map((r) => ({
    id: r.id,
    primaryVin: r.primary_vin,
    primaryPlate: r.primary_plate,
    make: r.make,
    model: r.model,
    year: r.year,
    color: r.color,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  }));
}

/** Búsqueda GLOBAL por VIN/placa normalizados — nunca filtrada por
 * organización (vehicle-commands.ts: "busca de forma privada... across
 * every organization's identifiers"). Devuelve los identificadores
 * encontrados y los vehículos a los que apuntan. */
async function loadVehicleIdentifierCandidates(
  client: pg.PoolClient,
  normalizedValues: string[],
): Promise<{
  identifiers: CrmVehicleState["vehicleIdentifiers"];
  vehicles: CrmVehicleState["vehicles"];
}> {
  const values = normalizedValues.filter((v): v is string => v != null);
  if (values.length === 0) return { identifiers: [], vehicles: [] };
  const { rows } = await client.query(
    `select id, vehicle_id, identifier_type, normalized_value, raw_value, recorded_by_organization_id, created_at, created_by
       from vehicle_identifiers where normalized_value = any($1::text[])`,
    [values],
  );
  const identifiers: CrmVehicleState["vehicleIdentifiers"] = rows.map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    identifierType: r.identifier_type,
    normalizedValue: r.normalized_value,
    rawValue: r.raw_value,
    recordedByOrganizationId: r.recorded_by_organization_id,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  }));
  const vehicles = await loadVehiclesByIds(
    client,
    Array.from(new Set(identifiers.map((i) => i.vehicleId))),
  );
  return { identifiers, vehicles };
}

async function loadVehicleAccessGrants(
  client: pg.PoolClient,
  organizationId: string,
  vehicleId: string,
): Promise<CrmVehicleState["vehicleAccessGrants"]> {
  const { rows } = await client.query(
    `select id, organization_id, vehicle_id, granted_to_customer_id, scope, source, created_at, created_by, revoked_at
       from vehicle_access_grants where organization_id = $1 and vehicle_id = $2`,
    [organizationId, vehicleId],
  );
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    vehicleId: r.vehicle_id,
    grantedToCustomerId: r.granted_to_customer_id,
    scope: r.scope,
    source: r.source,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
    revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
  }));
}

async function loadCaseById(
  client: pg.PoolClient,
  organizationId: string,
  caseId: string,
): Promise<CrmVehicleState["cases"]> {
  const { rows } = await client.query(
    `select id, organization_id, branch_id, folio_number, folio_code, customer_id, vehicle_id, status,
            source_intake_thread_id, opened_at, closed_at, created_at, created_by
       from cases where id = $1 and organization_id = $2`,
    [caseId, organizationId],
  );
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    branchId: r.branch_id,
    folioNumber: Number(r.folio_number),
    folioCode: r.folio_code,
    customerId: r.customer_id,
    vehicleId: r.vehicle_id,
    status: r.status,
    sourceIntakeThreadId: r.source_intake_thread_id,
    openedAt: r.opened_at.toISOString(),
    closedAt: r.closed_at ? r.closed_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  }));
}

/** `for update` — sin esto, dos transacciones concurrentes para la misma
 * organización pueden hacer el mismo SELECT antes de que cualquiera haga
 * COMMIT, calcular el mismo `nextValue` en `consumeOrganizationCounter`, y
 * la segunda `INSERT INTO cases` termina en `23505 duplicate key` sobre
 * `cases_organization_id_folio_number_key`. El lock de fila hace que la
 * segunda transacción bloquee aquí hasta que la primera haga commit/rollback,
 * y entonces relea el valor ya avanzado — igual que un `SELECT ... FOR
 * UPDATE` clásico de "lee para incrementar". Solo esta tabla lo necesita:
 * es la única en Puerta A donde el valor de una fila nueva depende de leer
 * e incrementar una fila existente bajo escritores concurrentes.
 */
async function loadOrganizationCounter(
  client: pg.PoolClient,
  organizationId: string,
  counterKey: string,
): Promise<CrmVehicleState["organizationCounters"]> {
  const { rows } = await client.query(
    `select organization_id, counter_key, next_value
       from organization_counters where organization_id = $1 and counter_key = $2
       for update`,
    [organizationId, counterKey],
  );
  return rows.map((r) => ({
    organizationId: r.organization_id,
    counterKey: r.counter_key,
    nextValue: Number(r.next_value),
  }));
}

// --- CRM ---------------------------------------------------------------

export async function loadCreateProvisionalCustomerSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
): Promise<CrmVehicleState> {
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "CreateProvisionalCustomer",
    [ctx.idempotencyKey],
  );
  return { ...createEmptyState(), idempotencyRecords };
}

export async function loadAddCustomerContactSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: AddCustomerContactInput,
): Promise<CrmVehicleState> {
  // Un `pg.PoolClient` es una sola conexión — nunca `Promise.all` sobre el
  // mismo `client`, siempre secuencial (node-postgres no soporta pipelining
  // de queries en una conexión).
  const customers = await loadCustomerById(client, ctx.organizationId, input.customerId);
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "AddCustomerContact",
    [ctx.idempotencyKey],
  );
  return { ...createEmptyState(), customers, idempotencyRecords };
}

export async function loadLinkCustomerAuthIdentitySlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: LinkCustomerAuthIdentityInput,
): Promise<CrmVehicleState> {
  const customers = await loadCustomerById(client, ctx.organizationId, input.customerId);
  const authLinksRes = await client.query(
    `select id, organization_id, customer_id, user_id, status, verification_method, verified_at, created_at, created_by, revoked_at
       from customer_auth_links where organization_id = $1 and user_id = $2 and status = 'verified'`,
    [ctx.organizationId, input.userId],
  );
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "LinkCustomerAuthIdentity",
    [ctx.idempotencyKey],
  );
  const customerAuthLinks: CrmVehicleState["customerAuthLinks"] = authLinksRes.rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    customerId: r.customer_id,
    userId: r.user_id,
    status: r.status,
    verificationMethod: r.verification_method,
    verifiedAt: r.verified_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
    revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
  }));
  return { ...createEmptyState(), customers, customerAuthLinks, idempotencyRecords };
}

// --- Vehicle -------------------------------------------------------------

export async function loadRegisterVehicleSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: RegisterVehicleInput,
): Promise<CrmVehicleState> {
  const candidates = [
    input.vin ? normalizeVin(input.vin) : null,
    input.plate ? normalizePlate(input.plate) : null,
  ].filter((v): v is string => v != null);

  const { identifiers, vehicles } = await loadVehicleIdentifierCandidates(client, candidates);
  const customers = input.customerId
    ? await loadCustomerById(client, ctx.organizationId, input.customerId)
    : [];
  const idempotencyRecords = await loadIdempotency(client, ctx.organizationId, "RegisterVehicle", [
    ctx.idempotencyKey,
  ]);

  return {
    ...createEmptyState(),
    vehicles,
    vehicleIdentifiers: identifiers,
    customers,
    idempotencyRecords,
  };
}

export async function loadCreateVehicleOwnershipClaimSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: CreateVehicleOwnershipClaimInput,
): Promise<CrmVehicleState> {
  const customers = await loadCustomerById(client, ctx.organizationId, input.customerId);
  const vehicleAccessGrants = await loadVehicleAccessGrants(
    client,
    ctx.organizationId,
    input.vehicleId,
  );
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "CreateVehicleOwnershipClaim",
    [ctx.idempotencyKey],
  );
  return { ...createEmptyState(), customers, vehicleAccessGrants, idempotencyRecords };
}

export async function loadRecordOdometerEventSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: RecordOdometerEventInput,
): Promise<CrmVehicleState> {
  const vehicleAccessGrants = await loadVehicleAccessGrants(
    client,
    ctx.organizationId,
    input.vehicleId,
  );
  // Global al vehículo físico, no a la organización — mismo criterio que
  // vehicle-commands.ts ("el odómetro guarda... sin importar qué
  // organización la registró").
  const eventsRes = await client.query(
    `select id, vehicle_id, organization_id, recorded_at, value_km, raw_value, raw_unit, provenance,
            actor_id, status, conflict_reason, created_at
       from vehicle_odometer_events where vehicle_id = $1 and status = 'accepted'`,
    [input.vehicleId],
  );
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "RecordOdometerEvent",
    [ctx.idempotencyKey],
  );
  const vehicleOdometerEvents: CrmVehicleState["vehicleOdometerEvents"] = eventsRes.rows.map(
    (r) => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      organizationId: r.organization_id,
      recordedAt: r.recorded_at.toISOString(),
      valueKm: Number(r.value_km),
      rawValue: Number(r.raw_value),
      rawUnit: r.raw_unit,
      provenance: r.provenance,
      actorId: r.actor_id,
      status: r.status,
      conflictReason: r.conflict_reason,
      createdAt: r.created_at.toISOString(),
    }),
  );
  return { ...createEmptyState(), vehicleAccessGrants, vehicleOdometerEvents, idempotencyRecords };
}

// --- Intake / Case ---------------------------------------------------------

export async function loadCreateManualIntakeSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: CreateManualIntakeInput,
): Promise<CrmVehicleState> {
  const customers = input.customerId
    ? await loadCustomerById(client, ctx.organizationId, input.customerId)
    : [];
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "CreateManualIntake",
    [ctx.idempotencyKey],
  );
  return { ...createEmptyState(), customers, idempotencyRecords };
}

export async function loadAppendIntakeEntrySlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: AppendIntakeEntryInput,
): Promise<CrmVehicleState> {
  const threadRes = await client.query(
    `select id, organization_id, customer_id, channel, status, correlation_id, created_at, created_by
       from intake_threads where id = $1 and organization_id = $2`,
    [input.threadId, ctx.organizationId],
  );
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "AppendIntakeEntry",
    [ctx.idempotencyKey],
  );
  const intakeThreads: CrmVehicleState["intakeThreads"] = threadRes.rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    customerId: r.customer_id,
    channel: r.channel,
    status: r.status,
    correlationId: r.correlation_id,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  }));
  return { ...createEmptyState(), intakeThreads, idempotencyRecords };
}

export async function loadInterpretReportedSymptomSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: InterpretReportedSymptomInput,
): Promise<CrmVehicleState> {
  const cases = await loadCaseById(client, ctx.organizationId, input.caseId);
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "InterpretReportedSymptom",
    [ctx.idempotencyKey],
  );
  return { ...createEmptyState(), cases, idempotencyRecords };
}

export async function loadCreateCaseFromIntakeSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: CreateCaseFromIntakeInput,
): Promise<CrmVehicleState> {
  const threadRes = await client.query(
    `select id, organization_id, customer_id, channel, status, correlation_id, created_at, created_by
       from intake_threads where id = $1 and organization_id = $2`,
    [input.intakeThreadId, ctx.organizationId],
  );
  const customers = await loadCustomerById(client, ctx.organizationId, input.customerId);
  const vehicleAccessGrants = await loadVehicleAccessGrants(
    client,
    ctx.organizationId,
    input.vehicleId,
  );
  const organizationCounters = await loadOrganizationCounter(
    client,
    ctx.organizationId,
    "case_folio",
  );
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "CreateCaseFromIntake",
    [ctx.idempotencyKey],
  );
  const intakeThreads: CrmVehicleState["intakeThreads"] = threadRes.rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    customerId: r.customer_id,
    channel: r.channel,
    status: r.status,
    correlationId: r.correlation_id,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  }));
  return {
    ...createEmptyState(),
    intakeThreads,
    customers,
    vehicleAccessGrants,
    organizationCounters,
    idempotencyRecords,
  };
}

export async function loadAssignCaseParticipantSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: AssignCaseParticipantInput,
): Promise<CrmVehicleState> {
  const cases = await loadCaseById(client, ctx.organizationId, input.caseId);
  const idempotencyRecords = await loadIdempotency(
    client,
    ctx.organizationId,
    "AssignCaseParticipant",
    [ctx.idempotencyKey],
  );
  return { ...createEmptyState(), cases, idempotencyRecords };
}

export async function loadTransitionCaseSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: TransitionCaseInput,
): Promise<CrmVehicleState> {
  const cases = await loadCaseById(client, ctx.organizationId, input.caseId);
  const idempotencyRecords = await loadIdempotency(client, ctx.organizationId, "TransitionCase", [
    ctx.idempotencyKey,
  ]);
  return { ...createEmptyState(), cases, idempotencyRecords };
}

export async function loadAddCaseNoteSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: AddCaseNoteInput,
): Promise<CrmVehicleState> {
  const cases = await loadCaseById(client, ctx.organizationId, input.caseId);
  const idempotencyRecords = await loadIdempotency(client, ctx.organizationId, "AddCaseNote", [
    ctx.idempotencyKey,
  ]);
  return { ...createEmptyState(), cases, idempotencyRecords };
}

// --- Compuesto: openCaseFromRequest ----------------------------------------
// Unión acotada de lo que sus 6 sub-pasos podrían necesitar, cargada una
// sola vez por adelantado — igual que hoy corre sobre el motor en memoria,
// donde cada sub-paso ve el `nextState` del anterior. Cada sub-paso deriva
// su propia idempotency key (`${key}:customer`, `:contact`, `:vehicle`,
// `:intake`, `:case`, `:symptom` — ver `stepContext` en
// open-case-journey.ts), así que se cargan las 6 candidatas.

export async function loadOpenCaseFromRequestSlice(
  client: pg.PoolClient,
  ctx: CommandContext,
  input: OpenCaseFromRequestInput,
): Promise<CrmVehicleState> {
  const commandNamesToCheck: [string, string][] = [
    ["CreateProvisionalCustomer", `${ctx.idempotencyKey}:customer`],
    ["AddCustomerContact", `${ctx.idempotencyKey}:contact`],
    ["RegisterVehicle", `${ctx.idempotencyKey}:vehicle`],
    ["CreateManualIntake", `${ctx.idempotencyKey}:intake`],
    ["CreateCaseFromIntake", `${ctx.idempotencyKey}:case`],
    ["InterpretReportedSymptom", `${ctx.idempotencyKey}:symptom`],
  ];

  const customersPromise =
    input.customer.kind === "existing"
      ? loadCustomerById(client, ctx.organizationId, input.customer.customerId)
      : Promise.resolve([]);

  const vehicleCandidates =
    input.vehicle.kind === "new"
      ? [
          input.vehicle.vin ? normalizeVin(input.vehicle.vin) : null,
          input.vehicle.plate ? normalizePlate(input.vehicle.plate) : null,
        ].filter((v): v is string => v != null)
      : [];

  const customers = await customersPromise;
  const { identifiers, vehicles: vehiclesFromIdentifiers } = await loadVehicleIdentifierCandidates(
    client,
    vehicleCandidates,
  );
  const vehicleByIdRows =
    input.vehicle.kind === "existing"
      ? await loadVehiclesByIds(client, [input.vehicle.vehicleId])
      : [];
  const organizationCounters = await loadOrganizationCounter(
    client,
    ctx.organizationId,
    "case_folio",
  );
  const idempotencyRecordLists = [];
  for (const [commandName, key] of commandNamesToCheck) {
    idempotencyRecordLists.push(
      await loadIdempotency(client, ctx.organizationId, commandName, [key]),
    );
  }
  const idempotencyRecords = idempotencyRecordLists.flat();

  const vehicleAccessGrants =
    input.vehicle.kind === "existing"
      ? await loadVehicleAccessGrants(client, ctx.organizationId, input.vehicle.vehicleId)
      : [];

  return {
    ...createEmptyState(),
    customers,
    vehicles: [...vehiclesFromIdentifiers, ...vehicleByIdRows],
    vehicleIdentifiers: identifiers,
    vehicleAccessGrants,
    organizationCounters,
    idempotencyRecords,
  };
}
