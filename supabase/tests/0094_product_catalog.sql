-- Datatek — pgTAP: migración 0094 (catálogo de productos).
--
-- Cobertura: aislamiento por organización (a diferencia de 0040, aquí SÍ
-- hay organization_id real desde el inicio) y el contrato de price_mode
-- reutilizado de service_catalog_versions.

begin;
select plan(9);

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- IDs de supabase/seeds/local_actors.sql:
-- producto DTEK con stock:    83000000-0000-0000-0000-000000000001
-- producto DTEK sin stock:    83000000-0000-0000-0000-000000000002
-- producto Taller Demo:       83000000-0000-0000-0000-000000000003
-- advisor DTEK (parts.read):  00000000-0000-0000-0000-0000000000a2
-- owner Taller Demo:          00000000-0000-0000-0000-0000000000b1

-- 1. advisor DTEK (parts.read) lee el catálogo de productos de su org.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from product_catalog_items where organization_id = '10000000-0000-0000-0000-000000000001'),
  2,
  'advisor DTEK ve los 2 productos de su organización'
);

-- 2. advisor DTEK NO ve el producto de Taller Demo — aislamiento entre
-- organizaciones, el caso que 0040 (catálogo neutral) no puede probar.
select is(
  (select count(*)::int from product_catalog_items where id = '83000000-0000-0000-0000-000000000003'),
  0,
  'advisor DTEK no lee el producto de Taller Demo'
);

-- 3. Un actor sin membership activa no lee ningún producto.
select pg_temp.as_user(gen_random_uuid());
select is(
  (select count(*)::int from product_catalog_items),
  0,
  'un actor sin membership activa no lee ningún producto'
);

-- 4. owner Taller Demo lee su propio producto.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from product_catalog_items where id = '83000000-0000-0000-0000-000000000003'),
  1,
  'owner Taller Demo lee su propio producto'
);

-- 5. quantity_on_hand=0 es un estado válido y visible (agotado, no oculto).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  (select quantity_on_hand from product_catalog_versions where catalog_item_id = '83000000-0000-0000-0000-000000000002'),
  0::numeric,
  'un producto sin existencia sigue siendo legible (quantity_on_hand=0, no una fila oculta)'
);

-- 6. authenticated con solo parts.read no puede insertar en el catálogo.
select throws_ok(
  $$ insert into product_catalog_items (organization_id, category, name)
     values ('10000000-0000-0000-0000-000000000001', 'test', 'Producto sin permiso') $$,
  '42501',
  null,
  'advisor DTEK (solo parts.read) no puede insertar en product_catalog_items'
);

-- 7–9: los constraints exactos de price_mode (idénticos a
-- service_catalog_versions) se prueban con el rol dueño de la prueba, mismo
-- patrón que supabase/tests/0040_catalog.sql.
reset role;

insert into product_catalog_items (id, organization_id, category, name)
values ('83000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000001', 'test', 'Item de prueba de constraints');

select throws_ok(
  $$ insert into product_catalog_versions (organization_id, catalog_item_id, version_number, price_mode, currency)
     values ('10000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-00000000000f', 1, 'fixed', 'GTQ') $$,
  '23514',
  null,
  'price_mode=fixed sin fixed_amount viola el constraint de sección 4.15'
);

select throws_ok(
  $$ insert into product_catalog_versions (organization_id, catalog_item_id, version_number, price_mode, range_min, range_max, currency)
     values ('10000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-00000000000f', 2, 'range', 100, 50, 'GTQ') $$,
  '23514',
  null,
  'price_mode=range con range_min > range_max viola el constraint (min <= max)'
);

select lives_ok(
  $$ insert into product_catalog_versions (organization_id, catalog_item_id, version_number, price_mode, quantity_on_hand)
     values ('10000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-00000000000f', 3, 'diagnosis_required', 0) $$,
  'price_mode=diagnosis_required sin monto ni moneda es válido, igual que en servicios'
);

select * from finish();
rollback;
