import { describe, it } from "node:test";
import { expect } from "expect";
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { ROUTE_REGISTRY, isHiddenForRole } from "./route-registry";

// `__dirname` is provided by the CommonJS test runtime (both Vitest's
// vite-node transform and this repo's tsc-to-CJS pipeline supply it), but
// its depth from the monorepo root differs between running compiled output
// (test-dist/src/routes) and raw source (src/routes). Search upward for the
// workspace marker instead of hard-coding a hop count.
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate pnpm-workspace.yaml above ${start}`);
}

const repoRoot = findRepoRoot(__dirname);

/** Collect every `/route/segment/page.tsx` path under a Next.js `app` dir. */
function collectAppRoutes(appDir: string): string[] {
  if (!existsSync(appDir)) return [];
  const found: string[] = [];

  function walk(dir: string, segments: string[]) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        // Route groups like (public) do not appear in the URL.
        const isGroup = entry.startsWith("(") && entry.endsWith(")");
        walk(full, isGroup ? segments : [...segments, entry]);
      } else if (entry === "page.tsx" || entry === "page.ts") {
        const routePath = "/" + segments.join("/");
        found.push(routePath === "/" ? "/" : routePath.replace(/\/+$/, ""));
      }
    }
  }

  walk(appDir, []);
  return found;
}

const webAppDir = path.join(repoRoot, "apps", "web", "src", "app");
const controlAppDir = path.join(repoRoot, "apps", "control", "src", "app");

describe("route registry", () => {
  it("has exactly 58 canonical entries", () => {
    expect(ROUTE_REGISTRY.length).toBe(58);
  });

  it("has no duplicate ids", () => {
    const ids = ROUTE_REGISTRY.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate (surface, path) pairs", () => {
    const keys = ROUTE_REGISTRY.map((r) => `${r.surface}:${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses [orgSlug] as the only Pro tenant convention", () => {
    const proRoutes = ROUTE_REGISTRY.filter((r) => r.surface === "pro");
    for (const route of proRoutes) {
      expect(route.path.startsWith("/pro/o/[orgSlug]/")).toBe(true);
      expect(route.path).not.toMatch(/\[org(Id|Slug2|anization)\]/i);
    }
  });

  it("hides /market/supplier/* routes for the conductor role", () => {
    const supplierRoutes = ROUTE_REGISTRY.filter((r) => r.path.startsWith("/market/supplier/"));
    expect(supplierRoutes.length).toBeGreaterThan(0);
    for (const route of supplierRoutes) {
      expect(isHiddenForRole(route, "conductor")).toBe(true);
    }
  });

  it("counts routes per surface matching the R0-A canonical inventory", () => {
    const counts: Record<string, number> = {};
    for (const r of ROUTE_REGISTRY) {
      const bucket = r.surface === "limited-auth" ? "pass" : r.surface;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    expect(counts.public).toBe(12);
    expect(counts.pro).toBe(15);
    expect(counts.pass).toBe(9); // 8 Pass + /a/[token]
    expect(counts.market).toBe(9);
    expect(counts.control).toBe(13);
  });

  it("matches the apps/web filesystem for public/pro/pass/market/limited-auth routes", () => {
    const filesystemPaths = new Set(collectAppRoutes(webAppDir));
    const registryPaths = ROUTE_REGISTRY.filter((r) => r.surface !== "control").map((r) => r.path);

    const missingOnDisk = registryPaths.filter((p) => !filesystemPaths.has(p));
    expect(missingOnDisk).toEqual([]);

    const registrySet = new Set(registryPaths);
    const extraOnDisk = [...filesystemPaths].filter((p) => !registrySet.has(p));
    expect(extraOnDisk).toEqual([]);
  });

  it("matches the apps/control filesystem for control routes", () => {
    const filesystemPaths = new Set(collectAppRoutes(controlAppDir));
    const registryPaths = ROUTE_REGISTRY.filter((r) => r.surface === "control").map((r) => r.path);

    const missingOnDisk = registryPaths.filter((p) => !filesystemPaths.has(p));
    expect(missingOnDisk).toEqual([]);

    const registrySet = new Set(registryPaths);
    const extraOnDisk = [...filesystemPaths].filter((p) => !registrySet.has(p));
    expect(extraOnDisk).toEqual([]);
  });
});
