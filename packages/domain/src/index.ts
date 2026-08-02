// @datatek/domain — pure TypeScript. No fetch, no framework, no Supabase.
//
// Extensions on the relative specifiers below are required so this file
// resolves correctly under Node's native ESM + type-stripping loader (used
// when a consumer package's compiled test output `require()`s this package
// directly from node_modules, bypassing bundler-style resolution). See
// scripts/run-node-tests.mjs for context.
export * from "../generated/spec.constants.ts";
export type * from "./routes/types.ts";
export * from "./routes/route-registry.ts";

export * from "./value-objects/errors.ts";
export * from "./value-objects/money.ts";
export * from "./value-objects/odometer.ts";
export * from "./value-objects/measurement.ts";

export * from "./case/case-transitions.ts";
export * from "./inspection/brakes-template.ts";
export * from "./inspection/completion-gate.ts";
export * from "./inspection/maintenance-recommendation.ts";
export * from "./evidence/visibility.ts";
// quote-snapshot.ts is NOT re-exported here on purpose: it imports
// `node:crypto` for the SHA-256 freeze hash (sección 11), which is only
// ever needed server-side (inside `FreezeQuoteVersion`). Barrel-exporting it
// from here would make every client component that imports anything else
// from "@datatek/domain" (e.g. `routesForSurface` in a shell nav) drag
// `node:crypto` into the browser bundle and fail to compile. Server-only
// code imports it explicitly from "@datatek/domain/quote-snapshot" instead.
