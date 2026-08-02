-- Datatek — pgTAP: migración 0070 (inspección y evidencia).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — misma situación
-- que supabase/tests/0020_crm.sql (ver su cabecera).
-- `implemented_pending_environment_evidence`.
--
-- Cobertura: DATATEK_R0_D secciones 9–10 y sección 19 (puerta de
-- aceptación — "inspección de frenos es estructurada", "evidencia internal
-- nunca llega a Pass"). IDs de supabase/seeds/local_actors.sql:
--   inspección DTEK:      82000000-0000-0000-0000-000000000001
--   asset visibility_max=internal: 82000000-0000-0000-0000-000000000007
--   link con visibility=customer:  82000000-0000-0000-0000-000000000008

begin;
select plan(11);

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- 1. El seed de la migración demuestra el template mínimo completo —
-- sección 19: "inspección de frenos es estructurada" — 12 items en total.
reset role;
select is(
  (select count(*)::int from inspection_template_items i
     join inspection_template_versions v on v.id = i.template_version_id
     join inspection_templates t on t.id = v.template_id
   where t.key = 'brakes' and v.version_number = 1),
  12,
  'el template de frenos v1 tiene los 12 items literales de R0-A sección 7.2'
);

-- 2. Los 4 items que requieren medición explícita (pastillas x2, disco
-- medido, disco mínimo) están marcados requires_measurement.
select is(
  (select count(*)::int from inspection_template_items i
     join inspection_template_versions v on v.id = i.template_version_id
     join inspection_templates t on t.id = v.template_id
   where t.key = 'brakes' and v.version_number = 1 and i.requires_measurement),
  4,
  'exactamente 4 items del template de frenos requieren medición numérica'
);

-- 3. inspector DTEK (inspection.read) lee la inspección de su organización.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from inspections where id = '82000000-0000-0000-0000-000000000001'),
  1,
  'inspector DTEK lee la inspección de su organización'
);

-- 4. inspector DTEK (evidence.read_internal) lee el evidence_asset interno.
select is(
  (select count(*)::int from evidence_assets where id = '82000000-0000-0000-0000-000000000007'),
  1,
  'inspector DTEK (evidence.read_internal) lee el evidence_asset'
);

-- 5. owner Taller Demo NO lee la inspección/evidencia de DTEK.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from inspections where id = '82000000-0000-0000-0000-000000000001'),
  0,
  'owner Taller Demo no lee la inspección de DTEK'
);
select is(
  (select count(*)::int from evidence_assets where id = '82000000-0000-0000-0000-000000000007'),
  0,
  'owner Taller Demo no lee el evidence_asset de DTEK'
);

reset role;

-- 6. not_inspected sin motivo viola el constraint de sección 7.2.
select throws_ok(
  $$ insert into inspection_results (organization_id, inspection_id, template_item_id, axle, side, condition, provenance, actor_id, measured_at)
     select '10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', i.id, 'rear', 'left', 'not_inspected', 'observed', '00000000-0000-0000-0000-0000000000a3', now()
     from inspection_template_items i where i.item_key = 'caliper_condition' $$,
  '23514',
  'condition=not_inspected sin notes viola el constraint de motivo obligatorio'
);

-- 7. not_inspected CON motivo es válido.
select lives_ok(
  $$ insert into inspection_results (organization_id, inspection_id, template_item_id, axle, side, condition, provenance, notes, actor_id, measured_at)
     select '10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', i.id, 'rear', 'left', 'not_inspected', 'observed', 'Rueda trasera izquierda no se pudo levantar por falta de gato compatible.', '00000000-0000-0000-0000-0000000000a3', now()
     from inspection_template_items i where i.item_key = 'caliper_condition' $$,
  'condition=not_inspected con notes es válido'
);

-- 8. Registrar axle sin side (o viceversa) viola la coherencia mínima
-- eje/lado a nivel DB.
select throws_ok(
  $$ insert into inspection_results (organization_id, inspection_id, template_item_id, axle, side, condition, provenance, actor_id, measured_at)
     select '10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', i.id, 'front', null, 'pass', 'observed', '00000000-0000-0000-0000-0000000000a3', now()
     from inspection_template_items i where i.item_key = 'hoses_condition' $$,
  '23514',
  'axle sin side (o viceversa) viola el constraint de coherencia eje/lado'
);

-- 9. maintenance_recommendations: trigger_kind='date' sin due_at viola el
-- constraint EXACTO de R0-A sección 4.15.
select throws_ok(
  $$ insert into maintenance_recommendations (organization_id, case_id, vehicle_id, trigger_kind, basis_kind, actor_id)
     values ('10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', 'date', 'manufacturer', '00000000-0000-0000-0000-0000000000a3') $$,
  '23514',
  'trigger_kind=date sin due_at viola el constraint de sección 4.15'
);

-- 10. trigger_kind='condition' sin customer_explanation también viola el
-- constraint — es la forma que debe tomar toda recomendación 'unknown'.
select throws_ok(
  $$ insert into maintenance_recommendations (organization_id, case_id, vehicle_id, trigger_kind, basis_kind, status, actor_id)
     values ('10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', 'condition', 'inspection', 'unknown', '00000000-0000-0000-0000-0000000000a3') $$,
  '23514',
  'trigger_kind=condition sin customer_explanation viola el constraint (así se modela una recomendación unknown)'
);

-- 11. `authenticated` no puede insertar evidence_assets directamente — el
-- ciclo de upload intent pasa por comandos de aplicación con Service Role.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$ insert into evidence_assets (organization_id, upload_intent_id, bucket, path, mime_declared, visibility_max)
     values ('10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000006', 'evidence-dtek', 'x', 'image/jpeg', 'internal') $$,
  '42501',
  'authenticated no puede insertar directamente en evidence_assets'
);

select * from finish();
rollback;
