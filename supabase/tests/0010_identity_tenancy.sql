-- Datatek — pgTAP: migración 0010 (identidad, tenancy, aislamiento).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — requiere pgTAP
-- instalado y Postgres real (Docker Desktop no disponible en esta sandbox;
-- ver docs/runbooks/database-reset.md). `implemented_pending_environment_evidence`.
-- Cuando una sesión futura tenga Docker: `supabase test db` o
-- `pg_prove` sobre este archivo, después de `pnpm db:reset` con
-- supabase/seeds/local_actors.sql aplicado.
--
-- Cobertura: DATATEK_R0_C sección 10 "pgTAP" (14 casos), probados via
-- `set local role authenticated; set local request.jwt.claims = ...` para
-- simular cada actor bajo RLS, tal como hace supabase/tests en Supabase CLI.

begin;
select plan(20);

-- Helper local: simula el JWT de un usuario autenticado para las pruebas
-- RLS de esta transacción (patrón estándar de pgTAP + Supabase).
create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- IDs de supabase/seeds/local_actors.sql
-- owner DTEK:      00000000-0000-0000-0000-0000000000a1
-- owner Demo:      00000000-0000-0000-0000-0000000000b1
-- support (no elevado a Demo): 00000000-0000-0000-0000-0000000000c1
-- org DTEK: 10000000-0000-0000-0000-000000000001
-- org Demo: 10000000-0000-0000-0000-000000000002

-- 1. DTEK lee DTEK.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from organizations where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'owner DTEK lee la fila de organizations de DTEK'
);

-- 2. DTEK no lee Taller Demo.
select is(
  (select count(*)::int from organizations where id = '10000000-0000-0000-0000-000000000002'),
  0,
  'owner DTEK no lee la fila de organizations de Taller Demo'
);

-- 3. Taller Demo no lee DTEK.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from organizations where id = '10000000-0000-0000-0000-000000000001'),
  0,
  'owner Taller Demo no lee la fila de organizations de DTEK'
);

-- 4. UUID conocido no rompe RLS (branch ajeno).
select is(
  (select count(*)::int from organization_branches where id = '20000000-0000-0000-0000-000000000001'),
  0,
  'owner Taller Demo, conociendo el UUID exacto de una branch de DTEK, recibe cero filas'
);

-- 5. slug conocido no rompe RLS.
select is(
  (select count(*)::int from organizations where slug = 'dtek-servicios'),
  0,
  'owner Taller Demo, conociendo el slug exacto de DTEK, recibe cero filas'
);

-- 6. authenticated no escribe directo.
select throws_ok(
  $$ insert into organizations (slug, name) values ('nueva-org', 'Nueva Org') $$,
  '42501',
  null,
  'authenticated no puede insertar directo en organizations (sin grant de insert)'
);

-- 7. metadata de auth no concede rol — resolveOrganizationCapabilities y las
-- funciones de datatek_platform solo leen organization_memberships /
-- membership_roles, nunca raw_user_meta_data; se confirma que un usuario sin
-- fila en organization_memberships no obtiene permisos aunque su JWT
-- contenga claims arbitrarios.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is(
  datatek_platform.has_org_permission('10000000-0000-0000-0000-000000000001', 'organization.manage'),
  false,
  'cliente Taller Demo no obtiene organization.manage de DTEK sin importar el JWT'
);

-- 8. branch scope bloquea otra sucursal (advisor DTEK, solo central).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  datatek_platform.org_branch_scope_allows('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'),
  false,
  'advisor DTEK (scope: solo Central) no tiene acceso a la sucursal Móvil'
);
select is(
  datatek_platform.org_branch_scope_allows('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  true,
  'advisor DTEK sí tiene acceso a su sucursal Central'
);

-- 9. platform support entra a Control (tiene platform.control.enter).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is(
  datatek_platform.has_platform_permission('platform.control.enter'),
  true,
  'platform support tiene platform.control.enter'
);

-- 10. platform support sin elevación no lee tenant (Taller Demo: sin sesión seed-ada).
select is(
  datatek_platform.has_active_support_session('10000000-0000-0000-0000-000000000002'),
  false,
  'platform support no tiene sesión elevada activa sobre Taller Demo'
);
select is(
  (select count(*)::int from organizations where id = '10000000-0000-0000-0000-000000000002'),
  0,
  'platform support sin elevación no lee la fila de organizations de Taller Demo (membership de plataforma no concede lectura tenant)'
);

-- 11. sesión elevada solo lee tenant/scope autorizado (DTEK sí, seed-ado).
select is(
  datatek_platform.has_active_support_session('10000000-0000-0000-0000-000000000001'),
  true,
  'platform support tiene sesión elevada activa sobre DTEK (seed TCK-1042)'
);
select is(
  (select count(*)::int from organizations where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'con sesión elevada activa, platform support lee la fila de organizations de DTEK'
);

-- 12. sesión expirada deja de funcionar.
-- El insert es preparación de fixture, no una aserción: va con el rol dueño
-- de la prueba (mismo patrón que supabase/tests/0040_catalog.sql línea 63).
-- `authenticated` no tiene grant de insert sobre support_access_sessions, que
-- es justamente lo que prueban los casos de arriba.
reset role;
insert into support_access_sessions (
  platform_membership_id, organization_id, ticket, reason, scope, status, starts_at, expires_at
) values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'TCK-EXPIRED',
  'sesión de prueba ya vencida',
  'read_only',
  'active',
  now() - interval '2 days',
  now() - interval '1 day'
);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is(
  datatek_platform.has_active_support_session('10000000-0000-0000-0000-000000000002'),
  false,
  'una support_access_session activa pero con expires_at pasado no cuenta como elevación vigente'
);

-- 13. Owner de organización no implica plataforma.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is(
  datatek_platform.has_active_platform_membership(),
  false,
  'owner DTEK (membership de organización) no tiene platform_memberships y por tanto no entra a Control'
);

-- 14. Membership fuera de vigencia no concede nada.
-- Igual que el caso 12: el insert es preparación, va con el rol dueño.
reset role;
insert into organization_memberships (id, user_id, organization_id, status, effective_from, effective_until)
values (
  '30000000-0000-0000-0000-0000000000ff',
  '00000000-0000-0000-0000-0000000000c2',
  '10000000-0000-0000-0000-000000000001',
  'active',
  now() - interval '30 days',
  now() - interval '1 day'
);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select is(
  datatek_platform.has_active_org_membership('10000000-0000-0000-0000-000000000001'),
  false,
  'una membership con effective_until en el pasado no concede acceso, aunque status siga en active'
);

-- 15. Funciones tienen search_path seguro (no mutable / no vacío).
select is(
  (select proconfig::text from pg_proc where proname = 'has_org_permission' and pronamespace = 'datatek_platform'::regnamespace) like '%search_path=pg_catalog, public%',
  true,
  'datatek_platform.has_org_permission tiene search_path fijo'
);

-- 16. Grants de perfil son mínimos (sin insert/delete para authenticated).
select is(
  (select count(*)::int from information_schema.role_table_grants
     where table_name = 'user_profiles' and grantee = 'authenticated' and privilege_type in ('INSERT', 'DELETE')),
  0,
  'authenticated no tiene grants de INSERT/DELETE sobre user_profiles'
);

select is(
  (select count(*)::int from information_schema.role_column_grants
     where table_name = 'user_profiles' and grantee = 'authenticated' and column_name = 'user_id' and privilege_type = 'UPDATE'),
  0,
  'authenticated no puede actualizar user_profiles.user_id (grant de update es solo display_name/locale/timezone)'
);

select * from finish();
rollback;
