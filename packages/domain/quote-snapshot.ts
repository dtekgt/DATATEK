// Root-level shim so `@datatek/domain/quote-snapshot` resolves as a plain
// file lookup under classic/Node10 module resolution (used by
// scripts/run-node-tests.mjs's CommonJS test compile), which does not read
// package.json "exports" maps at all. Under "Bundler" resolution (the Next.js
// apps' tsconfig, and this package's own main tsconfig) the "exports" entry
// in package.json is what actually gets consulted — this file is what it
// points at, so there is exactly one source of truth either way.
//
// See src/index.ts for why the real implementation (src/quote/quote-snapshot.ts)
// is not part of the main barrel: it imports `node:crypto`, which is only
// safe to reach from server-side code.
export * from "./src/quote/quote-snapshot.ts";
