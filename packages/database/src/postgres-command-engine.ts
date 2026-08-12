// El motor real de Postgres — Puerta A, primer corte (CRM + Vehículo +
// Intake/Caso, 13 comandos + `openCaseFromRequest`). Expone exactamente
// esos 14 métodos, no la interfaz `CommandEngine` completa: los 27
// restantes (agenda, inspección, cotización, autorización, catálogo de
// productos) siguen sin implementación real todavía — `hybrid-command-
// engine.ts` es quien compone este objeto con el motor en memoria
// existente para satisfacer `CommandEngine` completo.
//
// Cada método sigue el mismo patrón: `runCommand` carga un slice acotado
// de `CrmVehicleState` (loaders.ts), corre la función pura SIN CAMBIOS
// (packages/application/src/commands/*.ts), compara antes/después
// (diffState) y escribe solo lo que cambió (writeDiff) — todo dentro de
// una única transacción `pg`.
import type pg from "pg";
import {
  openCaseFromRequest,
  createProvisionalCustomer,
  addCustomerContact,
  linkCustomerAuthIdentity,
  registerVehicle,
  createVehicleOwnershipClaim,
  recordOdometerEvent,
  createManualIntake,
  appendIntakeEntry,
  interpretReportedSymptom,
  createCaseFromIntake,
  assignCaseParticipant,
  transitionCase,
  addCaseNote,
  type CommandContext,
  type CommandOutcome,
  type CommandResult,
  type CrmVehicleState,
} from "@datatek/application/commands";
import { buildTableRegistry } from "./tables.ts";
import { diffState } from "./diff.ts";
import { writeDiff } from "./write.ts";
import * as loaders from "./loaders.ts";

const CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES = {
  createProvisionalCustomer: ["customers", "idempotencyRecords", "auditLog"],
  addCustomerContact: ["customerContacts", "idempotencyRecords", "auditLog"],
  linkCustomerAuthIdentity: ["customerAuthLinks", "customers", "idempotencyRecords", "auditLog"],
  registerVehicle: [
    "vehicles",
    "vehicleIdentifiers",
    "vehicleAccessGrants",
    "vehicleOwnershipClaims",
    "idempotencyRecords",
    "auditLog",
  ],
  createVehicleOwnershipClaim: ["vehicleOwnershipClaims", "idempotencyRecords", "auditLog"],
  recordOdometerEvent: ["vehicleOdometerEvents", "idempotencyRecords", "auditLog"],
  createManualIntake: ["intakeThreads", "intakeEntries", "idempotencyRecords", "auditLog"],
  appendIntakeEntry: ["intakeEntries", "idempotencyRecords", "auditLog"],
  interpretReportedSymptom: ["reportedSymptoms", "idempotencyRecords", "auditLog"],
  createCaseFromIntake: [
    "cases",
    "caseParticipants",
    "serviceRequests",
    "caseStatusEvents",
    "intakeThreads",
    "organizationCounters",
    "idempotencyRecords",
    "auditLog",
  ],
  assignCaseParticipant: ["caseAssignments", "idempotencyRecords", "auditLog"],
  transitionCase: ["cases", "caseStatusEvents", "idempotencyRecords", "auditLog"],
  addCaseNote: ["caseNotes", "idempotencyRecords", "auditLog"],
  openCaseFromRequest: [
    "customers",
    "customerContacts",
    "vehicles",
    "vehicleIdentifiers",
    "vehicleAccessGrants",
    "intakeThreads",
    "intakeEntries",
    "cases",
    "caseParticipants",
    "serviceRequests",
    "caseStatusEvents",
    "reportedSymptoms",
    "organizationCounters",
    "idempotencyRecords",
    "auditLog",
  ],
} as const;

async function runCommand<T, I>(
  pool: pg.Pool,
  loadSlice: (client: pg.PoolClient, ctx: CommandContext, input: I) => Promise<CrmVehicleState>,
  pureFn: (state: CrmVehicleState, ctx: CommandContext, input: I) => CommandOutcome<T>,
  writeTables: readonly (keyof CrmVehicleState)[],
  ctx: CommandContext,
  input: I,
): Promise<CommandResult<T>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const slice = await loadSlice(client, ctx, input);
    const outcome = pureFn(slice, ctx, input);

    if (!outcome.ok) {
      await client.query("rollback");
      return { ok: false, error: outcome.error };
    }

    const registry = buildTableRegistry(ctx.organizationId);
    const diffs = diffState(
      slice,
      outcome.nextState,
      registry,
      writeTables as (keyof CrmVehicleState)[],
    );
    await writeDiff(client, registry, diffs);
    await client.query("commit");
    return { ok: true, data: outcome.data, replayed: outcome.replayed };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Los 14 métodos reales de Puerta A, primer corte. Ver el header del
 * archivo para por qué esto NO implementa `CommandEngine` completo. */
