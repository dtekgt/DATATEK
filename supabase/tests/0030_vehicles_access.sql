-- Datatek — pgTAP: migración 0030 (vehículos y acceso).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — misma situación
-- que supabase/tests/0020_crm.sql (ver su cabecera).
-- `implemented_pending_environment_evidence`.
--
-- Cobertura: DATATEK_R0_D sección 5 y sección 19 (puerta de aceptación —
-- "VIN/placa no permiten enumeración").

begin;
select plan(11);

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- IDs de supabase/seeds/local_actors.sql (extendido en esta fase):
-- vehicle DTEK (VIN 1HGCM82633A004352):  70000000-0000-0000-0000-000000000001
-- vehicle Taller Demo (VIN KNADH...):    70000000-0000-0000-0000-000000000002
-- advisor DTEK (vehicle.manage):         00000000-0000-0000-0000-0000000000a2
-- owner Taller Demo (vehicle.manage):    00000000-0000-0000-0000-0000000000b1

-- 1. Advisor DTEK lee el vehículo de DTEK (tiene un access grant activo).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from vehicles where id = '70000000-0000-0000-0000-000000000001'),
  1,
  'advisor DTEK lee el vehículo de DTEK vía su access grant'
);

-- 2. Advisor DTEK NO lee el vehículo de Taller Demo, aunque conozca el
-- UUID exacto — sección 19: "VIN/placa no permiten enumeración" también
-- vale para el UUID interno.
select is(
  (select count(*)::int from vehicles where id = '70000000-0000-0000-0000-000000000002'),
  0,
  'advisor DTEK, conociendo el UUID exacto del vehículo de Taller Demo, recibe cero filas'
);

-- 3. Mismo resultado consultando por VIN exacto en vez de UUID — conocer
-- el VIN de otro tenant tampoco otorga lectura (sección 5: "VIN/placa no
-- otorgan lectura").
select is(
  (select count(*)::int from vehicles where primary_vin = 'KNADH4A31F6123456'),
  0,
  'advisor DTEK, conociendo el VIN exacto de Taller Demo, recibe cero filas'
);

-- 4. vehicle_identifiers hereda el mismo aislamiento.
select is(
  (select count(*)::int from vehicle_identifiers where vehicle_id = '70000000-0000-0000-0000-000000000002'),
  0,
  'advisor DTEK no lee los identificadores del vehículo de Taller Demo'
);

-- 5. vehicle_ownership_claims: DTEK ve el propio, no el ajeno.
select is(
  (select count(*)::int from vehicle_ownership_claims where organization_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'advisor DTEK lee el claim provisional de su propia organización'
);
select is(
  (select count(*)::int from vehicle_ownership_claims where id = '70000000-0000-0000-0000-000000000010'),
  0,
  'advisor DTEK no lee el claim de Taller Demo'
);

-- 6. vehicle_odometer_events: visible solo con acceso al vehículo.
select is(
  (select count(*)::int from vehicle_odometer_events where vehicle_id = '70000000-0000-0000-0000-000000000001'),
  1,
  'advisor DTEK lee el evento de odómetro de su propio vehículo'
);
select is(
  (select count(*)::int from vehicle_odometer_events where vehicle_id = '70000000-0000-0000-0000-000000000002'),
  0,
  'advisor DTEK no lee el evento de odómetro del vehículo de Taller Demo'
);

-- 7. Cliente vinculado (a6) ve el vehículo por el que tiene un grant a
-- nombre de su customer, sin necesitar vehicle.manage.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select is(
  (select count(*)::int from vehicles where id = '70000000-0000-0000-0000-000000000001'),
  1,
  'cliente vinculado ve el vehículo cubierto por su propio access grant'
);

-- 8. append-only: un evento de odómetro en conflicto no puede
-- sobrescribir uno anterior — se prueba que UPDATE no tiene grant en
-- absoluto (no hay ninguna policy/grant de UPDATE para `authenticated`).
select throws_ok(
  $$ update vehicle_odometer_events set value_km = 1 where id = '70000000-0000-0000-0000-000000000011' $$,
  '42501',
  'authenticated no puede modificar un evento de odómetro ya registrado (append-only)'
);

-- 9. `authenticated` no puede insertar un vehículo directamente — la
-- búsqueda privada/creación de RegisterVehicle corre solo vía comando de
-- aplicación con Service Role.
select throws_ok(
  $$ insert into vehicles (primary_vin) values ('1HGCM82633A004352') $$,
  '42501',
  'authenticated no puede insertar directamente en vehicles'
);

select * from finish();
rollback;
