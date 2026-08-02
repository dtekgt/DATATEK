// @datatek/application — depends only on @datatek/domain. Defines the
// canonical read ViewModel contracts and R0-B fixture adapters. Never
// imported by apps directly for mutation; R0-C/R0-D swap adapters, not
// consumers.
//
// Extensions on the relative specifiers below are required so this file
// resolves correctly under Node's native ESM + type-stripping loader (used
// when a consumer package's compiled test output `require()`s/`import()`s
// this package directly from node_modules, bypassing bundler-style
// resolution) — see packages/domain/src/index.ts for the original note and
// scripts/run-node-tests.mjs for context.
export * from "./viewmodels/shared.ts";
export * from "./viewmodels/pro.ts";
export * from "./viewmodels/pass.ts";
export * from "./viewmodels/market.ts";
export * from "./viewmodels/control.ts";
export * from "./viewmodels/experience.ts";
export * from "./viewmodels/audience.ts";

export * from "./fixtures/vehicles.ts";
export * from "./fixtures/cases.ts";
export * from "./fixtures/decisions.ts";
export * from "./fixtures/pricing.ts";
export * from "./fixtures/tenancy.ts";

export * from "./adapters/pro-adapters.ts";
export * from "./adapters/pass-adapters.ts";
export * from "./adapters/market-adapters.ts";
export * from "./adapters/control-adapters.ts";

// The command layer (packages/application/src/commands/*) is DELIBERATELY
// NOT re-exported here. `quote-commands.ts` and `authorization-commands.ts`
// both reach `node:crypto` (directly, or via "@datatek/domain/quote-snapshot"
// — see that file's comment). Every page/component above imports this
// barrel for read-only ViewModels; because `export *` forces a bundler to
// resolve every module reachable through it regardless of which names a
// given importer actually uses, keeping the commands here would drag
// `node:crypto` into EVERY client bundle that reads so much as one
// ViewModel — exactly the `apps/control`/`apps/web` webpack failures this
// split fixes. Server-only code (the dev command engine, its route handler)
// imports the command layer explicitly from "@datatek/application/commands"
// instead — see commands.ts at this package's root.
