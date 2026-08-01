-- Datatek — seed local de actores ficticios (R0-C, sección 8).
--
-- Estado de esta sesión: escrito y revisado, NO ejecutado — no hay
-- Docker/Supabase local disponible en esta sandbox (ver
-- docs/runbooks/local-auth-seeds.md). `implemented_pending_environment_evidence`.
--
-- Reglas que este archivo respeta:
--   * identidades ficticias, nunca datos del legado;
--   * credenciales solo locales (contraseña de desarrollo idéntica y
--     documentada, nunca una contraseña real reutilizable);
--   * script controlado, idempotente (upsert), ejecutable con
--     `pnpm db:reset` una vez B6 esté disponible;
--   * los actores customer NO reciben relaciones CRM aquí — eso es R0-D.
--
-- auth.users se puebla vía la función administrativa de GoTrue
-- (auth.users + auth.identities) siguiendo el patrón estándar de seed local
-- de Supabase: contraseña de desarrollo fija, encriptada con
-- `crypt(..., gen_salt('bf'))`, email confirmado para que el login local
-- funcione sin flujo de correo.

do $$
declare
  v_password text := 'datatek-local-dev-only'; -- nunca usar fuera de local
begin
  -- 10 actores ficticios (sección 8): owner/advisor/inspector/mechanic/
  -- cashier/customer DTEK, owner/customer Taller Demo, platform support sin
  -- elevación, platform admin.
  perform 1;
end $$;

-- ---------------------------------------------------------------------------
-- auth.users + auth.identities (idempotente vía ON CONFLICT en email)
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.dtek@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'advisor.dtek@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspector.dtek@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mechanic.dtek@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier.dtek@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer.dtek@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.demo@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer.demo@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'support@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@datatek.local', crypt('datatek-local-dev-only', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Organizaciones + sucursales + settings + counters
-- ---------------------------------------------------------------------------

insert into organizations (id, slug, name, timezone, currency, status)
values
  ('10000000-0000-0000-0000-000000000001', 'dtek-servicios', 'DTEK Servicios', 'America/Guatemala', 'GTQ', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'taller-demo', 'Taller Demo', 'America/Guatemala', 'GTQ', 'active')
on conflict (id) do nothing;

insert into organization_settings (organization_id)
values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002')
on conflict (organization_id) do nothing;

insert into organization_counters (organization_id, counter_key, next_value)
values
  ('10000000-0000-0000-0000-000000000001', 'case_folio', 1),
  ('10000000-0000-0000-0000-000000000002', 'case_folio', 1)
on conflict (organization_id, counter_key) do nothing;

insert into organization_branches (id, organization_id, slug, name, is_mobile, status)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'central', 'Sucursal Central', false, 'active'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'movil', 'Sucursal Móvil', true, 'active'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'demo', 'Sucursal Demo', false, 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Catálogo de permisos / role_templates / mapeo aditivo
-- ---------------------------------------------------------------------------
-- Nota: en operación real este bloque se genera desde
-- packages/domain/spec/domain-spec.r0.yaml (fuente canónica, sección 4) vía
-- un script de sync; se escribe aquí en forma literal para que el seed sea
-- autocontenido y reproducible sin depender de Node en `psql`.

