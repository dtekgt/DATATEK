// Fixture tenancy graph for R0-C — DTEK Servicios + Taller Demo, their
// branches, actors, org/platform memberships and one seeded elevated
// support session. This is the exact shape `apps/web` and `apps/control`
// read while Supabase local is unreachable in this sandbox (no Docker — see
// docs/runbooks/local-auth-seeds.md). Once Supabase is reachable, the same
// `TenancySnapshot` type is filled from real rows and every consumer below
// this module is unaffected.
import type {
  TenancySnapshot,
  OrganizationMembershipRow,
  MembershipRoleRow,
  RoleTemplatePermissionRow,
  MembershipBranchScopeRow,
  PlatformMembershipRow,
  PlatformMembershipRoleRow,
  PlatformRolePermissionRow,
  SupportAccessSessionRow,
  UserProfileRow,
} from "@datatek/auth";
import { ORGANIZATION_ROLE_TEMPLATES, PLATFORM_ROLE_TEMPLATES } from "@datatek/domain";

export const FIXTURE_ORGANIZATION_IDS = {
  dtek: "org-dtek-servicios",
  demo: "org-taller-demo",
} as const;

export const FIXTURE_ORGANIZATIONS = [
  {
    id: FIXTURE_ORGANIZATION_IDS.dtek,
    slug: "dtek-servicios",
    label: "DTEK Servicios",
    meta: "taller fundador",
  },
  {
    id: FIXTURE_ORGANIZATION_IDS.demo,
    slug: "taller-demo",
    label: "Taller Demo",
    meta: "demo",
  },
] as const;

export const FIXTURE_BRANCHES: Record<string, { id: string; label: string }[]> = {
  [FIXTURE_ORGANIZATION_IDS.dtek]: [
    { id: "branch-dtek-central", label: "Sucursal Central" },
    { id: "branch-dtek-movil", label: "Sucursal Móvil" },
  ],
  [FIXTURE_ORGANIZATION_IDS.demo]: [{ id: "branch-demo-principal", label: "Sucursal Demo" }],
};

/** Actor IDs match DATATEK_R0_C sección 8 exactly. */
export const FIXTURE_ACTOR_IDS = {
  ownerDtek: "u-owner-dtek",
  advisorDtek: "u-advisor-dtek",
  inspectorDtek: "u-inspector-dtek",
  mechanicDtek: "u-mechanic-dtek",
  cashierDtek: "u-cashier-dtek",
  customerDtek: "u-customer-dtek",
  ownerDemo: "u-owner-demo",
  customerDemo: "u-customer-demo",
  platformSupport: "u-platform-support",
  platformAdmin: "u-platform-admin",
} as const;

export const FIXTURE_PROFILES: UserProfileRow[] = [
  {
    userId: FIXTURE_ACTOR_IDS.ownerDtek,
    displayName: "Owner DTEK",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.advisorDtek,
    displayName: "Asesor DTEK",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.inspectorDtek,
    displayName: "Inspector DTEK",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.mechanicDtek,
    displayName: "Mecánico DTEK",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.cashierDtek,
    displayName: "Caja DTEK",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.customerDtek,
    displayName: "Cliente DTEK",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.ownerDemo,
    displayName: "Owner Taller Demo",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.customerDemo,
    displayName: "Cliente Taller Demo",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.platformSupport,
    displayName: "Soporte de plataforma",
    locale: "es-GT",
    status: "active",
  },
  {
    userId: FIXTURE_ACTOR_IDS.platformAdmin,
    displayName: "Admin de plataforma",
    locale: "es-GT",
    status: "active",
  },
];

const ALWAYS_OPEN = { effectiveFrom: "2025-01-01T00:00:00.000Z", effectiveUntil: null as null };

const membershipDefs: { id: string; userId: string; organizationId: string; role: string }[] = [
  {
    id: "mem-owner-dtek",
    userId: FIXTURE_ACTOR_IDS.ownerDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    role: "owner",
  },
  {
    id: "mem-advisor-dtek",
    userId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    role: "advisor",
  },
  {
    id: "mem-inspector-dtek",
    userId: FIXTURE_ACTOR_IDS.inspectorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    role: "inspector",
  },
  {
    id: "mem-mechanic-dtek",
    userId: FIXTURE_ACTOR_IDS.mechanicDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    role: "mechanic",
  },
  {
    id: "mem-cashier-dtek",
    userId: FIXTURE_ACTOR_IDS.cashierDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    role: "cashier",
  },
  {
    id: "mem-customer-dtek",
    userId: FIXTURE_ACTOR_IDS.customerDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    role: "customer",
  },
  {
    id: "mem-owner-demo",
    userId: FIXTURE_ACTOR_IDS.ownerDemo,
    organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    role: "owner",
  },
  {
    id: "mem-customer-demo",
    userId: FIXTURE_ACTOR_IDS.customerDemo,
    organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    role: "customer",
  },
];

