-- Datatek — pgTAP: migración 0050 (intake y casos).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — misma situación
-- que supabase/tests/0020_crm.sql (ver su cabecera).
-- `implemented_pending_environment_evidence`.
--
-- Cobertura: DATATEK_R0_D sección 7 y sección 19 (puerta de aceptación).
-- IDs de supabase/seeds/local_actors.sql (extendido en esta fase):
--   caso DTEK:                  80000000-0000-0000-0000-000000000005
--   caso Taller Demo:           80000000-0000-0000-0000-000000000006
--   nota internal (DTEK):       80000000-0000-0000-0000-00000000000c
--   nota customer (DTEK):       80000000-0000-0000-0000-00000000000d
--   advisor DTEK (intake.manage): 00000000-0000-0000-0000-0000000000a2
--   cliente vinculado DTEK:       00000000-0000-0000-0000-0000000000a6

begin;
select plan(10);

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- 1. Advisor DTEK (intake.read) lee el caso de su organización.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from cases where id = '80000000-0000-0000-0000-000000000005'),
  1,
  'advisor DTEK lee el caso de su propia organización'
);

-- 2. Advisor DTEK NO lee el caso de Taller Demo, aunque conozca el UUID.
select is(
  (select count(*)::int from cases where id = '80000000-0000-0000-0000-000000000006'),
  0,
  'advisor DTEK no lee el caso de Taller Demo'
);

-- 3. Advisor DTEK (intake.manage) lee ambas notas del caso.
select is(
  (select count(*)::int from case_notes where case_id = '80000000-0000-0000-0000-000000000005'),
  2,
  'advisor DTEK (intake.manage) lee las dos notas del caso, internal y customer'
);

-- 4. Cliente vinculado DTEK NO lee case_notes en absoluto — la policy de
-- base solo concede intake.manage o soporte elevado (sección 7: "una nota
-- internal nunca se proyecta a Pass"; la proyección filtrada de notas
-- customer es responsabilidad de un query contract de fase futura).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select is(
  (select count(*)::int from case_notes where case_id = '80000000-0000-0000-0000-000000000005'),
  0,
  'cliente vinculado DTEK no lee case_notes directamente vía RLS de base'
);

-- 5. Cliente vinculado SÍ lee su propio caso.
select is(
  (select count(*)::int from cases where id = '80000000-0000-0000-0000-000000000005'),
  1,
  'cliente vinculado DTEK lee su propio caso'
);

-- 6. Cliente vinculado ve el historial de estado de su caso.
select is(
  (select count(*)::int from case_status_events where case_id = '80000000-0000-0000-0000-000000000005'),
  2,
  'cliente vinculado DTEK lee el historial de estado de su caso'
);

reset role;

-- 7. El folio es único por organización — un segundo caso con el mismo
-- folio_number en la MISMA organización viola el constraint.
select throws_ok(
  $$ insert into cases (organization_id, folio_number, folio_code, customer_id, vehicle_id)
     values ('10000000-0000-0000-0000-000000000001', 1, '2026-00001-dup',
       '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001') $$,
  '23505',
  'folio_number duplicado en la misma organización viola unique(organization_id, folio_number)'
);

-- 8. La MISMA folio_number en OTRA organización es válida (folio es local,
-- nunca global) — ya sembrado en el seed (caso Taller Demo también usa
-- folio_number=1) y no lanzó error al insertarse; se reafirma aquí.
select is(
  (select folio_number::int from cases where id = '80000000-0000-0000-0000-000000000006'),
  1,
  'folio_number=1 es válido para Taller Demo aunque DTEK también use folio_number=1 (folio local, nunca global)'
);

-- 9. datatek_platform.next_organization_counter avanza atómicamente y
-- nunca repite un valor ya emitido.
select isnt(
  datatek_platform.next_organization_counter('10000000-0000-0000-0000-000000000001', 'case_folio'),
  datatek_platform.next_organization_counter('10000000-0000-0000-0000-000000000001', 'case_folio'),
  'next_organization_counter nunca repite un valor para la misma organización/counter_key'
);

-- 10. `authenticated` no puede insertar directamente en cases — toda
-- creación de caso pasa por CreateCaseFromIntake con Service Role.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ insert into cases (organization_id, folio_number, folio_code, customer_id, vehicle_id)
     values ('10000000-0000-0000-0000-000000000001', 999, '2026-00999',
       '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001') $$,
  '42501',
  'authenticated no puede insertar directamente en cases'
);

select * from finish();
rollback;
