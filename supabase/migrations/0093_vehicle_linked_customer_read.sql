-- Datatek — migración 0093: el cliente vinculado puede leer su propio
-- vehículo, no solo la fila que se lo concede.
--
-- Corrige un defecto detectado el 2026-08-04, en la primera ejecución real
-- de pgTAP contra Postgres (supabase/tests/0030_vehicles_access.sql, caso
-- "cliente vinculado ve el vehículo cubierto por su propio access grant").
--
-- `vehicle_access_grants_select` (0030_vehicles_access.sql línea 315) ya
-- deja que el cliente vinculado lea LA FILA que le concede acceso, vía
-- `actor_is_linked_customer(granted_to_customer_id, organization_id)`. Pero
-- `vehicles_select_via_access_grant`, la política sobre la tabla `vehicles`
-- misma, nunca contemplaba ese caso: solo cubría personal con
-- `vehicle.read`, al dueño verificado, o a plataforma elevada. El cliente
-- podía ver que tenía un permiso y no podía ver el vehículo al que apuntaba
-- — el grant quedaba inútil para el único actor al que se le otorgó.
--
-- No se toca 0030 (ya aplicada) ni 0092 (aplicada en este mismo pase, antes
-- de encontrar este segundo defecto) — invariante 4.

drop policy vehicles_select_via_access_grant on vehicles;
create policy vehicles_select_via_access_grant on vehicles
  for select to authenticated
  using (
    exists (
      select 1
      from vehicle_access_grants g
      where g.vehicle_id = vehicles.id
        and g.revoked_at is null
        and datatek_platform.has_org_permission(g.organization_id, 'vehicle.read')
    )
    or exists (
      select 1
      from vehicle_access_grants g
      where g.vehicle_id = vehicles.id
        and g.revoked_at is null
        and g.granted_to_customer_id is not null
        and datatek_platform.actor_is_linked_customer(g.granted_to_customer_id, g.organization_id)
    )
    or exists (
      select 1
      from vehicle_ownerships o
      where o.vehicle_id = vehicles.id and o.owner_user_id = datatek_platform.current_actor()
    )
    or (
      datatek_platform.has_active_platform_membership()
      and exists (
        select 1 from vehicle_access_grants g
        where g.vehicle_id = vehicles.id
          and g.revoked_at is null
          and datatek_platform.has_active_support_session(g.organization_id)
      )
    )
  );
