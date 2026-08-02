-- Datatek — migración 0086: features (R0-D Fase 4a, ola `0086`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0000–0085 (ver sus cabeceras). Esta sandbox no tiene Docker
-- Desktop ni Supabase CLI ejecutable localmente. El SQL es completo y se
-- considera correcto por revisión estática; su ejecución contra Postgres
-- real queda como `implemented_pending_environment_evidence`.
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección 1
-- (tabla de olas: "0086: flags reales") y el propio requisito de esa
-- sección: "Un flag real y comprobable — no actives ninguna feature
-- inexistente"; DATATEK_R0_A_CONTRACT_PACK.md sección 4.11 (2 tablas).
--
-- Flag real de esta fase: `authorization_reissue`, que gatea el comando
-- nuevo `RevokeAndReprepareAuthorizationRequest`
-- (packages/application/src/commands/authorization-commands.ts,
-- `isFeatureEnabled`/`FEATURE_KEY_AUTHORIZATION_REISSUE` en
-- commands/state.ts). El seed de esta migración inserta exactamente esa
-- fila con `default_enabled = true` — ninguna otra feature se declara. La
-- prueba de que el flag realmente gatea algo (no solo existe en schema)
-- está en `authorization-commands.test.ts`
-- ("fails when the feature flag is disabled for the organization").
--
-- Diseño — global vs. por organización: `feature_flags` es un catálogo
-- neutral (sin `organization_id`), igual que `permissions`/`role_templates`
-- de 0010 — un flag se define UNA vez para toda la plataforma.
-- `feature_flag_overrides` es lo único que varía por organización: ausencia
-- de override = se usa `default_enabled`; una fila de override gana sobre
-- el default (mismo orden de resolución que `isFeatureEnabled` en
-- commands/state.ts).
--
-- R0-D Fase 4a no implementa un comando `SetFeatureFlagOverride` — solo el
-- seed mínimo y la lectura que `RevokeAndReprepareAuthorizationRequest`
-- hace internamente. Togglear un override hoy requiere una fila insertada a
-- mano (por seed o directamente en Postgres), documentado como pendiente en
-- docs/domain/query-contracts.md, mismo precedente que
-- `case_blockers`/`resource_schedules` en 0060 (tabla real, escritor
-- diferido, documentado — no un vacío accidental).

-- ===========================================================================
-- 1. feature_flags
-- ===========================================================================

create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (btrim(label) <> ''),
  description text not null default '',
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table feature_flags is
  'Catálogo neutral de flags (sección 1, ola 0086). Un flag real esta fase: authorization_reissue (seed abajo) — ningún flag inexistente se activa.';

create trigger feature_flags_set_updated_at
  before update on feature_flags
  for each row execute function datatek_platform.set_updated_at();

-- ===========================================================================
-- 2. feature_flag_overrides
-- ===========================================================================

create table feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  feature_flag_id uuid not null references feature_flags (id) on delete cascade,
  enabled boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, feature_flag_id)
);

comment on table feature_flag_overrides is
  'Override por organización — gana sobre feature_flags.default_enabled cuando existe. Ausencia de fila = se usa el default (sección 1, ola 0086).';

create index feature_flag_overrides_org_idx on feature_flag_overrides (organization_id);
create index feature_flag_overrides_flag_idx on feature_flag_overrides (feature_flag_id);

-- ===========================================================================
-- 3. Seed mínimo — el único flag real de esta fase
-- ===========================================================================

insert into feature_flags (key, label, description, default_enabled)
values (
  'authorization_reissue',
  'Reenvío de solicitud de autorización',
  'Permite revocar y volver a preparar una solicitud de autorización vigente sobre la misma versión congelada, sin reabrir el caso (RevokeAndReprepareAuthorizationRequest, Fase 4a).',
  true
);

-- ===========================================================================
-- 4. RLS + grants
-- ===========================================================================
-- feature_flags: catálogo público de solo-lectura para cualquier
-- autenticado (no hay PII, no hay tenant) — mismo patrón que
-- `permissions`/`role_templates` en 0010. feature_flag_overrides SÍ es
-- por-organización: legible por staff con `organization.read` (para que Pro
-- pueda mostrar "esta función está desactivada aquí") o soporte elevado
-- activo.

revoke all on feature_flags, feature_flag_overrides from public, anon, authenticated;

alter table feature_flags enable row level security;
alter table feature_flag_overrides enable row level security;

alter table feature_flags force row level security;
alter table feature_flag_overrides force row level security;

grant select on feature_flags to authenticated;
grant select on feature_flag_overrides to authenticated;

create policy feature_flags_select_authenticated on feature_flags
  for select to authenticated using (true);

create policy feature_flag_overrides_select on feature_flag_overrides
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'organization.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
    or datatek_platform.has_platform_permission('platform.feature.manage')
  );

-- Ninguna tabla recibe insert/update/delete para `authenticated` o `anon`:
-- toda mutación pasa por un comando de aplicación ejecutado con Service
-- Role (sección 6.1 R0-C, repetido en cada ola desde 0020). R0-D Fase 4a no
-- define ese comando todavía (ver nota de diseño arriba) — el seed de este
-- archivo es la única escritura que existe hoy.
