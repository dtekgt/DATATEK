// Server-only command layer — see src/index.ts for why this is not part of
// the main "@datatek/application" barrel (it reaches `node:crypto`, unsafe
// for any client bundle). Only server-side code (the dev command engine and
// its Next.js route handler) should import from
// "@datatek/application/commands".
//
// Root-level placement mirrors packages/domain/quote-snapshot.ts: it lets
// this subpath resolve as a plain file lookup under classic/Node10 module
// resolution (scripts/run-node-tests.mjs's CommonJS test compile), which
// does not read package.json "exports" maps at all. Under "Bundler"
// resolution the "exports" entry in package.json is what actually gets
// consulted — this file is what it points at, so there is exactly one
// source of truth either way.
export * from "./src/commands/context.ts";
export * from "./src/commands/state.ts";
export * from "./src/commands/normalize.ts";
export * from "./src/commands/crm-commands.ts";
export * from "./src/commands/vehicle-commands.ts";
export * from "./src/commands/intake-commands.ts";
export * from "./src/commands/agenda-commands.ts";
export * from "./src/commands/inspection-commands.ts";
export * from "./src/commands/quote-commands.ts";
export * from "./src/commands/authorization-commands.ts";
export * from "./src/commands/engine.ts";
export * from "./src/commands/fixtures.ts";

// Query contracts (R0-D Fase 4a, DATATEK_R0_D sección 3.1) — pure read
// functions over `CrmVehicleState`. None of them actually import
// `node:crypto` (only types from commands/state.ts), but they are
// re-exported from this server-only barrel rather than the main
// "@datatek/application" barrel for architectural consistency with
// `CrmVehicleState` itself — see queries/types.ts for the full rationale.
export * from "./src/queries/types.ts";
export * from "./src/queries/shared.ts";
export * from "./src/queries/vehicle-now.ts";
export * from "./src/queries/pass-home.ts";
export * from "./src/queries/pass-case.ts";
export * from "./src/queries/next-service.ts";
export * from "./src/queries/immediate-decisions.ts";
export * from "./src/queries/pro-case-experience.ts";
export * from "./src/queries/case-proof-summary.ts";
export * from "./src/queries/service-price-presentation.ts";
