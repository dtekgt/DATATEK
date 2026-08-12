// Compone el motor real de Postgres (14 métodos: CRM + Vehículo +
// Intake/Caso) con el motor en memoria existente (los 29 restantes:
// agenda, inspección/evidencia, cotización, autorización, catálogo de
// productos) para satisfacer, de forma ASÍNCRONA, todos los comandos que
// `CommandEngine` (motor en memoria de `@datatek/application`) define de
// forma síncrona.
//
// Por qué async y no reusar `CommandEngine` tal cual: una llamada real a
// Postgres nunca puede ser síncrona en JS/TS — envolver eso detrás de una
// interfaz que promete `CommandResult<T>` directo (no `Promise<...>`)
// habría sido una mentira de tipos, y además rompía en runtime a
// `instrumentCommandEngine` (`@datatek/application`, mide duración/loguea
// resultado asumiendo un valor ya resuelto, no una promesa pendiente).
// En vez de tocar `packages/application/src/commands/engine.ts` — que
// tiene sus propias pruebas síncronas y ningún otro consumidor necesita
// async todavía — este archivo define su propio tipo `AsyncCommandEngine`
// derivado de `CommandEngine`, acotado a este paquete.
//
// Instrumentación (logging/métricas) del camino async queda
// EXPLÍCITAMENTE pendiente — no es un descuido: `commands-engine.ts`
// (apps/web) documenta la omisión cuando conecta este motor.
//
// Tabla de delegación escrita a mano, no un proxy/reflection — así
// TypeScript marca en compilación cualquier método de `CommandEngine` que
// se quede sin asignar.
//
// `getState()`/`reset()` delegan al motor en memoria — ver la advertencia
// en el plan de Puerta A: mientras un caller no esté migrado a las query
// functions reales (packages/database/src/queries/*), `getState()` sigue
// sin ver nada de lo que este motor híbrido escribió en Postgres. Migrar
// cada página que llama `getState()` es tarea explícita de la siguiente
// ola de este mismo corte — no un efecto secundario automático.
import type pg from "pg";
import {
  createCommandEngine,
  type CommandContext,
  type CommandEngine,
  type CommandResult,
  type CrmVehicleState,
} from "@datatek/application/commands";
import { createPostgresCommandEngine } from "./postgres-command-engine.ts";

/** Misma interfaz que `CommandEngine`, pero cada comando devuelve
 * `Promise<CommandResult<T>>` en vez de `CommandResult<T>` directo.
 * `getState`/`reset` no calzan el patrón `(ctx, input) => CommandResult`,
 * así que el `extends` los deja pasar sin envolver. */
export type AsyncCommandEngine = {
  [K in keyof CommandEngine]: CommandEngine[K] extends (
    ctx: CommandContext,
    input: infer I,
  ) => CommandResult<infer T>
    ? (ctx: CommandContext, input: I) => Promise<CommandResult<T>>
    : CommandEngine[K];
};

export function createHybridCommandEngine(
  pool: pg.Pool,
  seed: CrmVehicleState,
): AsyncCommandEngine {
  const pg14 = createPostgresCommandEngine(pool);
  const mem = createCommandEngine(seed);

  return {
    getState: () => mem.getState(),
    reset: (nextSeed) => mem.reset(nextSeed),

    // --- 14 reales, Postgres --------------------------------------------
    openCaseFromRequest: pg14.openCaseFromRequest,
    createProvisionalCustomer: pg14.createProvisionalCustomer,
    addCustomerContact: pg14.addCustomerContact,
    linkCustomerAuthIdentity: pg14.linkCustomerAuthIdentity,
    registerVehicle: pg14.registerVehicle,
    createVehicleOwnershipClaim: pg14.createVehicleOwnershipClaim,
    recordOdometerEvent: pg14.recordOdometerEvent,
    createManualIntake: pg14.createManualIntake,
    appendIntakeEntry: pg14.appendIntakeEntry,
    interpretReportedSymptom: pg14.interpretReportedSymptom,
    createCaseFromIntake: pg14.createCaseFromIntake,
    assignCaseParticipant: pg14.assignCaseParticipant,
    transitionCase: pg14.transitionCase,
    addCaseNote: pg14.addCaseNote,

    // --- Resto, en memoria — misma lógica de siempre, solo envuelta en una
    // promesa ya resuelta para calzar `AsyncCommandEngine`. Sin esto,
    // `await hybridEngine.scheduleAppointment(...)` funcionaría igual (JS
    // resuelve un valor no-promesa con `await` sin problema), pero el tipo
    // no reflejaría la realidad del resto de métodos del objeto.
    createTemporaryReservation: async (ctx, input) => mem.createTemporaryReservation(ctx, input),
    scheduleAppointment: async (ctx, input) => mem.scheduleAppointment(ctx, input),
    confirmAppointment: async (ctx, input) => mem.confirmAppointment(ctx, input),
    cancelAppointment: async (ctx, input) => mem.cancelAppointment(ctx, input),
    receiveVehicle: async (ctx, input) => mem.receiveVehicle(ctx, input),

    startInspection: async (ctx, input) => mem.startInspection(ctx, input),
    recordInspectionResult: async (ctx, input) => mem.recordInspectionResult(ctx, input),
    recordMeasurement: async (ctx, input) => mem.recordMeasurement(ctx, input),
    recordFinding: async (ctx, input) => mem.recordFinding(ctx, input),
    createMaintenanceRecommendation: async (ctx, input) =>
      mem.createMaintenanceRecommendation(ctx, input),
    createUploadIntent: async (ctx, input) => mem.createUploadIntent(ctx, input),
    confirmEvidenceUpload: async (ctx, input) => mem.confirmEvidenceUpload(ctx, input),
    linkEvidence: async (ctx, input) => mem.linkEvidence(ctx, input),
    completeInspection: async (ctx, input) => mem.completeInspection(ctx, input),

    createQuote: async (ctx, input) => mem.createQuote(ctx, input),
    createQuoteVersion: async (ctx, input) => mem.createQuoteVersion(ctx, input),
    addQuoteItem: async (ctx, input) => mem.addQuoteItem(ctx, input),
    updateDraftQuoteItem: async (ctx, input) => mem.updateDraftQuoteItem(ctx, input),
    freezeQuoteVersion: async (ctx, input) => mem.freezeQuoteVersion(ctx, input),

    prepareAuthorizationRequest: async (ctx, input) => mem.prepareAuthorizationRequest(ctx, input),
    markAuthorizationRequestSent: async (ctx, input) =>
      mem.markAuthorizationRequestSent(ctx, input),
    verifyAuthorizationAccess: async (ctx, input) => mem.verifyAuthorizationAccess(ctx, input),
    recordAuthorization: async (ctx, input) => mem.recordAuthorization(ctx, input),
    invalidateAuthorization: async (ctx, input) => mem.invalidateAuthorization(ctx, input),
    revokeAndReprepareAuthorizationRequest: async (ctx, input) =>
      mem.revokeAndReprepareAuthorizationRequest(ctx, input),

    registerProduct: async (ctx, input) => mem.registerProduct(ctx, input),
    adjustProductStock: async (ctx, input) => mem.adjustProductStock(ctx, input),
  };
}
