-- Datatek — pgTAP: migración 0060 (agenda y reservas).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — misma situación
-- que supabase/tests/0020_crm.sql (ver su cabecera).
-- `implemented_pending_environment_evidence`.
--
-- Cobertura: DATATEK_R0_D sección 8 y sección 19 (puerta de aceptación —
-- "agenda impide double booking"). IDs de supabase/seeds/local_actors.sql:
--   recurso DTEK (Bahía 1):     81000000-0000-0000-0000-000000000001
--   cita DTEK (arrived):        81000000-0000-0000-0000-000000000004
--   reserva activa DTEK:        81000000-0000-0000-0000-000000000006
--     rango sembrado: 2026-07-31 14:00 — 15:00 UTC

begin;
select plan(8);

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- 1. Advisor DTEK (agenda.read) lee el recurso y la cita de su organización.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from resources where id = '81000000-0000-0000-0000-000000000001'),
  1,
  'advisor DTEK lee el recurso de su organización'
);
select is(
  (select count(*)::int from appointments where id = '81000000-0000-0000-0000-000000000004'),
  1,
  'advisor DTEK lee la cita de su organización'
);

-- 2. Advisor DTEK NO lee el recurso de Taller Demo.
select is(
  (select count(*)::int from resources where id = '81000000-0000-0000-0000-000000000002'),
  0,
  'advisor DTEK no lee el recurso de Taller Demo'
);

-- 3. Cliente vinculado ve la cita de su propio caso, sin agenda.read.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select is(
  (select count(*)::int from appointments where id = '81000000-0000-0000-0000-000000000004'),
  1,
  'cliente vinculado DTEK ve la cita de su propio caso'
);

reset role;

-- 4–6. EL constraint crítico de la ola: EXCLUDE USING gist impide
-- solapamiento en el MISMO recurso, pero permite reservas que NO se
-- solapan y reservas solapadas en OTRO recurso.

-- 4. Un rango que se solapa exactamente con la reserva sembrada, en el
-- MISMO recurso, es rechazado — "dos transacciones concurrentes no
-- reservan el mismo espacio" (sección 8).
select throws_ok(
  $$ insert into resource_reservations (organization_id, resource_id, appointment_id, status, starts_at, ends_at)
     values ('10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001',
       '81000000-0000-0000-0000-000000000004', 'active', '2026-07-31 14:30:00+00', '2026-07-31 15:30:00+00') $$,
  '23P01',
  'una reserva que se solapa en el mismo recurso viola resource_reservations_no_overlap (EXCLUDE)'
);

-- 5. Un rango adyacente ([15:00, 16:00) empezando exactamente donde
-- termina el existente [14:00,15:00)) es válido — el rango es
-- semi-abierto por la derecha, tal como exige sección 8.
select lives_ok(
  $$ insert into resource_reservations (organization_id, resource_id, appointment_id, status, starts_at, ends_at)
     values ('10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001',
       '81000000-0000-0000-0000-000000000004', 'active', '2026-07-31 15:00:00+00', '2026-07-31 16:00:00+00') $$,
  'un rango adyacente [15:00,16:00) sobre el mismo recurso es válido (rango semi-abierto)'
);

-- 6. El mismo rango solapado, pero en OTRO recurso, es válido — el
-- EXCLUDE es por (resource_id, rango), no solo por rango.
select lives_ok(
  $$ insert into resource_reservations (organization_id, resource_id, appointment_id, status, starts_at, ends_at)
     values ('10000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002',
       (select id from appointments where organization_id = '10000000-0000-0000-0000-000000000002' limit 1),
       'active', '2026-07-31 14:30:00+00', '2026-07-31 15:30:00+00') $$,
  'un rango solapado en OTRO recurso no viola el EXCLUDE (es por recurso, no global)'
);

-- 7. Una reserva 'released' (liberada por cancelación) NO bloquea un
-- rango que vuelve a solaparla — "cancelar libera la reserva mediante
-- transición" (sección 8, R0-A sección 5.2).
select lives_ok(
  $$ with released as (
       insert into resource_reservations (organization_id, resource_id, appointment_id, status, starts_at, ends_at, released_at, released_reason)
       values ('10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001',
         '81000000-0000-0000-0000-000000000004', 'released', '2026-08-05 09:00:00+00', '2026-08-05 10:00:00+00', now(), 'cita cancelada')
       returning 1
     )
     insert into resource_reservations (organization_id, resource_id, appointment_id, status, starts_at, ends_at)
     values ('10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001',
       '81000000-0000-0000-0000-000000000004', 'active', '2026-08-05 09:00:00+00', '2026-08-05 10:00:00+00') $$,
  'una reserva released no bloquea un rango que vuelve a solaparla'
);

-- 8. `authenticated` no puede insertar reservas directamente — toda
-- reserva pasa por CreateTemporaryReservation/ScheduleAppointment con
-- Service Role, nunca un INSERT directo del navegador.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ insert into resource_reservations (organization_id, resource_id, appointment_id, status, starts_at, ends_at)
     values ('10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001',
       '81000000-0000-0000-0000-000000000004', 'active', '2027-01-01 09:00:00+00', '2027-01-01 10:00:00+00') $$,
  '42501',
  'authenticated no puede insertar directamente en resource_reservations'
);

select * from finish();
rollback;