export function createPostgresCommandEngine(pool: pg.Pool) {
  return {
    openCaseFromRequest: (ctx: CommandContext, input: Parameters<typeof openCaseFromRequest>[2]) =>
      runCommand(
        pool,
        loaders.loadOpenCaseFromRequestSlice,
        openCaseFromRequest,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.openCaseFromRequest,
        ctx,
        input,
      ),
    createProvisionalCustomer: (
      ctx: CommandContext,
      input: Parameters<typeof createProvisionalCustomer>[2],
    ) =>
      runCommand(
        pool,
        (client) => loaders.loadCreateProvisionalCustomerSlice(client, ctx),
        createProvisionalCustomer,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.createProvisionalCustomer,
        ctx,
        input,
      ),
    addCustomerContact: (ctx: CommandContext, input: Parameters<typeof addCustomerContact>[2]) =>
      runCommand(
        pool,
        loaders.loadAddCustomerContactSlice,
        addCustomerContact,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.addCustomerContact,
        ctx,
        input,
      ),
    linkCustomerAuthIdentity: (
      ctx: CommandContext,
      input: Parameters<typeof linkCustomerAuthIdentity>[2],
    ) =>
      runCommand(
        pool,
        loaders.loadLinkCustomerAuthIdentitySlice,
        linkCustomerAuthIdentity,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.linkCustomerAuthIdentity,
        ctx,
        input,
      ),
    registerVehicle: (ctx: CommandContext, input: Parameters<typeof registerVehicle>[2]) =>
      runCommand(
        pool,
        loaders.loadRegisterVehicleSlice,
        registerVehicle,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.registerVehicle,
        ctx,
        input,
      ),
    createVehicleOwnershipClaim: (
      ctx: CommandContext,
      input: Parameters<typeof createVehicleOwnershipClaim>[2],
    ) =>
      runCommand(
        pool,
        loaders.loadCreateVehicleOwnershipClaimSlice,
        createVehicleOwnershipClaim,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.createVehicleOwnershipClaim,
        ctx,
        input,
      ),
    recordOdometerEvent: (ctx: CommandContext, input: Parameters<typeof recordOdometerEvent>[2]) =>
      runCommand(
        pool,
        loaders.loadRecordOdometerEventSlice,
        recordOdometerEvent,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.recordOdometerEvent,
        ctx,
        input,
      ),
    createManualIntake: (ctx: CommandContext, input: Parameters<typeof createManualIntake>[2]) =>
      runCommand(
        pool,
        loaders.loadCreateManualIntakeSlice,
        createManualIntake,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.createManualIntake,
        ctx,
        input,
      ),
    appendIntakeEntry: (ctx: CommandContext, input: Parameters<typeof appendIntakeEntry>[2]) =>
      runCommand(
        pool,
        loaders.loadAppendIntakeEntrySlice,
        appendIntakeEntry,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.appendIntakeEntry,
        ctx,
        input,
      ),
    interpretReportedSymptom: (
      ctx: CommandContext,
      input: Parameters<typeof interpretReportedSymptom>[2],
    ) =>
      runCommand(
        pool,
        loaders.loadInterpretReportedSymptomSlice,
        interpretReportedSymptom,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.interpretReportedSymptom,
        ctx,
        input,
      ),
    createCaseFromIntake: (
      ctx: CommandContext,
      input: Parameters<typeof createCaseFromIntake>[2],
    ) =>
      runCommand(
        pool,
        loaders.loadCreateCaseFromIntakeSlice,
        createCaseFromIntake,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.createCaseFromIntake,
        ctx,
        input,
      ),
    assignCaseParticipant: (
      ctx: CommandContext,
      input: Parameters<typeof assignCaseParticipant>[2],
    ) =>
      runCommand(
        pool,
        loaders.loadAssignCaseParticipantSlice,
        assignCaseParticipant,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.assignCaseParticipant,
        ctx,
        input,
      ),
    transitionCase: (ctx: CommandContext, input: Parameters<typeof transitionCase>[2]) =>
      runCommand(
        pool,
        loaders.loadTransitionCaseSlice,
        transitionCase,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.transitionCase,
        ctx,
        input,
      ),
    addCaseNote: (ctx: CommandContext, input: Parameters<typeof addCaseNote>[2]) =>
      runCommand(
        pool,
        loaders.loadAddCaseNoteSlice,
        addCaseNote,
        CRM_VEHICLE_INTAKE_CASE_WRITE_TABLES.addCaseNote,
        ctx,
        input,
      ),
  };
}

export type PostgresCommandEngine = ReturnType<typeof createPostgresCommandEngine>;
