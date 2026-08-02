-- Datatek — migración 0020: CRM (R0-D Fase 1, ola `0020`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO. Esta
-- sandbox no tiene Docker Desktop ni Supabase CLI ejecutable localmente
-- (ver docs/runbooks/database-reset.md). El SQL es completo y se considera
-- correcto por revisión estática — su ejecución contra Postgres real queda
-- como `implemented_pending_environment_evidence` hasta que una sesión
-- futura con Docker corra:
--   pnpm db:reset
--   pnpm test:db   (pgTAP, incluyendo supabase/tests/0020_crm.sql)
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección 4
-- (CRM) y DATATEK_R0_A_CONTRACT_PACK.md sección 4.3 (5 tablas), 4.13, 4.14.
-- Reusa los helpers `datatek_platform.*` creados en 0000/0010 — no
-- duplica RLS/tenancy, solo aplica esos helpers a tablas de negocio nuevas.
--
-- Diseño: `customers` es local a la organización — nunca global (R0-A
-- sección 4.13: "customers -> organizations: relación local, nunca
-- global"). Todo lo que cuelga de un cliente hereda `organization_id`
-- verificado con una FK compuesta contra `(customers.id,
-- customers.organization_id)`, exactamente el patrón que
-- `membership_branch_scopes` ya usa en 0010 para sucursales.

-- ===========================================================================
-- 1. customers
-- ===========================================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  customer_type text not null default 'person' check (customer_type in ('person', 'company')),
  -- 'provisional': sin cuenta vinculada todavía (sección 4: "sin cuenta
  -- obligatoria"). 'active': tiene al menos un customer_auth_links
  -- verificado. 'inactive': archivado por el taller.
  status text not null default 'provisional' check (status in ('provisional', 'active', 'inactive')),
  -- p.ej. 'whatsapp_manual', 'walk_in', 'referral', 'import'.
  source text not null check (btrim(source) <> ''),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (id, organization_id)
);

comment on table customers is
  'Cliente local de una organización — nunca global (R0-A sección 4.13). Puede existir sin cuenta (status=provisional) indefinidamente.';

create trigger customers_set_updated_at
  before update on customers
  for each row execute function datatek_platform.set_updated_at();

create index customers_org_idx on customers (organization_id);
create index customers_org_status_idx on customers (organization_id, status);

-- ===========================================================================
-- 2. customer_contacts
-- ===========================================================================
-- "protegidos contra enumeración; sin deduplicación pública entre
-- talleres" (sección 4): deliberadamente SIN unique constraint sobre
-- normalized_value — un índice único lanzaría un error de "ya existe" que
-- confirmaría a un actor que un teléfono/correo ya está registrado (por
-- otro cliente, posiblemente en otra fila que ni siquiera puede leer). La
-- deduplicación real es tarea de Control (R0-D sección 5, aplicado también
-- aquí por analogía: "fusión de duplicados queda para Control").

create table customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  channel text not null check (channel in ('phone', 'whatsapp', 'email')),
  normalized_value text not null check (btrim(normalized_value) <> ''),
  raw_value text not null check (btrim(raw_value) <> ''),
  verified boolean not null default false,
  verified_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  check (verified = (verified_at is not null)),
  foreign key (customer_id, organization_id) references customers (id, organization_id) on delete cascade
);

comment on table customer_contacts is
  'Canales de contacto normalizados por tenant. Sin unique en normalized_value a propósito — ver comentario arriba (protección contra enumeración).';

-- Índice de búsqueda (no unique) — soporta lookup rápido sin exponer
-- existencia vía constraint violation.
create index customer_contacts_org_channel_value_idx
  on customer_contacts (organization_id, channel, normalized_value);
create index customer_contacts_customer_idx on customer_contacts (customer_id);

-- ===========================================================================
-- 3. customer_auth_links
-- ===========================================================================

create table customer_auth_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'revoked')),
  verification_method text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  check (status <> 'verified' or verified_at is not null),
  foreign key (customer_id, organization_id) references customers (id, organization_id) on delete cascade
);

comment on table customer_auth_links is
  'Vínculo verificado cliente<->cuenta (sección 4: "requiere verificación; no fusiona clientes de otros talleres; deja auditoría").';

create index customer_auth_links_customer_idx on customer_auth_links (customer_id);
create index customer_auth_links_user_idx on customer_auth_links (user_id);

-- "no fusiona clientes de otros talleres": dentro de UNA organización, un
-- usuario no puede tener más de un vínculo VERIFICADO activo (revoked_at
-- null) apuntando a customers distintos — eso fusionaría dos identidades
-- locales detrás de una cuenta. Vincularse a un customer de OTRA
-- organización no está restringido por este índice (customers distintos,
-- relación local distinta).
create unique index customer_auth_links_one_verified_per_user_org_idx
  on customer_auth_links (organization_id, user_id)
  where status = 'verified' and revoked_at is null;

-- ===========================================================================
-- 4. customer_consents
-- ===========================================================================

