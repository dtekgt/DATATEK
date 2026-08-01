#!/usr/bin/env node
// Shared pure-JS test runner used by every package's `pnpm test`.
//
// Why this exists instead of `vitest run`: this sandboxed environment
// blocks execution of downloaded native binaries (esbuild, rollup's native
// addon, SWC), which Vite/Vitest require internally — even loading them as
// in-process addons is blocked by an Application Control policy. TypeScript
// (tsc) and Node's built-in test runner are pure JavaScript / native to
// Node itself, so this pipeline compiles each package's TypeScript sources
// (including its `*.test.ts(x)` files) to CommonJS with tsc, then runs the
// compiled output with `node --test`. `pnpm test:vitest` (where present)
// remains the authored, standard entry point for unrestricted environments
// — see docs/runbooks/local-development.md.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const testDist = path.join(cwd, "test-dist");
const tscBin = path.resolve(cwd, "..", "..", "node_modules", "typescript", "bin", "tsc");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// 1. Clean.
rmSync(testDist, { recursive: true, force: true });

// 2. Compile.
run(process.execPath, [tscBin, "-p", "tsconfig.test.json"]);

// 3. Mark output as CommonJS (package.json declares "type": "module" for
// real source; compiled test output is CommonJS).
mkdirSync(testDist, { recursive: true });
writeFileSync(path.join(testDist, "package.json"), JSON.stringify({ type: "commonjs" }) + "\n");

// 4. Collect compiled *.test.js files.
function collect(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collect(full));
    } else if (entry.endsWith(".test.js")) {
      found.push(full);
    }
  }
  return found;
}

const files = collect(testDist);
if (files.length === 0) {
  console.error(`[run-node-tests] No compiled *.test.js files found under ${testDist}.`);
  process.exit(1);
}

// 5. Run.
run(process.execPath, ["--test", ...files]);
