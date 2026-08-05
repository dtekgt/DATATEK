-- Datatek — migración 0092: exigir sesión elevada para lectura de tenant
-- por parte de plataforma.
--
-- Corrige un defecto detectado el 2026-08-04, en la primera ejecución real
-- de pgTAP contra Postgres (supabase/tests/0010_identity_tenancy.sql, caso
-- "platform support sin elevación no lee la fila de organizations de Taller
-- Demo").
--
-- Todo el resto del esquema (0020_crm.sql, 0030_vehicles_access.sql,
-- 0050_intake_cases.sql, 0060_scheduling.sql, 0070_inspection_evidence.sql,
-- 0080_quote_authorization.sql, 0085/0086/0087) usa consistentemente:
--
--   has_active_platform_membership() and has_active_support_session(org_id)
--
-- para conceder a un miembro de plataforma acceso de lectura a datos de un
-- tenant específico — membership por sí sola nunca es suficiente, tiene que
-- estar además elevado sobre ESA organización (docs/domain/permissions.md
-- sección "roles de plataforma"; packages/auth/src/tenancy.ts
-- resolveActiveSupportAccessSession / AccessBoundary "elevation_required").
--
-- 8 políticas de 0010_identity_tenancy_isolation.sql no siguieron ese
-- patrón: usan `has_active_platform_membership()` sola, con OR, sin exigir
-- la sesión elevada. Efecto real: cualquier miembro de plataforma (soporte,
-- seguridad, auditor, admin) podía leer la fila de `organizations`,
-- `organization_branches`, `organization_settings`, `organization_counters`,
-- `organization_slug_history` y la lista de membresías de CUALQUIER
-- organización, sin tener ningún ticket de soporte abierto sobre ella.
--
-- Las tablas que sí usaban `has_active_platform_membership()` sola no se
-- tocan aquí: son datos neutrales por diseño, sin organization_id
-- (catálogo de servicios, plantillas de inspección, catálogo de roles de
-- plataforma) o una excepción documentada explícitamente en el propio
-- schema (vehicle_ownerships: "identidad global... un hecho sobre la
-- persona, no sobre su relación con un taller").
--
-- No se modifica 0010: una migración ya aplicada no se reescribe
-- (invariante 4). Postgres no tiene "alter policy ... using", así que cada
-- política se recrea con drop + create, mismo nombre, mismo alcance,
-- agregando la condición de elevación que faltaba.

drop policy organizations_select_member on organizations;
create policy organizations_select_member on organizations
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(id)
    )
  );

drop policy organization_slug_history_select_member on organization_slug_history;
create policy organization_slug_history_select_member on organization_slug_history
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

drop policy organization_branches_select_member on organization_branches;
create policy organization_branches_select_member on organization_branches
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

drop policy organization_settings_select_member on organization_settings;
create policy organization_settings_select_member on organization_settings
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

drop policy organization_counters_select_member on organization_counters;
create policy organization_counters_select_member on organization_counters
  for select to authenticated
  using (
    datatek_platform.has_active_org_membership(organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

drop policy organization_memberships_select_self_or_manager on organization_memberships;
create policy organization_memberships_select_self_or_manager on organization_memberships
  for select to authenticated
  using (
    user_id = datatek_platform.current_actor()
    or datatek_platform.has_org_permission(organization_id, 'membership.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

drop policy membership_roles_select on membership_roles;
create policy membership_roles_select on membership_roles
  for select to authenticated
  using (
    exists (
      select 1 from organization_memberships m
      where m.id = membership_roles.membership_id
        and (
          m.user_id = datatek_platform.current_actor()
          or datatek_platform.has_org_permission(m.organization_id, 'membership.read')
          or (
            datatek_platform.has_active_platform_membership()
            and datatek_platform.has_active_support_session(m.organization_id)
          )
        )
    )
  );

drop policy membership_branch_scopes_select on membership_branch_scopes;
create policy membership_branch_scopes_select on membership_branch_scopes
  for select to authenticated
  using (
    exists (
      select 1 from organization_memberships m
      where m.id = membership_branch_scopes.membership_id
        and (
          m.user_id = datatek_platform.current_actor()
          or datatek_platform.has_org_permission(m.organization_id, 'membership.read')
          or (
            datatek_platform.has_active_platform_membership()
            and datatek_platform.has_active_support_session(m.organization_id)
          )
        )
    )
  );
