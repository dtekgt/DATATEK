-- Datatek — migración 0010: identidad, tenancy y aislamiento (R0-C).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO. Esta
-- sandbox no tiene Docker Desktop ni Supabase CLI ejecutable localmente
-- (ver docs/runbooks/database-reset.md y docs/runbooks/local-auth-seeds.md).
-- El SQL es completo y se considera correcto por revisión estática +
-- pruebas pgTAP escritas en supabase/tests/0010_identity_tenancy.sql, pero
-- su ejecución contra Postgres real queda como
-- `implemented_pending_environment_evidence` hasta que una sesión futura
-- con Docker corra `pnpm db:reset && pnpm test:db`.
--
-- Ley 27 aplica: RLS, grants, índices y pruebas nacen con esta ola, no se
-- agregan después. Ninguna tabla de negocio (clientes, vehículos, casos,
-- cotización, autorización) se crea aquí — DATATEK_R0_C sección 1 las
-- excluye explícitamente de R0-C.
--
-- Fuente normativa: DATATEK_R0_C_IDENTITY_TENANCY_ISOLATION.md secciones
-- 2–7. Los nombres de tabla y el orden siguen la sección 3 literalmente
-- (17 tablas).

-- ===========================================================================
-- 0. Helpers de esquema
-- ===========================================================================

create schema if not exists datatek_platform;

-- ===========================================================================
-- 1. user_profiles
-- ===========================================================================
-- auth.users autentica; user_profiles guarda solo lo enumerado en sección
-- 2.1. Nunca guarda rol, organización confiable, permisos, superadmin,
-- branch scope o acceso elevado — eso vive exclusivamente en las tablas de
-- membership de abajo.

create table user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  locale text not null default 'es-GT',
  timezone text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table user_profiles is
  'Perfil seguro por cuenta. No guarda rol, organización, permisos ni acceso elevado (sección 2.1).';

create trigger user_profiles_set_updated_at
  before update on user_profiles
  for each row execute function datatek_platform.set_updated_at();

-- ===========================================================================
-- 2. organizations
-- ===========================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  timezone text not null default 'America/Guatemala',
  currency text not null default 'GTQ',
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table organizations is
  'Tenant raíz. UUID es la identidad interna; slug es solo presentación/routing (sección 7).';

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function datatek_platform.set_updated_at();

-- ===========================================================================
-- 3. organization_slug_history
-- ===========================================================================

create table organization_slug_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  old_slug text not null,
  new_slug text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id)
);

comment on table organization_slug_history is
  'Cada cambio de slug queda registrado; el slug anterior redirige sin revelar organización privada (sección 7).';

create index organization_slug_history_old_slug_idx on organization_slug_history (old_slug);
create index organization_slug_history_org_idx on organization_slug_history (organization_id);

-- ===========================================================================
-- 4. organization_branches
-- ===========================================================================

create table organization_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  is_mobile boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

comment on table organization_branches is
  'Sucursales de una organización. Un scope de membership siempre referencia una fila de esta tabla, nunca una branch de otro tenant (FK compuesta más abajo).';

create trigger organization_branches_set_updated_at
  before update on organization_branches
  for each row execute function datatek_platform.set_updated_at();

create index organization_branches_org_idx on organization_branches (organization_id);

-- ===========================================================================
-- 5. permissions (catálogo canónico, espejo de packages/domain/spec)
-- ===========================================================================

create table permissions (
  key text primary key,
  domain text not null check (domain in ('organization', 'platform')),
  description text not null
);

comment on table permissions is
  'Catálogo canónico de permisos. Fuente de verdad de texto vive en packages/domain/spec/domain-spec.r0.yaml; esta tabla es su espejo ejecutable.';

-- ===========================================================================
-- 6. role_templates (organización)
-- ===========================================================================

create table role_templates (
  key text primary key,
  label text not null
);

comment on table role_templates is 'Templates de rol de organización (owner, advisor, inspector, mechanic, cashier, customer).';

