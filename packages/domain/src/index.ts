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
