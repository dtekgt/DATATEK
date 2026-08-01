/* eslint-disable @typescript-eslint/no-empty-object-type -- declaration
   merging module augmentation, not a real empty interface. */
// Type augmentation so `expect(element).toBeInTheDocument()` etc. type-check
// when using the standalone `expect` package (Node's test runner has no
// bundled matcher library, unlike Vitest/Jest globals). See
// test-setup/jsdom-env.ts for the runtime `expect.extend(matchers)` call.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "expect" {
  interface Matchers<R extends void | Promise<void>, T = unknown> extends TestingLibraryMatchers<
    T,
    R
  > {}
}
