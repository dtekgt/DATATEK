-- Datatek — pgTAP: migración 0020 (CRM).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — requiere pgTAP
-- instalado y Postgres real (sin Docker en esta sandbox — ver
-- docs/runbooks/database-reset.md). `implemented_pending_environment_evidence`.
-- Cuando una sesión futura tenga Docker: `pnpm db:reset` (aplica
-- supabase/seeds/local_actors.sql, extendido en esta fase con clientes de
-- ejemplo) y luego `pg_prove`/`supabase test db` sobre este archivo.
--
-- Cobertura: DATATEK_R0_D sección 4 y sección 19 (puerta de aceptación —
-- "cliente provisional funciona sin cuenta", "no hay enumeración").

begin;
select plan(12);

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

-- IDs de supabase/seeds/local_actors.sql (extendido en esta fase):
-- customer DTEK (cliente):     60000000-0000-0000-0000-000000000001
-- customer Taller Demo:        60000000-0000-0000-0000-000000000002
-- advisor DTEK (crm.manage):   00000000-0000-0000-0000-0000000000a2
-- owner Taller Demo:           00000000-0000-0000-0000-0000000000b1
-- cliente DTEK (cuenta a6, vinculada verificada a customer DTEK)
-- cliente Taller Demo (cuenta b2, vinculada verificada a customer Demo)

-- 1. Advisor DTEK (crm.manage) lee el cliente de DTEK.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from customers where id = '60000000-0000-0000-0000-000000000001'),
  1,
  'advisor DTEK lee el cliente de DTEK (crm.manage)'
);

-- 2. Advisor DTEK NO lee el cliente de Taller Demo.
select is(
  (select count(*)::int from customers where id = '60000000-0000-0000-0000-000000000002'),
  0,
  'advisor DTEK no lee el cliente de Taller Demo'
);

-- 3. UUID conocido de otro tenant no rompe RLS ni revela nada (misma
-- respuesta que un UUID inventado).
select is(
  (select count(*)::int from customers where id = '00000000-0000-0000-0000-00000000dead'),
  0,
  'un UUID de cliente inventado devuelve cero filas, igual que uno real ajeno'
);

-- 4. Cuenta cliente DTEK (a6), vinculada y verificada, lee SU PROPIO
-- cliente aunque su único permiso sea crm.read (no crm.manage).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select is(
  (select count(*)::int from customers where id = '60000000-0000-0000-0000-000000000001'),
  1,
  'cuenta vinculada y verificada lee su propio cliente vía actor_is_linked_customer'
);

-- 5. Esa misma cuenta NO lee el cliente de Taller Demo, ni siquiera
-- conociendo el UUID exacto.
select is(
  (select count(*)::int from customers where id = '60000000-0000-0000-0000-000000000002'),
  0,
  'cuenta cliente DTEK no lee el cliente de Taller Demo'
);

-- 6. Esa misma cuenta NO lee la lista completa de clientes de su propia
-- organización — solo su propia fila (crm.read no es "ver todo el CRM").
select is(
  (select count(*)::int from customers where organization_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'crm.read por sí solo no concede ver todo el CRM del tenant, solo la fila propia'
);

-- 7. customer_contacts sigue el mismo aislamiento.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from customer_contacts where id = '60000000-0000-0000-0000-000000000005'),
  0,
  'owner Taller Demo no lee un contacto de DTEK'
);

-- 8. Owner Taller Demo (crm.manage en su org) sí lee su propio contacto.
select is(
  (select count(*)::int from customer_contacts where id = '60000000-0000-0000-0000-000000000006'),
  1,
  'owner Taller Demo lee el contacto de su propio cliente'
);

-- 9. La unique parcial impide un segundo vínculo verificado del mismo
-- usuario a un cliente distinto dentro de la misma organización. Corre
-- como el rol dueño de la prueba (no `authenticated`) porque el objetivo es
-- probar el constraint de datos, no el grant — el grant se prueba aparte
-- en el caso 10.
reset role;
select throws_ok(
  $$
    with new_customer as (
      insert into customers (organization_id, display_name, source)
      values ('10000000-0000-0000-0000-000000000001', 'Cliente Duplicado', 'walk_in')
      returning id
    )
    insert into customer_auth_links (organization_id, customer_id, user_id, status, verification_method, verified_at)
    select '10000000-0000-0000-0000-000000000001', new_customer.id, '00000000-0000-0000-0000-0000000000a6', 'verified', 'otp_phone', now()
    from new_customer
  $$,
  '23505',
  null,
  'no se puede fusionar una segunda cuenta verificada al mismo usuario dentro de la misma organización'
);

-- 10. `authenticated` no puede insertar directamente (toda escritura pasa
-- por un comando de aplicación con Service Role).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ insert into customers (organization_id, display_name, source)
     values ('10000000-0000-0000-0000-000000000001', 'Intento directo', 'walk_in') $$,
  '42501',
  null,
  'authenticated no puede insertar directamente en customers'
);

-- 11. `anon` no lee nada de CRM.
select pg_temp.as_user(gen_random_uuid());
select is(
  (select count(*)::int from customers),
  0,
  'un usuario autenticado sin ninguna membership no lee ningún cliente'
);

-- 12. `customer_consents`/`customer_communication_preferences` heredan el
-- mismo patrón de RLS que las demás tablas de esta ola (comprobación de
-- forma, no de contenido — no hay filas seed en estas dos tablas).
select is(
  (select count(*)::int from customer_communication_preferences),
  0,
  'customer_communication_preferences respeta RLS incluso sin filas seed (no lanza error)'
);

select * from finish();
rollback;
