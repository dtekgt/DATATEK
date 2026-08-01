/* eslint-disable @typescript-eslint/no-require-imports -- deferred `require()`
   calls are load-bearing here; see the comment above each one below. */
// Imported as the first statement in every `*.test.tsx` file. Installs a
// jsdom DOM environment as globals (mirroring what Vitest's
// `environment: "jsdom"` normally does) and extends the standalone `expect`
// package with jest-dom matchers. Runs once per test file/worker since
// Node's test runner isolates each file — a single `--require` preload on
// the main process does not reach per-file worker globals, so this has to
// be a real import inside each test module instead.
//
// Why this whole file exists: this sandboxed environment blocks execution
// of downloaded native binaries (esbuild, rollup's native addon, SWC),
// which Vite/Vitest require internally. jsdom, `expect`, and the TypeScript
// compiler are pure JavaScript and unaffected, so this substitutes for
// Vite's transform + jsdom setup using only pure-JS tooling. `pnpm
// test:vitest` remains the authored, standard entry point for environments
// without this restriction (see docs/runbooks/local-development.md).
import { JSDOM } from "jsdom";
import { expect } from "expect";
import { afterEach } from "node:test";

const g = globalThis as unknown as Record<string, unknown>;

if (!g.document) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });

  g.window = dom.window;
  g.document = dom.window.document;
  // Node >=21 ships a built-in read-only `navigator` global; redefine it so
  // it can be overridden with jsdom's implementation.
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.getComputedStyle = dom.window.getComputedStyle;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
  g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  g.IS_REACT_ACT_ENVIRONMENT = true;
}

// IMPORTANT: `@testing-library/jest-dom/matchers` transitively requires
// `@testing-library/dom`, whose `screen` export snapshots
// `typeof document !== "undefined"` the moment it is first required. A
// static top-level `import` would be hoisted ahead of the DOM setup above
// (import declarations always execute before other module code, regardless
// of source order), permanently wiring `screen` to the broken stub. A plain
// runtime `require()` call, positioned after the globals are installed,
// avoids that.
const matchers =
  require("@testing-library/jest-dom/matchers") as typeof import("@testing-library/jest-dom/matchers");
expect.extend(matchers);

// Same hoisting concern as above: require after DOM globals are installed.
const { cleanup } = require("@testing-library/react") as typeof import("@testing-library/react");
afterEach(() => {
  cleanup();
});
