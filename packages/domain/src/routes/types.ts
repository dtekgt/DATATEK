// Route/feature registry types (R0-B sección 4, B4; R0-A sección 12.7).
// `domain` is pure TypeScript: no fetch, no framework imports.

export type Surface = "public" | "pro" | "pass" | "market" | "control" | "limited-auth";

export type ActorRole = "conductor" | "taller" | "proveedor" | "control" | "guest";

export interface PlannedDetail {
  /** What this screen/action is meant to do once it ships. */
  purpose: string;
  /** What has to land first (e.g. "R0-C: auth y tenancy"). */
  dependency: string;
  /** Target release id, e.g. "r0-c", "r0-d", "r1". */
  release: string;
  /** What data it will read once wired to real adapters. */
  dataToBeUsed: string;
  /** Why the action/control is disabled right now. */
  whyDisabled: string;
}

export interface RouteEntry {
  /** Stable identifier used for lookups and telemetry correlation. */
  id: string;
  surface: Surface;
  /** Human label in Spanish, plain language. */
  label: string;
  /** Canonical Next.js path, using [param] segments. `[orgSlug]` is the only Pro tenant convention. */
  path: string;
  /** Lucide icon name. */
  icon: string;
  /** Release this route ships in. R0-B registers all 58; most resolve as planned. */
  release: "r0-b" | "r0-c" | "r0-d" | "r0-e" | "r1";
  /** Declarative permission string, or null when no permission gate applies yet. */
  permission: string | null;
  /** Feature flag key, or null when unconditional. */
  featureFlag: string | null;
  /** Whether this entry appears in primary navigation (vs. reachable-only). */
  navVisible: boolean;
  /** Telemetry event id emitted on navigation. */
  telemetry: string;
  /** Copy shown when the underlying list/collection is empty. */
  emptyState: string;
  /** Breadcrumb chain, root first. */
  breadcrumbs: string[];
  /** Roles that must NOT see this entry in navigation. Supplier routes hide from "conductor". */
  hiddenForRoles?: ActorRole[];
  /**
   * When present, this route has no real implementation yet and must render
   * `PlannedFeatureState` with this detail. When absent, the route renders a
   * fixture-backed demo (`demo: true`, badge visible) that never mutates data.
   */
  planned?: PlannedDetail;
}