-- ===========================================================================
-- 7. role_template_permissions
-- ===========================================================================

create table role_template_permissions (
  role_template_key text not null references role_templates (key) on delete cascade,
  permission_key text not null references permissions (key) on delete cascade,
  primary key (role_template_key, permission_key)
);

comment on table role_template_permissions is
  'Mapeo aditivo rol → permiso (sección 4/10: "permisos aditivos"; R0 no implementa deny explícito).';

-- ===========================================================================
-- 8. organization_memberships
-- ===========================================================================

create table organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  check (effective_until is null or effective_until > effective_from),
  unique (user_id, organization_id)
);

comment on table organization_memberships is
  'Relación usuario↔organización con vigencia y auditoría de cambios sensibles (sección 2.2). Una persona puede pertenecer a varias organizaciones (varias filas, un user_id).';

create trigger organization_memberships_set_updated_at
  before update on organization_memberships
  for each row execute function datatek_platform.set_updated_at();

create index organization_memberships_user_idx on organization_memberships (user_id);
create index organization_memberships_org_idx on organization_memberships (organization_id);
create index organization_memberships_active_idx
  on organization_memberships (organization_id, user_id)
  where status = 'active';

-- ===========================================================================
-- 9. membership_roles
-- ===========================================================================

create table membership_roles (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references organization_memberships (id) on delete cascade,
  role_template_key text not null references role_templates (key) on delete restrict,
  created_at timestamptz not null default now(),
  unique (membership_id, role_template_key)
);

comment on table membership_roles is
  'Una membresía puede tener varios roles activos simultáneamente (sección 2.2).';

create index membership_roles_membership_idx on membership_roles (membership_id);

-- ===========================================================================
-- 10. membership_branch_scopes
-- ===========================================================================
-- Un scope siempre pertenece a la organización de la membership (sección
-- 2.3). Se aplica con una FK compuesta contra (organization_branches.id,
-- organization_branches.organization_id) y una columna organization_id
-- redundante-pero-verificada en la propia fila, más un trigger que valida
-- que branch.organization_id === membership.organization_id.

alter table organization_branches
  add constraint organization_branches_id_org_unique unique (id, organization_id);

create table membership_branch_scopes (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references organization_memberships (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references organization_branches (id) on delete cascade,
  all_branches boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  reason text,
  -- "sin enviar branch" nunca significa acceso universal (sección 2.3): una
  -- fila siempre es o bien un branch_id explícito, o bien all_branches=true
  -- explícito, nunca ambos ni ninguno.
  check (
    (all_branches and branch_id is null) or (not all_branches and branch_id is not null)
  ),
  foreign key (branch_id, organization_id)
    references organization_branches (id, organization_id) on delete cascade,
  unique (membership_id, branch_id),
  unique (membership_id, all_branches)
);

comment on table membership_branch_scopes is
  'Limita dónde aplica una membership. all_branches=true es la única forma de obtener todas las sucursales (Owner, regla explícita) — sección 2.3.';

create index membership_branch_scopes_membership_idx on membership_branch_scopes (membership_id);
create index membership_branch_scopes_org_idx on membership_branch_scopes (organization_id);

-- Trigger: la organization_id de la fila debe coincidir con la de la
-- membership referenciada (revalida sección 2.3 "un scope siempre pertenece
-- a la organización de la membresía" incluso si alguien pasa un
-- organization_id distinto al insertar).
create function datatek_platform.check_branch_scope_org()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  membership_org uuid;
begin
  select organization_id into membership_org
  from organization_memberships
  where id = new.membership_id;

  if membership_org is null or membership_org <> new.organization_id then
    raise exception 'membership_branch_scopes.organization_id must match the membership''s organization_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger membership_branch_scopes_check_org
  before insert or update on membership_branch_scopes
  for each row execute function datatek_platform.check_branch_scope_org();

-- ===========================================================================
-- 11. organization_settings
-- ===========================================================================

create table organization_settings (
  organization_id uuid primary key references organizations (id) on delete cascade,
  locale_seed text not null default 'es-GT',
  timezone_seed text not null default 'America/Guatemala',
  currency_seed text not null default 'GTQ',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table organization_settings is
  'Config de organización, 1:1. locale/timezone/currency son seeds por tenant, no constantes universales (sección 8).';

create trigger organization_settings_set_updated_at
  before update on organization_settings
  for each row execute function datatek_platform.set_updated_at();

-- ===========================================================================
-- 12. organization_counters
-- ===========================================================================

create table organization_counters (
  organization_id uuid not null references organizations (id) on delete cascade,
  counter_key text not null,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, counter_key)
);

comment on table organization_counters is
  'Folios secuenciales por organización, nunca globales (sección 7).';

create trigger organization_counters_set_updated_at
  before update on organization_counters
  for each row execute function datatek_platform.set_updated_at();

-- ===========================================================================
-- 13. platform_memberships
-- ===========================================================================

create table platform_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  check (effective_until is null or effective_until > effective_from),
  unique (user_id)
);

