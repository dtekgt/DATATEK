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