create table customer_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  consent_type text not null check (
    consent_type in ('marketing_communications', 'data_processing', 'service_terms')
  ),
  granted boolean not null,
  recorded_at timestamptz not null default now(),
  -- p.ej. 'staff_manual', 'customer_self_service', 'whatsapp_manual'.
  source text not null check (btrim(source) <> ''),
  actor_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (customer_id, organization_id) references customers (id, organization_id) on delete cascade
);

comment on table customer_consents is
  'Historial append-only de consentimientos por tipo. Un nuevo registro nunca sobrescribe uno anterior — ambos quedan como hechos.';

create index customer_consents_customer_idx on customer_consents (customer_id);
create index customer_consents_org_idx on customer_consents (organization_id);

-- ===========================================================================
-- 5. customer_communication_preferences
-- ===========================================================================

create table customer_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'phone_call')),
  opted_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (customer_id, organization_id) references customers (id, organization_id) on delete cascade,
  unique (customer_id, channel)
);

comment on table customer_communication_preferences is
  'Preferencia vigente por canal (1 fila por cliente+canal). El historial de cambios vive en audit_events (ola 0085), no aquí.';

create trigger customer_communication_preferences_set_updated_at
  before update on customer_communication_preferences
  for each row execute function datatek_platform.set_updated_at();

create index customer_communication_preferences_customer_idx
  on customer_communication_preferences (customer_id);

-- ===========================================================================
-- 6. Helper RLS — visibilidad "propio cliente"
-- ===========================================================================
-- `crm.read` (rol `customer`, sección 8 de 0010) NO significa "leer todos
-- los clientes del tenant" — solo el staff con `crm.manage` (owner/advisor)
-- ve el CRM completo. Un actor cuyo único vínculo es un
-- `customer_auth_links` verificado ve EXCLUSIVAMENTE su propia fila de
-- cliente y lo que cuelga de ella, igual que Pass solo ve su propio
-- vehículo/caso (sección 5, sección 13 dominio).

create function datatek_platform.actor_is_linked_customer(p_customer_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from customer_auth_links l
    where l.customer_id = p_customer_id
      and l.organization_id = p_organization_id
      and l.user_id = datatek_platform.current_actor()
      and l.status = 'verified'
      and l.revoked_at is null
  );
$$;

comment on function datatek_platform.actor_is_linked_customer(uuid, uuid) is
  'True only for the exact customer row a verified, non-revoked auth link ties the current actor to — never a tenant-wide grant.';

-- ===========================================================================
-- 7. RLS + grants
-- ===========================================================================
-- Mismo principio que 0010 (sección 6.1): RLS en cada tabla; anon sin
-- acceso; toda escritura pasa por un comando de aplicación con Service
-- Role — no hay policies de insert/update/delete para `authenticated`.
-- Lectura: staff con `crm.manage` ve todo el CRM de su organización; un
-- cliente vinculado ve solo su propia fila (helper arriba); soporte
-- elevado ve dentro de su sesión activa, igual que 0010.

revoke all on customers, customer_contacts, customer_auth_links, customer_consents,
  customer_communication_preferences from public, anon, authenticated;
revoke all on function datatek_platform.actor_is_linked_customer(uuid, uuid) from public, anon, authenticated;
grant execute on function datatek_platform.actor_is_linked_customer(uuid, uuid) to authenticated;

alter table customers enable row level security;
alter table customer_contacts enable row level security;
alter table customer_auth_links enable row level security;
alter table customer_consents enable row level security;
alter table customer_communication_preferences enable row level security;

alter table customers force row level security;
alter table customer_contacts force row level security;
alter table customer_auth_links force row level security;
alter table customer_consents force row level security;
alter table customer_communication_preferences force row level security;

grant select on customers to authenticated;
grant select on customer_contacts to authenticated;
grant select on customer_auth_links to authenticated;
grant select on customer_consents to authenticated;
grant select on customer_communication_preferences to authenticated;

create policy customers_select on customers
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'crm.manage')
    or datatek_platform.actor_is_linked_customer(id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy customer_contacts_select on customer_contacts
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'crm.manage')
    or datatek_platform.actor_is_linked_customer(customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy customer_auth_links_select on customer_auth_links
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'crm.manage')
    or datatek_platform.actor_is_linked_customer(customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy customer_consents_select on customer_consents
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'crm.manage')
    or datatek_platform.actor_is_linked_customer(customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy customer_communication_preferences_select
  on customer_communication_preferences
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'crm.manage')
    or datatek_platform.actor_is_linked_customer(customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- Nota: `crm.read` (rol `customer`, sección 8 de 0010) por sí solo NO
-- concede lectura aquí — ver el helper `actor_is_linked_customer` arriba.
-- Esto es deliberado: el permiso aditivo describe "puede leer CRM en
-- principio"; la policy decide el alcance exacto (una fila propia, no el
-- tenant completo), igual que `org_branch_scope_allows` acota
-- `membership.read`-adyacentes en 0010 sin ampliarlos a "todas las
-- sucursales" por defecto.