comment on table platform_memberships is
  'Independiente de organization_memberships (sección 2.4). Owner de un tenant no obtiene nada aquí ("owner no implica plataforma").';

create trigger platform_memberships_set_updated_at
  before update on platform_memberships
  for each row execute function datatek_platform.set_updated_at();

-- ===========================================================================
-- 14. platform_role_templates
-- ===========================================================================

create table platform_role_templates (
  key text primary key check (
    key in ('platform_support', 'platform_security', 'platform_admin', 'platform_auditor')
  ),
  label text not null
);

comment on table platform_role_templates is 'Roles de plataforma (sección 2.4), nunca mezclados con role_templates de organización.';

-- ===========================================================================
-- 15. platform_role_permissions
-- ===========================================================================

create table platform_role_permissions (
  platform_role_template_key text not null references platform_role_templates (key) on delete cascade,
  permission_key text not null references permissions (key) on delete cascade,
  primary key (platform_role_template_key, permission_key)
);

-- ===========================================================================
-- 16. platform_membership_roles
-- ===========================================================================

create table platform_membership_roles (
  id uuid primary key default gen_random_uuid(),
  platform_membership_id uuid not null references platform_memberships (id) on delete cascade,
  platform_role_template_key text not null references platform_role_templates (key) on delete restrict,
  created_at timestamptz not null default now(),
  unique (platform_membership_id, platform_role_template_key)
);

create index platform_membership_roles_membership_idx on platform_membership_roles (platform_membership_id);

-- ===========================================================================
-- 17. support_access_sessions
-- ===========================================================================

