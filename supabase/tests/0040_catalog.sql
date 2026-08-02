-- Datatek — pgTAP: migración 0040 (catálogo).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — misma situación
-- que supabase/tests/0020_crm.sql (ver su cabecera).
-- `implemented_pending_environment_evidence`.
--
-- Cobertura: DATATEK_R0_D sección 6 y R0-A sección 4.15 (constraints
-- exactos de price_mode) y sección 19 (puerta de aceptación — "las cinco
-- modalidades de precio están demostradas sin universalizar monto").

begin;
select plan(9);

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- 1. El seed mínimo demuestra las cinco modalidades de precio.
select is(
  (select count(distinct price_mode)::int from service_catalog_versions),
  5,
  'el seed de 0040 demuestra las cinco modalidades de price_mode'
);

-- 2. Cualquier actor con catalog.read en alguna organización (aquí:
-- advisor DTEK) lee el catálogo neutral, sin importar que las filas no
-- tengan organization_id.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from service_catalog_items where key = 'brakes-inspection-visual'),
  1,
  'advisor DTEK (catalog.read) lee el catálogo neutral'
);

-- 3. Un usuario sin ninguna membership activa no lee el catálogo, aunque
-- sea "neutral" — neutral no significa público.
select pg_temp.as_user(gen_random_uuid());
select is(
  (select count(*)::int from service_catalog_items),
  0,
  'un actor sin membership activa no lee el catálogo neutral'
);

-- 4. `authenticated` no puede insertar directamente en el catálogo — solo
-- `platform.catalog.manage` (Control) administra el catálogo neutral, vía
-- comando de aplicación con Service Role, no expuesto aquí en R0-D Fase 1.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ insert into service_catalog_versions (catalog_item_id, version_number, price_mode, fixed_amount, currency)
     select id, 99, 'fixed', 100, 'GTQ' from service_catalog_items where key = 'brakes-inspection-visual' $$,
  '42501',
  'authenticated no puede insertar directamente en service_catalog_versions'
);

-- 5–9: los constraints exactos de price_mode (R0-A sección 4.15) se
-- prueban con el rol dueño de la prueba (bypassa RLS/grants) para aislar
-- el constraint del grant — mismo patrón que el caso 9 de
-- supabase/tests/0020_crm.sql. Se crea un item de prueba una sola vez y se
-- reutiliza por `key` en los casos siguientes.
reset role;

insert into service_catalog_items (key, category, name)
values ('test-price-mode-item', 'test', 'Item de prueba de constraints');

select throws_ok(
  $$ insert into service_catalog_versions (catalog_item_id, version_number, price_mode, currency)
     select id, 1, 'fixed', 'GTQ' from service_catalog_items where key = 'test-price-mode-item' $$,
  '23514',
  'price_mode=fixed sin fixed_amount viola el constraint de sección 4.15'
);

select throws_ok(
  $$ insert into service_catalog_versions (catalog_item_id, version_number, price_mode, from_amount, currency)
     select id, 2, 'range', 100, 'GTQ' from service_catalog_items where key = 'test-price-mode-item' $$,
  '23514',
  'price_mode=range con from_amount en vez de range_min/range_max viola el constraint'
);

select throws_ok(
  $$ insert into service_catalog_versions (catalog_item_id, version_number, price_mode, range_min, range_max, currency)
     select id, 3, 'range', 100, 50, 'GTQ' from service_catalog_items where key = 'test-price-mode-item' $$,
  '23514',
  'price_mode=range con range_min > range_max viola el constraint (min <= max)'
);

select throws_ok(
  $$ insert into service_catalog_versions (catalog_item_id, version_number, price_mode, fixed_amount)
     select id, 4, 'inspection_required', 100 from service_catalog_items where key = 'test-price-mode-item' $$,
  '23514',
  'price_mode=inspection_required con un monto presente viola el constraint (no requiere monto)'
);

select lives_ok(
  $$ insert into service_catalog_versions (catalog_item_id, version_number, price_mode)
     select id, 5, 'diagnosis_required' from service_catalog_items where key = 'test-price-mode-item' $$,
  'price_mode=diagnosis_required sin monto ni moneda es válido'
);

select * from finish();
rollback;