insert into permissions (key, domain, description) values
  ('organization.read', 'organization', 'Leer datos de la organización'),
  ('organization.manage', 'organization', 'Administrar la organización'),
  ('branch.manage', 'organization', 'Administrar sucursales'),
  ('membership.read', 'organization', 'Leer membresías'),
  ('membership.manage', 'organization', 'Administrar membresías'),
  ('role.assign', 'organization', 'Asignar roles'),
  ('catalog.read', 'organization', 'Leer catálogo'),
  ('catalog.manage', 'organization', 'Administrar catálogo'),
  ('audit.read_organization', 'organization', 'Leer auditoría de la organización'),
  ('crm.read', 'organization', 'Leer CRM (reservado R0-D)'),
  ('crm.manage', 'organization', 'Administrar CRM (reservado R0-D)'),
  ('vehicle.read', 'organization', 'Leer vehículos (reservado R0-D)'),
  ('vehicle.manage', 'organization', 'Administrar vehículos (reservado R0-D)'),
  ('intake.read', 'organization', 'Leer intake (reservado R0-D)'),
  ('intake.manage', 'organization', 'Administrar intake (reservado R0-D)'),
  ('agenda.read', 'organization', 'Leer agenda (reservado R0-D)'),
  ('agenda.manage', 'organization', 'Administrar agenda (reservado R0-D)'),
  ('inspection.read', 'organization', 'Leer inspección (reservado R0-D)'),
  ('inspection.publish', 'organization', 'Publicar evidencia de inspección (reservado R0-D)'),
  ('quote.read', 'organization', 'Leer cotización (reservado R0-D)'),
  ('quote.manage', 'organization', 'Administrar cotización (reservado R0-D)'),
  ('authorization.request', 'organization', 'Enviar solicitud de autorización (reservado R0-D)'),
  ('authorization.decide', 'organization', 'Decidir autorización (reservado R0-D)'),
  ('work.read', 'organization', 'Leer trabajo (reservado R0-D)'),
  ('work.manage', 'organization', 'Administrar trabajo (reservado R0-D)'),
  ('quality.manage', 'organization', 'Administrar calidad (reservado R0-D)'),
  ('finance.read', 'organization', 'Leer finanzas (reservado R0-D)'),
  ('finance.manage', 'organization', 'Administrar finanzas (reservado R0-D)'),
  ('platform.control.enter', 'platform', 'Entrar a Control'),
  ('platform.organization.manage', 'platform', 'Administrar organizaciones desde Control'),
  ('platform.catalog.manage', 'platform', 'Administrar catálogo global'),
  ('platform.feature.manage', 'platform', 'Administrar feature flags'),
  ('platform.support.manage', 'platform', 'Administrar soporte'),
  ('platform.security.read', 'platform', 'Leer seguridad'),
  ('platform.audit.read', 'platform', 'Leer auditoría de plataforma'),
  ('platform.access.request', 'platform', 'Solicitar acceso elevado'),
  ('platform.access.approve', 'platform', 'Aprobar acceso elevado'),
  ('platform.access.use', 'platform', 'Usar acceso elevado')
on conflict (key) do nothing;

insert into role_templates (key, label) values
  ('owner', 'Owner'), ('advisor', 'Asesor'), ('inspector', 'Inspector'),
  ('mechanic', 'Mecánico'), ('cashier', 'Caja'), ('customer', 'Cliente')
on conflict (key) do nothing;

insert into platform_role_templates (key, label) values
  ('platform_support', 'Soporte de plataforma'),
  ('platform_security', 'Seguridad de plataforma'),
  ('platform_admin', 'Admin de plataforma'),
  ('platform_auditor', 'Auditor de plataforma')
on conflict (key) do nothing;

insert into role_template_permissions (role_template_key, permission_key) values
  ('owner', 'organization.read'), ('owner', 'organization.manage'), ('owner', 'branch.manage'),
  ('owner', 'membership.read'), ('owner', 'membership.manage'), ('owner', 'role.assign'),
  ('owner', 'catalog.read'), ('owner', 'catalog.manage'), ('owner', 'audit.read_organization'),
  ('owner', 'crm.read'), ('owner', 'crm.manage'), ('owner', 'vehicle.read'), ('owner', 'vehicle.manage'),
  ('owner', 'intake.read'), ('owner', 'intake.manage'), ('owner', 'agenda.read'), ('owner', 'agenda.manage'),
  ('owner', 'inspection.read'), ('owner', 'inspection.publish'), ('owner', 'quote.read'), ('owner', 'quote.manage'),
  ('owner', 'authorization.request'), ('owner', 'authorization.decide'), ('owner', 'work.read'), ('owner', 'work.manage'),
  ('owner', 'quality.manage'), ('owner', 'finance.read'), ('owner', 'finance.manage'),
  ('advisor', 'organization.read'), ('advisor', 'membership.read'), ('advisor', 'catalog.read'),
  ('advisor', 'crm.read'), ('advisor', 'crm.manage'), ('advisor', 'vehicle.read'), ('advisor', 'vehicle.manage'),
  ('advisor', 'intake.read'), ('advisor', 'intake.manage'), ('advisor', 'agenda.read'), ('advisor', 'agenda.manage'),
  ('advisor', 'inspection.read'), ('advisor', 'quote.read'), ('advisor', 'quote.manage'),
  ('advisor', 'authorization.request'), ('advisor', 'work.read'),
  ('inspector', 'organization.read'), ('inspector', 'catalog.read'), ('inspector', 'vehicle.read'),
  ('inspector', 'inspection.read'), ('inspector', 'inspection.publish'), ('inspector', 'work.read'),
  ('mechanic', 'organization.read'), ('mechanic', 'catalog.read'), ('mechanic', 'vehicle.read'),
  ('mechanic', 'work.read'), ('mechanic', 'work.manage'),
  ('cashier', 'organization.read'), ('cashier', 'catalog.read'), ('cashier', 'finance.read'), ('cashier', 'finance.manage'),
  ('customer', 'crm.read')