create table support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_membership_id uuid not null references platform_memberships (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  ticket text not null check (btrim(ticket) <> ''),
  reason text not null check (btrim(reason) <> ''),
  scope text not null check (scope in ('read_only', 'read_write_support')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked', 'expired')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  approved_by uuid references auth.users (id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

comment on table support_access_sessions is
  'Elevación de soporte con ticket, razón, scope y vencimiento (sección 2.5). No existe acceso global perpetuo a contenido tenant.';

create trigger support_access_sessions_set_updated_at
  before update on support_access_sessions
  for each row execute function datatek_platform.set_updated_at();

create index support_access_sessions_membership_idx on support_access_sessions (platform_membership_id);
create index support_access_sessions_org_idx on support_access_sessions (organization_id);
create index support_access_sessions_active_idx
  on support_access_sessions (platform_membership_id, organization_id)
  where status = 'active' and revoked_at is null;

-- ===========================================================================
-- 18. Helpers RLS (security definer, search_path fijo, sin recursión)
-- ===========================================================================
-- Todos viven en datatek_platform (no expuesto vía PostgREST por defecto) y
-- nunca leen raw_user_meta_data ni ningún otro dato editable por el usuario
-- (sección 2.1, 6.2).

create function datatek_platform.current_actor()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid();
$$;

comment on function datatek_platform.current_actor() is
  'Actor autenticado actual desde el JWT de Supabase Auth, nunca desde metadata editable.';

create function datatek_platform.has_active_org_membership(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from organization_memberships m
    where m.user_id = datatek_platform.current_actor()
      and m.organization_id = p_organization_id
      and m.status = 'active'
      and now() >= m.effective_from
      and (m.effective_until is null or now() < m.effective_until)
  );
$$;

comment on function datatek_platform.has_active_org_membership(uuid) is
  'True solo con membership activa y dentro de effective_from/effective_until (sección 2.2). No infiere acceso de un organization_id no confiado desde el navegador.';

create function datatek_platform.effective_org_permissions(p_organization_id uuid)
returns setof text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct rtp.permission_key
  from organization_memberships m
  join membership_roles mr on mr.membership_id = m.id
  join role_template_permissions rtp on rtp.role_template_key = mr.role_template_key
  where m.user_id = datatek_platform.current_actor()
    and m.organization_id = p_organization_id
    and m.status = 'active'
    and now() >= m.effective_from
    and (m.effective_until is null or now() < m.effective_until);
$$;

comment on function datatek_platform.effective_org_permissions(uuid) is
  'Unión aditiva de permisos de todos los roles activos de la membership (sección 4/10). Vacío sin membership activa.';

create function datatek_platform.has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from datatek_platform.effective_org_permissions(p_organization_id) perm
    where perm = p_permission
  );
$$;

create function datatek_platform.org_branch_scope_allows(p_organization_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from organization_memberships m
    join membership_branch_scopes s on s.membership_id = m.id
    where m.user_id = datatek_platform.current_actor()
      and m.organization_id = p_organization_id
      and m.status = 'active'
      and now() >= m.effective_from
      and (m.effective_until is null or now() < m.effective_until)
      and (s.all_branches or s.branch_id = p_branch_id)
  );
$$;

comment on function datatek_platform.org_branch_scope_allows(uuid, uuid) is
  'No enviar branch nunca significa acceso universal; solo all_branches=true lo concede (sección 2.3).';

create function datatek_platform.has_active_platform_membership()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from platform_memberships pm
    where pm.user_id = datatek_platform.current_actor()
      and pm.status = 'active'
      and now() >= pm.effective_from
      and (pm.effective_until is null or now() < pm.effective_until)
  );
$$;

create function datatek_platform.effective_platform_permissions()
returns setof text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct prp.permission_key
  from platform_memberships pm
  join platform_membership_roles pmr on pmr.platform_membership_id = pm.id
  join platform_role_permissions prp on prp.platform_role_template_key = pmr.platform_role_template_key
  where pm.user_id = datatek_platform.current_actor()
    and pm.status = 'active'
    and now() >= pm.effective_from
    and (pm.effective_until is null or now() < pm.effective_until);
$$;

create function datatek_platform.has_platform_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from datatek_platform.effective_platform_permissions() perm
    where perm = p_permission
  );
$$;

create function datatek_platform.has_active_support_session(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from support_access_sessions s
    join platform_memberships pm on pm.id = s.platform_membership_id
    where pm.user_id = datatek_platform.current_actor()
      and s.organization_id = p_organization_id
      and s.status = 'active'
      and s.revoked_at is null
      and now() >= s.starts_at
      and now() < s.expires_at
  );
$$;

comment on function datatek_platform.has_active_support_session(uuid) is
  'Sesión "active" pasado expires_at o con revoked_at no cuenta como elevada (sección 2.5, sección 10 dominio).';

-- ===========================================================================
-- 19. RLS + grants
-- ===========================================================================
-- Principios (sección 6.1): RLS en cada tabla expuesta; anon sin escritura;
-- authenticated sin escritura general; Service Role solo en
-- worker/operación interna controlada.

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema datatek_platform from public, anon, authenticated;

