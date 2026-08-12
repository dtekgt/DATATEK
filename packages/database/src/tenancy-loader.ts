// Carga un `TenancySnapshot` real desde Postgres para UN actor — el
// reemplazo de `buildFixtureTenancySnapshot()` (packages/application/src/
// fixtures/tenancy.ts) cuando `DATATEK_PERSISTENCE=postgres` está activo.
//
// Corre bajo `withRlsRead`: las 8 políticas RLS de 0010_identity_tenancy_
// isolation.sql (`organization_memberships_select_self_or_manager`,
// `membership_roles_select`, etc.) son el filtro real de qué filas puede
// ver este actor — las cláusulas `where user_id = $1` de abajo son
// redundantes con esas políticas a propósito, no un sustituto: si RLS
// negara una fila, la query simplemente la omite igual.
//
// `resolveOrganizationCapabilities`/`resolveAccessBoundaryState`
// (@datatek/auth) no cambian ni una línea — reciben el mismo
// `TenancySnapshot` que ya reciben desde fixtures.
import type pg from "pg";
import type {
  TenancySnapshot,
  UserProfileRow,
  OrganizationMembershipRow,
  MembershipRoleRow,
  RoleTemplatePermissionRow,
  MembershipBranchScopeRow,
  PlatformMembershipRow,
  PlatformMembershipRoleRow,
  PlatformRolePermissionRow,
  SupportAccessSessionRow,
} from "@datatek/auth";
import { withRlsRead } from "./rls-read.ts";

export async function loadActorTenancySnapshot(
  pool: pg.Pool,
  actorId: string,
): Promise<TenancySnapshot> {
  return withRlsRead(pool, actorId, async (client) => {
    const profiles = await loadProfiles(client, actorId);
    const memberships = await loadMemberships(client, actorId);
    const membershipRoles = await loadMembershipRoles(client, actorId);
    const roleTemplatePermissions = await loadRoleTemplatePermissions(client);
    const branchScopes = await loadBranchScopes(client, actorId);
    const platformMemberships = await loadPlatformMemberships(client, actorId);
    const platformMembershipRoles = await loadPlatformMembershipRoles(client, actorId);
    const platformRolePermissions = await loadPlatformRolePermissions(client);
    const supportAccessSessions = await loadSupportAccessSessions(client, actorId);

    return {
      profiles,
      memberships,
      membershipRoles,
      roleTemplatePermissions,
      branchScopes,
      platformMemberships,
      platformMembershipRoles,
      platformRolePermissions,
      supportAccessSessions,
    };
  });
}

async function loadProfiles(client: pg.PoolClient, actorId: string): Promise<UserProfileRow[]> {
  const { rows } = await client.query(
    `select user_id, display_name, locale, status from user_profiles where user_id = $1`,
    [actorId],
  );
  return rows.map((row) => ({
    userId: row.user_id as string,
    displayName: row.display_name as string,
    locale: row.locale as string,
    status: row.status as UserProfileRow["status"],
  }));
}

async function loadMemberships(
  client: pg.PoolClient,
  actorId: string,
): Promise<OrganizationMembershipRow[]> {
  const { rows } = await client.query(
    `select id, user_id, organization_id, status, effective_from, effective_until
       from organization_memberships
      where user_id = $1`,
    [actorId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    organizationId: row.organization_id as string,
    status: row.status as OrganizationMembershipRow["status"],
    effectiveFrom: (row.effective_from as Date).toISOString(),
    effectiveUntil: row.effective_until ? (row.effective_until as Date).toISOString() : null,
  }));
}

async function loadMembershipRoles(
  client: pg.PoolClient,
  actorId: string,
): Promise<MembershipRoleRow[]> {
  const { rows } = await client.query(
    `select mr.membership_id, mr.role_template_key
       from membership_roles mr
       join organization_memberships om on om.id = mr.membership_id
      where om.user_id = $1`,
    [actorId],
  );
  return rows.map((row) => ({
    membershipId: row.membership_id as string,
    roleTemplateKey: row.role_template_key as string,
  }));
}

