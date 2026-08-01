import { defineConfig, devices } from "@playwright/test";

// Authored per R0-B sección 12 (E2E smoke). Not executed in this session:
// the environment has no browser binaries and Docker/Supabase are out of
// scope (B6/B7). Run `pnpm e2e:install && pnpm test:e2e` on a machine with
// Docker Desktop + Playwright browsers to exercise these scenarios.
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-pass", use: { ...devices["iPhone 13"] } },
  ],
});