alter table user_profiles enable row level security;
alter table organizations enable row level security;
alter table organization_slug_history enable row level security;
alter table organization_branches enable row level security;
alter table permissions enable row level security;
alter table role_templates enable row level security;
alter table role_template_permissions enable row level security;
alter table organization_memberships enable row level security;
alter table membership_roles enable row level security;
alter table membership_branch_scopes enable row level security;
alter table organization_settings enable row level security;
alter table organization_counters enable row level security;
alter table platform_memberships enable row level security;
alter table platform_role_templates enable row level security;
alter table platform_role_permissions enable row level security;
alter table platform_membership_roles enable row level security;
alter table support_access_sessions enable row level security;

alter table user_profiles force row level security;
alter table organizations force row level security;
alter table organization_slug_history force row level security;
alter table organization_branches force row level security;
alter table organization_memberships force row level security;
alter table membership_roles force row level security;
alter table membership_branch_scopes force row level security;
alter table organization_settings force row level security;
alter table organization_counters force row level security;
alter table platform_memberships force row level security;
alter table platform_membership_roles force row level security;
alter table support_access_sessions force row level security;

grant usage on schema public to authenticated, anon;
grant execute on function datatek_platform.current_actor() to authenticated;
grant execute on function datatek_platform.has_active_org_membership(uuid) to authenticated;
grant execute on function datatek_platform.effective_org_permissions(uuid) to authenticated;
grant execute on function datatek_platform.has_org_permission(uuid, text) to authenticated;
grant execute on function datatek_platform.org_branch_scope_allows(uuid, uuid) to authenticated;
grant execute on function datatek_platform.has_active_platform_membership() to authenticated;
grant execute on function datatek_platform.effective_platform_permissions() to authenticated;
grant execute on function datatek_platform.has_platform_permission(text) to authenticated;
grant execute on function datatek_platform.has_active_support_session(uuid) to authenticated;

-- --- user_profiles: el titular lee/actualiza su propio perfil seguro ------
grant select (user_id, display_name, locale, timezone, status, created_at, updated_at)
  on user_profiles to authenticated;
grant update (display_name, locale, timezone) on user_profiles to authenticated;

create policy user_profiles_select_self on user_profiles
  for select to authenticated
  using (user_id = datatek_platform.current_actor());

create policy user_profiles_update_self on user_profiles
  for update to authenticated
  using (user_id = datatek_platform.current_actor())
  with check (user_id = datatek_platform.current_actor());

-- --- organizations: miembro activo lee su organización -------------------
grant select on organizations to authenticated;

create policy organizations_select_member on organizations
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(id)
    or datatek_platform.has_active_platform_membership()
  );

-- No hay policy de insert/update/delete directa: mutación por comando de
-- aplicación con service role (sección 6.1: "mutaciones sensibles por
-- aplicación/función estrecha").

-- --- organization_slug_history: mismo criterio que organizations ---------
grant select on organization_slug_history to authenticated;

create policy organization_slug_history_select_member on organization_slug_history
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or datatek_platform.has_active_platform_membership()
  );

-- --- organization_branches: miembro ve sucursales de su organización -----
grant select on organization_branches to authenticated;

create policy organization_branches_select_member on organization_branches
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or datatek_platform.has_active_platform_membership()
  );

-- --- permissions / role_templates / role_template_permissions ------------
-- Catálogo público de solo-lectura para cualquier autenticado (no hay PII,
-- no hay tenant): necesario para que Pro resuelva labels de permisos.
grant select on permissions to authenticated;
grant select on role_templates to authenticated;
grant select on role_template_permissions to authenticated;

create policy permissions_select_authenticated on permissions
  for select to authenticated using (true);
create policy role_templates_select_authenticated on role_templates
  for select to authenticated using (true);
create policy role_template_permissions_select_authenticated on role_template_permissions
  for select to authenticated using (true);

