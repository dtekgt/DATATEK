// @datatek/auth — interfaces and boundaries only. R0-B does not implement
// real permissions, sessions, or RLS-equivalent checks. Every value here is
// produced by an explicit fixture provided by the caller; nothing in this
// package infers capability from anything implicit.
//
// R0-C connects the real "effective capability" resolution (membership +
// role + elevation) behind these exact shapes, so `apps/*` and `packages/ui`
// do not change when auth becomes real.

export * from "./tenancy.ts";

export type PlatformRole = "control_admin" | "control_support" | "none";
export type OrganizationRole = "owner" | "manager" | "technician" | "front_desk" | "none";

/** A capability fixture: R0-B callers construct this by hand (see
 * apps/web/src/lib/fixture-session.ts). R0-C replaces the constructor with a
 * real read of membership + role + elevation state; the shape does not
 * change downstream. */
export interface EffectiveCapabilities {
  organizationId: string | null;
  organizationRole: OrganizationRole;
  platformRole: PlatformRole;
  /** True only when a time-boxed elevated support session is active and
   * audited (ley 19). Always false in R0-B. */
  elevated: boolean;
  permissions: string[];
}

export function hasPermission(caps: EffectiveCapabilities, permission: string | null): boolean {
  if (permission === null) return true;
  return caps.permissions.includes(permission);
}

export interface FeatureFlagState {
  key: string;
  enabled: boolean;
}

export function isFeatureEnabled(flags: FeatureFlagState[], key: string | null): boolean {
  if (key === null) return true;
  return flags.some((f) => f.key === key && f.enabled);
}

/** Fixture builder used throughout R0-B apps. Never derived from cookies,
 * headers, or any implicit signal — a caller always passes explicit values. */
export function buildFixtureCapabilities(
  input: Partial<EffectiveCapabilities> = {},
): EffectiveCapabilities {
  return {
    organizationId: input.organizationId ?? "org-dtek-servicios",
    organizationRole: input.organizationRole ?? "owner",
    platformRole: input.platformRole ?? "none",
    elevated: input.elevated ?? false,
    permissions: input.permissions ?? [
      "pro.dashboard.read",
      "pro.cases.read",
      "pass.home.read",
      "pass.garage.read",
      "pass.cases.read",
      "control.home.read",
      "control.status.read",
    ],
  };
}
