// @datatek/database — Puerta A, primer corte: persistencia real de
// Postgres para CRM + Vehículo + Intake/Caso (ver
// postgres-command-engine.ts, hybrid-command-engine.ts). Todo lo demás
// (agenda, inspección, cotización, autorización, catálogo de productos)
// sigue sin implementación real — `ReadPort`/`notImplementedPort` abajo
// documentan ese resto explícitamente, no en silencio.

/** Generic read port: given an id, return T or null. Implemented against
 * fixtures in R0-B via @datatek/application adapters, never here. */
export interface ReadPort<T> {
  findById(id: string): Promise<T | null>;
}

/** Marker for a port that has no real implementation yet. Calling it throws
 * loudly instead of returning fabricated data. */
export function notImplementedPort(name: string): never {
  throw new Error(
    `[@datatek/database] Port "${name}" has no implementation yet. ` +
      "Puerta A, primer corte, solo cubre CRM/Vehículo/Intake-Caso.",
  );
}

export const DATABASE_PORTS_STATUS = "placeholder" as const;

export { createPostgresPool, redactedHost } from "./pool.ts";
export { withRlsRead } from "./rls-read.ts";
export { buildTableRegistry, type TableSpec } from "./tables.ts";
export { diffState, type TableDiff } from "./diff.ts";
export { writeDiff } from "./write.ts";
export {
  createPostgresCommandEngine,
  type PostgresCommandEngine,
} from "./postgres-command-engine.ts";
export { createHybridCommandEngine, type AsyncCommandEngine } from "./hybrid-command-engine.ts";
export { loadActorTenancySnapshot } from "./tenancy-loader.ts";
export {
  resolveOrganizationBySlug,
  loadOrganizationsByIds,
  loadOrganizationBranches,
  type OrganizationDirectoryEntry,
} from "./organization-directory.ts";
export { loadOrganizationReadState } from "./read-state.ts";