-- --- organization_memberships ---------------------------------------------
grant select on organization_memberships to authenticated;

create policy organization_memberships_select_self_or_manager on organization_memberships
  for select to authenticated
  using (
    user_id = datatek_platform.current_actor()
    or datatek_platform.has_org_permission(organization_id, 'membership.read')
    or datatek_platform.has_active_platform_membership()
  );

-- --- membership_roles ------------------------------------------------------
grant select on membership_roles to authenticated;

create policy membership_roles_select on membership_roles
  for select to authenticated
  using (
    exists (
      select 1 from organization_memberships m
      where m.id = membership_roles.membership_id
        and (
          m.user_id = datatek_platform.current_actor()
          or datatek_platform.has_org_permission(m.organization_id, 'membership.read')
          or datatek_platform.has_active_platform_membership()
        )
    )
  );

-- --- membership_branch_scopes ----------------------------------------------
grant select on membership_branch_scopes to authenticated;

create policy membership_branch_scopes_select on membership_branch_scopes
  for select to authenticated
  using (
    exists (
      select 1 from organization_memberships m
      where m.id = membership_branch_scopes.membership_id
        and (
          m.user_id = datatek_platform.current_actor()
          or datatek_platform.has_org_permission(m.organization_id, 'membership.read')
          or datatek_platform.has_active_platform_membership()
        )
    )
  );

-- --- organization_settings / organization_counters ------------------------
grant select on organization_settings to authenticated;
grant select on organization_counters to authenticated;

create policy organization_settings_select_member on organization_settings
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or datatek_platform.has_active_platform_membership()
  );

create policy organization_counters_select_member on organization_counters
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or datatek_platform.has_active_platform_membership()
  );

-- --- platform_* : solo Control, membresía de organización NO concede nada -
grant select on platform_memberships to authenticated;
grant select on platform_role_templates to authenticated;
grant select on platform_role_permissions to authenticated;
grant select on platform_membership_roles to authenticated;

create policy platform_memberships_select_self_or_admin on platform_memberships
  for select to authenticated
  using (
    user_id = datatek_platform.current_actor()
    or datatek_platform.has_platform_permission('platform.support.manage')
  );

create policy platform_role_templates_select_platform on platform_role_templates
  for select to authenticated
  using (datatek_platform.has_active_platform_membership());

create policy platform_role_permissions_select_platform on platform_role_permissions
  for select to authenticated
  using (datatek_platform.has_active_platform_membership());

create policy platform_membership_roles_select_platform on platform_membership_roles
  for select to authenticated
  using (
    exists (
      select 1 from platform_memberships pm
      where pm.id = platform_membership_roles.platform_membership_id
        and (
          pm.user_id = datatek_platform.current_actor()
          or datatek_platform.has_platform_permission('platform.support.manage')
        )
    )
  );

-- --- support_access_sessions -----------------------------------------------
-- Actor ve sus propias requests; lectura de contenido tenant exige sesión
-- activa y scope compatible (aplicado en las policies de negocio que se
-- agreguen a partir de R0-D, no aquí — R0-C no tiene tablas de negocio).
grant select on support_access_sessions to authenticated;

create policy support_access_sessions_select_own_or_admin on support_access_sessions
  for select to authenticated
  using (
    exists (
      select 1 from platform_memberships pm
      where pm.id = support_access_sessions.platform_membership_id
        and pm.user_id = datatek_platform.current_actor()
    )
    or datatek_platform.has_platform_permission('platform.support.manage')
  );

-- Ninguna tabla recibe insert/update/delete para `authenticated` o `anon`:
-- toda mutación sensible pasa por un comando de aplicación ejecutado con
-- Service Role (nunca expuesto al navegador — sección 6.1, sección 11).

comment on schema datatek_platform is
  'Platform-internal helpers y funciones RLS security definer de R0-C en adelante (search_path fijo, sin PII, sin recursión).';