// Tabla de referencia (rol → permiso), legible por cualquier `authenticated`
// (`role_template_permissions_select_authenticated`) — igual que las
// fixtures cargan la lista completa, no solo los roles del actor.
async function loadRoleTemplatePermissions(
  client: pg.PoolClient,
): Promise<RoleTemplatePermissionRow[]> {
  const { rows } = await client.query(
    `select role_template_key, permission_key from role_template_permissions`,
  );
  return rows.map((row) => ({
    roleTemplateKey: row.role_template_key as string,
    permission: row.permission_key as RoleTemplatePermissionRow["permission"],
  }));
}

async function loadBranchScopes(
  client: pg.PoolClient,
  actorId: string,
): Promise<MembershipBranchScopeRow[]> {
  const { rows } = await client.query(
    `select mbs.membership_id, mbs.branch_id, mbs.all_branches
       from membership_branch_scopes mbs
       join organization_memberships om on om.id = mbs.membership_id
      where om.user_id = $1`,
    [actorId],
  );
  return rows.map((row) => ({
    membershipId: row.membership_id as string,
    branchId: (row.all_branches ? "all" : (row.branch_id as string)) as string | "all",
  }));
}

async function loadPlatformMemberships(
  client: pg.PoolClient,
  actorId: string,
): Promise<PlatformMembershipRow[]> {
  const { rows } = await client.query(
    `select id, user_id, status, effective_from, effective_until
       from platform_memberships
      where user_id = $1`,
    [actorId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    status: row.status as PlatformMembershipRow["status"],
    effectiveFrom: (row.effective_from as Date).toISOString(),
    effectiveUntil: row.effective_until ? (row.effective_until as Date).toISOString() : null,
  }));
}

async function loadPlatformMembershipRoles(
  client: pg.PoolClient,
  actorId: string,
): Promise<PlatformMembershipRoleRow[]> {
  const { rows } = await client.query(
    `select pmr.platform_membership_id, pmr.platform_role_template_key
       from platform_membership_roles pmr
       join platform_memberships pm on pm.id = pmr.platform_membership_id
      where pm.user_id = $1`,
    [actorId],
  );
  return rows.map((row) => ({
    platformMembershipId: row.platform_membership_id as string,
    platformRoleTemplateKey: row.platform_role_template_key as string,
  }));
}

// Solo visible si el actor ya es miembro de plataforma
// (`platform_role_permissions_select_platform`) — para cualquier otro
// actor esta query simplemente vuelve vacía, que es lo correcto: no
// necesita esos permisos de referencia.
async function loadPlatformRolePermissions(
  client: pg.PoolClient,
): Promise<PlatformRolePermissionRow[]> {
  const { rows } = await client.query(
    `select platform_role_template_key, permission_key from platform_role_permissions`,
  );
  return rows.map((row) => ({
    platformRoleTemplateKey: row.platform_role_template_key as string,
    permission: row.permission_key as PlatformRolePermissionRow["permission"],
  }));
}

async function loadSupportAccessSessions(
  client: pg.PoolClient,
  actorId: string,
): Promise<SupportAccessSessionRow[]> {
  const { rows } = await client.query(
    `select sas.id, sas.platform_membership_id, sas.organization_id, sas.ticket, sas.reason,
            sas.scope, sas.status, sas.starts_at, sas.expires_at, sas.revoked_at
       from support_access_sessions sas
       join platform_memberships pm on pm.id = sas.platform_membership_id
      where pm.user_id = $1`,
    [actorId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    platformMembershipId: row.platform_membership_id as string,
    organizationId: row.organization_id as string,
    ticket: row.ticket as string,
    reason: row.reason as string,
    scope: row.scope as SupportAccessSessionRow["scope"],
    status: row.status as SupportAccessSessionRow["status"],
    startsAt: (row.starts_at as Date).toISOString(),
    expiresAt: (row.expires_at as Date).toISOString(),
    revokedAt: row.revoked_at ? (row.revoked_at as Date).toISOString() : null,
  }));
}