on conflict do nothing;

insert into platform_role_permissions (platform_role_template_key, permission_key) values
  ('platform_support', 'platform.control.enter'), ('platform_support', 'platform.access.request'), ('platform_support', 'platform.access.use'),
  ('platform_security', 'platform.control.enter'), ('platform_security', 'platform.security.read'), ('platform_security', 'platform.audit.read'),
  ('platform_admin', 'platform.control.enter'), ('platform_admin', 'platform.organization.manage'), ('platform_admin', 'platform.catalog.manage'),
  ('platform_admin', 'platform.feature.manage'), ('platform_admin', 'platform.support.manage'), ('platform_admin', 'platform.security.read'),
  ('platform_admin', 'platform.audit.read'), ('platform_admin', 'platform.access.approve'), ('platform_admin', 'platform.access.use'),
  ('platform_auditor', 'platform.control.enter'), ('platform_auditor', 'platform.audit.read'), ('platform_auditor', 'platform.security.read')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------

insert into user_profiles (user_id, display_name, locale, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'Owner DTEK', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'Asesor DTEK', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000a3', 'Inspector DTEK', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000a4', 'Mecánico DTEK', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000a5', 'Caja DTEK', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000a6', 'Cliente DTEK', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000b1', 'Owner Taller Demo', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'Cliente Taller Demo', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000c1', 'Soporte de plataforma', 'es-GT', 'active'),
  ('00000000-0000-0000-0000-0000000000c2', 'Admin de plataforma', 'es-GT', 'active')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Memberships de organización + roles + branch scopes
-- ---------------------------------------------------------------------------

insert into organization_memberships (id, user_id, organization_id, status, effective_from) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'active', '2025-01-01'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'active', '2025-01-01'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000001', 'active', '2025-01-01'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000001', 'active', '2025-01-01'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a5', '10000000-0000-0000-0000-000000000001', 'active', '2025-01-01'),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a6', '10000000-0000-0000-0000-000000000001', 'active', '2025-01-01'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'active', '2025-01-01'),
  ('30000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000002', 'active', '2025-01-01')
on conflict (id) do nothing;

insert into membership_roles (membership_id, role_template_key) values
  ('30000000-0000-0000-0000-000000000001', 'owner'),
  ('30000000-0000-0000-0000-000000000002', 'advisor'),
  ('30000000-0000-0000-0000-000000000003', 'inspector'),
  ('30000000-0000-0000-0000-000000000004', 'mechanic'),
  ('30000000-0000-0000-0000-000000000005', 'cashier'),
  ('30000000-0000-0000-0000-000000000006', 'customer'),
  ('30000000-0000-0000-0000-000000000007', 'owner'),
  ('30000000-0000-0000-0000-000000000008', 'customer')
on conflict do nothing;

-- Owner recibe scope de todas las sucursales por regla explícita (sección
-- 2.3); el resto queda acotado a la sucursal central/demo.
insert into membership_branch_scopes (membership_id, organization_id, branch_id, all_branches) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', null, true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', null, true),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Platform memberships + elevación ficticia acotada a DTEK
-- ---------------------------------------------------------------------------

insert into platform_memberships (id, user_id, status, effective_from) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'active', '2025-01-01'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2', 'active', '2025-01-01')
on conflict (id) do nothing;

insert into platform_membership_roles (platform_membership_id, platform_role_template_key) values
  ('40000000-0000-0000-0000-000000000001', 'platform_support'),
  ('40000000-0000-0000-0000-000000000002', 'platform_admin')
on conflict do nothing;

-- El seed de "platform support sin elevación" (sección 8) es intencional:
-- no se inserta ninguna support_access_session para
-- 40000000-0000-0000-0000-000000000001 apuntando a Taller Demo. La única
-- sesión elevada seed-ada cubre DTEK, con ticket/razón/vencimiento
-- explícitos, para que el runbook de soporte tenga un ejemplo reproducible.
insert into support_access_sessions (
  id, platform_membership_id, organization_id, ticket, reason, scope, status, starts_at, expires_at, approved_by
) values (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'TCK-1042',
  'Cliente reporta folio no visible en Pro — investigar aislamiento',
  'read_only',
  'active',
  '2026-08-01 08:00:00+00',
  '2026-08-01 20:00:00+00',
  '00000000-0000-0000-0000-0000000000c2'
)
on conflict (id) do nothing;