export const FIXTURE_MEMBERSHIPS: OrganizationMembershipRow[] = membershipDefs.map((m) => ({
  id: m.id,
  userId: m.userId,
  organizationId: m.organizationId,
  status: "active",
  ...ALWAYS_OPEN,
}));

export const FIXTURE_MEMBERSHIP_ROLES: MembershipRoleRow[] = membershipDefs.map((m) => ({
  membershipId: m.id,
  roleTemplateKey: m.role,
}));

export const FIXTURE_ROLE_TEMPLATE_PERMISSIONS: RoleTemplatePermissionRow[] = Object.entries(
  ORGANIZATION_ROLE_TEMPLATES,
).flatMap(([roleTemplateKey, permissions]) =>
  permissions.map((permission) => ({ roleTemplateKey, permission })),
);

/** Owner gets every branch in their organization (sección 2.3: "Owner puede
 * recibir scope de todas las sucursales mediante regla explícita"). Every
 * other role is scoped to the organization's single seeded branch so the
 * branch-denied path is reachable in fixtures too. */
export const FIXTURE_BRANCH_SCOPES: MembershipBranchScopeRow[] = membershipDefs.flatMap((m) => {
  if (m.role === "owner") {
    return [{ membershipId: m.id, branchId: "all" as const }];
  }
  const firstBranch = FIXTURE_BRANCHES[m.organizationId]?.[0];
  return firstBranch ? [{ membershipId: m.id, branchId: firstBranch.id }] : [];
});

export const FIXTURE_PLATFORM_MEMBERSHIPS: PlatformMembershipRow[] = [
  {
    id: "pmem-support",
    userId: FIXTURE_ACTOR_IDS.platformSupport,
    status: "active",
    ...ALWAYS_OPEN,
  },
  {
    id: "pmem-admin",
    userId: FIXTURE_ACTOR_IDS.platformAdmin,
    status: "active",
    ...ALWAYS_OPEN,
  },
];

export const FIXTURE_PLATFORM_MEMBERSHIP_ROLES: PlatformMembershipRoleRow[] = [
  { platformMembershipId: "pmem-support", platformRoleTemplateKey: "platform_support" },
  { platformMembershipId: "pmem-admin", platformRoleTemplateKey: "platform_admin" },
];

export const FIXTURE_PLATFORM_ROLE_PERMISSIONS: PlatformRolePermissionRow[] = Object.entries(
  PLATFORM_ROLE_TEMPLATES,
).flatMap(([platformRoleTemplateKey, permissions]) =>
  permissions.map((permission) => ({ platformRoleTemplateKey, permission })),
);

/** One seeded elevated session: platform support, active, scoped to DTEK
 * only, with a ticket/reason/expiry — the exact shape ElevatedAccessBanner
 * renders (sección 5.4). Taller Demo is deliberately NOT covered by this
 * session so the isolation test (support sees DTEK, not Taller Demo) is
 * reachable straight from fixtures. */
export const FIXTURE_SUPPORT_ACCESS_SESSIONS: SupportAccessSessionRow[] = [
  {
    id: "sas-support-dtek",
    platformMembershipId: "pmem-support",
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ticket: "TCK-1042",
    reason: "Cliente reporta folio no visible en Pro — investigar aislamiento",
    scope: "read_only",
    status: "active",
    startsAt: "2026-08-01T08:00:00.000Z",
    expiresAt: "2026-08-01T20:00:00.000Z",
    revokedAt: null,
  },
];

export function buildFixtureTenancySnapshot(): TenancySnapshot {
  return {
    profiles: FIXTURE_PROFILES,
    memberships: FIXTURE_MEMBERSHIPS,
    membershipRoles: FIXTURE_MEMBERSHIP_ROLES,
    roleTemplatePermissions: FIXTURE_ROLE_TEMPLATE_PERMISSIONS,
    branchScopes: FIXTURE_BRANCH_SCOPES,
    platformMemberships: FIXTURE_PLATFORM_MEMBERSHIPS,
    platformMembershipRoles: FIXTURE_PLATFORM_MEMBERSHIP_ROLES,
    platformRolePermissions: FIXTURE_PLATFORM_ROLE_PERMISSIONS,
    supportAccessSessions: FIXTURE_SUPPORT_ACCESS_SESSIONS,
  };
}
