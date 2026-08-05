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

-- next_value=2: cada organización ya "consumió" el folio 1 abajo (sección
-- CRM + vehículo / intake + caso) — el siguiente RegisterCase real
-- continuará en 2, nunca repite el folio 1 sembrado aquí.
insert into organization_counters (organization_id, counter_key, next_value)
values
  ('10000000-0000-0000-0000-000000000001', 'case_folio', 2),
  ('10000000-0000-0000-0000-000000000002', 'case_folio', 2)
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
  ('platform.access.use', 'platform', 'Usar acceso elevado'),
  -- Introducidos por 0070_inspection_evidence.sql (evidence_assets_select
  -- línea 541, evidence_links_select línea 551, evidence_assets_insert
  -- línea 531) pero nunca agregados a este catálogo ni otorgados a ningún
  -- rol — detectado el 2026-08-04 al ejecutar pgTAP por primera vez
  -- (supabase/tests/0070_inspection_evidence.sql, caso "inspector DTEK
  -- (evidence.read_internal) lee el evidence_asset"). Sin esta fila,
  -- has_org_permission(_, 'evidence.read_internal') es estructuralmente
  -- falso para cualquier actor: la política RLS estaba bien escrita, el
  -- permiso que exige simplemente no existía.
  ('evidence.upload', 'organization', 'Subir evidencia de inspección'),
  ('evidence.read_internal', 'organization', 'Leer evidencia interna de inspección'),
  -- Introducidos por 0094_product_catalog.sql.
  ('parts.read', 'organization', 'Leer catálogo de productos/repuestos'),
  ('parts.manage', 'organization', 'Administrar catálogo de productos/repuestos')
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
  ('owner', 'parts.read'), ('owner', 'parts.manage'),
  ('advisor', 'organization.read'), ('advisor', 'membership.read'), ('advisor', 'catalog.read'),
  ('advisor', 'crm.read'), ('advisor', 'crm.manage'), ('advisor', 'vehicle.read'), ('advisor', 'vehicle.manage'),
  ('advisor', 'intake.read'), ('advisor', 'intake.manage'), ('advisor', 'agenda.read'), ('advisor', 'agenda.manage'),
  ('advisor', 'inspection.read'), ('advisor', 'quote.read'), ('advisor', 'quote.manage'),
  ('advisor', 'authorization.request'), ('advisor', 'work.read'), ('advisor', 'parts.read'),
  ('inspector', 'organization.read'), ('inspector', 'catalog.read'), ('inspector', 'vehicle.read'),
  ('inspector', 'inspection.read'), ('inspector', 'inspection.publish'), ('inspector', 'work.read'),
  ('inspector', 'evidence.upload'), ('inspector', 'evidence.read_internal'),
  ('mechanic', 'organization.read'), ('mechanic', 'catalog.read'), ('mechanic', 'vehicle.read'),
  ('mechanic', 'work.read'), ('mechanic', 'work.manage'), ('mechanic', 'parts.read'),
  ('cashier', 'organization.read'), ('cashier', 'catalog.read'), ('cashier', 'finance.read'), ('cashier', 'finance.manage'),
  ('cashier', 'parts.read'),
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
--
-- starts_at/expires_at son relativos a `now()`, no fechas absolutas: una
-- fecha absoluta (antes '2026-08-01 08:00'/'20:00') queda "vencida" con el
-- simple paso del calendario y has_active_support_session empieza a
-- devolver false por una razón ajena a la función — encontrado el
-- 2026-08-04 al ejecutar pgTAP por primera vez contra Postgres real
-- (supabase/tests/0010_identity_tenancy.sql, caso "sesión elevada").
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
  now() - interval '4 hours',
  now() + interval '8 hours',
  '00000000-0000-0000-0000-0000000000c2'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- CRM + vehículo (R0-D Fase 1, olas 0020/0030) — un cliente y un vehículo
-- por organización, con un claim provisional y un evento de odómetro cada
-- uno, exactamente lo que supabase/tests/0020_crm.sql y
-- supabase/tests/0030_vehicles_access.sql necesitan para probar RLS/
-- no-enumeración una vez esta sandbox tenga Docker (ver cabeceras de
-- 0020_crm.sql / 0030_vehicles_access.sql — no ejecutado en esta sesión).
-- ---------------------------------------------------------------------------

insert into customers (id, organization_id, display_name, customer_type, status, source, created_by) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cliente Demo DTEK', 'person', 'active', 'whatsapp_manual', '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Cliente Demo Taller Demo', 'person', 'active', 'walk_in', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into customer_auth_links (id, organization_id, customer_id, user_id, status, verification_method, verified_at, created_by) values
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a6', 'verified', 'manual_staff', now(), '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'verified', 'manual_staff', now(), '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into customer_contacts (id, organization_id, customer_id, channel, normalized_value, raw_value, verified, verified_at, is_primary, created_by) values
  ('60000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'whatsapp', '+50255551234', '+502 5555-1234', true, now(), true, '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'whatsapp', '+50255556789', '+502 5555-6789', true, now(), true, '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into vehicles (id, primary_vin, primary_plate, make, model, year, color, created_by) values
  ('70000000-0000-0000-0000-000000000001', '1HGCM82633A004352', 'P123ABC', 'Toyota', 'Corolla', 2018, 'Gris', '00000000-0000-0000-0000-0000000000a2'),
  ('70000000-0000-0000-0000-000000000002', 'KNADH4A31F6123456', 'P321JKL', 'Kia', 'Rio', 2015, 'Rojo', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into vehicle_identifiers (id, vehicle_id, identifier_type, normalized_value, raw_value, recorded_by_organization_id, created_by) values
  ('70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 'vin', '1HGCM82633A004352', '1HGCM82633A004352', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  ('70000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', 'plate', 'P123ABC', 'P-123ABC', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  ('70000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000002', 'vin', 'KNADH4A31F6123456', 'KNADH4A31F6123456', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1'),
  ('70000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000002', 'plate', 'P321JKL', 'P-321JKL', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into vehicle_access_grants (id, organization_id, vehicle_id, granted_to_customer_id, scope, source, created_by) values
  ('70000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'read_own_case', 'registration', '00000000-0000-0000-0000-0000000000a2'),
  ('70000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'read_own_case', 'registration', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into vehicle_ownership_claims (id, organization_id, customer_id, vehicle_id, claim_kind, status, created_by) values
  ('70000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'self_reported', 'provisional', '00000000-0000-0000-0000-0000000000a2'),
  ('70000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'self_reported', 'provisional', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into vehicle_odometer_events (id, vehicle_id, organization_id, recorded_at, value_km, raw_value, raw_unit, provenance, actor_id, status) values
  ('70000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-07-20 15:00:00+00', 84210, 84210, 'km', 'observed', '00000000-0000-0000-0000-0000000000a2', 'accepted'),
  ('70000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2025-11-02 10:00:00+00', 112500, 112500, 'km', 'observed', '00000000-0000-0000-0000-0000000000b1', 'accepted')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Intake + caso (R0-D Fase 2, ola 0050) — un thread/caso por organización,
-- lo mínimo que supabase/tests/0050_intake_cases.sql necesita.
-- ---------------------------------------------------------------------------

insert into intake_threads (id, organization_id, customer_id, channel, status, created_by) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'whatsapp_manual', 'converted', '00000000-0000-0000-0000-0000000000a2'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'whatsapp_manual', 'open', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into intake_entries (id, organization_id, thread_id, direction, original_text, reported_at, recorded_by) values
  ('80000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'inbound', 'Hola, mi carro chilla al frenar desde ayer.', '2026-07-30 09:00:00+00', '00000000-0000-0000-0000-0000000000a2'),
  ('80000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'inbound', 'Buenas, quisiera revisión de frenos.', '2026-07-30 09:00:00+00', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into cases (id, organization_id, branch_id, folio_number, folio_code, customer_id, vehicle_id, status, source_intake_thread_id, created_by) values
  ('80000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, '2026-00001', '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'inspection', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  ('80000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 1, '2026-00001', '60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'new', '80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1')
on conflict (id) do nothing;

insert into case_participants (id, organization_id, case_id, customer_id, participant_kind, added_by) values
  ('80000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000001', 'customer', '00000000-0000-0000-0000-0000000000a2')
on conflict (id) do nothing;

insert into case_assignments (id, organization_id, case_id, role, user_id, assigned_by) values
  ('80000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'advisor', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1'),
  ('80000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'inspector', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

insert into service_requests (id, organization_id, case_id, source_intake_entry_id, summary, created_by) values
  ('80000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000003', 'Chillido al frenar reportado por el cliente.', '00000000-0000-0000-0000-0000000000a2')
on conflict (id) do nothing;

insert into reported_symptoms (id, organization_id, case_id, service_request_id, source_intake_entry_id, symptom_code, description, created_by) values
  ('80000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000003', 'brake_noise', 'Chillido metálico al frenar, reportado por el cliente.', '00000000-0000-0000-0000-0000000000a2')
on conflict (id) do nothing;

-- Una nota internal y una customer — supabase/tests/0050_intake_cases.sql
-- prueba que la internal nunca queda expuesta a un cliente vinculado.
insert into case_notes (id, organization_id, case_id, visibility, body, author_id) values
  ('80000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'internal', 'Cliente algo impaciente, dar seguimiento cercano.', '00000000-0000-0000-0000-0000000000a2'),
  ('80000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'customer', 'Recibimos tu carro y ya iniciamos la inspección de frenos.', '00000000-0000-0000-0000-0000000000a2')
on conflict (id) do nothing;

insert into case_status_events (id, organization_id, case_id, from_status, to_status, actor_id) values
  ('80000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', null, 'new', '00000000-0000-0000-0000-0000000000a2'),
  ('80000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'new', 'triage', '00000000-0000-0000-0000-0000000000a2')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Agenda (R0-D Fase 2, ola 0060) — un recurso, una cita confirmada con su
-- reserva activa por organización, lo mínimo que
-- supabase/tests/0060_scheduling.sql necesita.
-- ---------------------------------------------------------------------------

insert into resources (id, organization_id, branch_id, resource_type, label) values
  ('81000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'bay', 'Bahía 1'),
  ('81000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'bay', 'Bahía Demo')
on conflict (id) do nothing;

insert into resource_capabilities (id, organization_id, resource_id, capability_key) values
  ('81000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'brake_service')
on conflict (id) do nothing;

insert into appointments (id, organization_id, branch_id, case_id, status, starts_at, ends_at, purpose, created_by, arrived_at) values
  ('81000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'arrived', '2026-07-31 14:00:00+00', '2026-07-31 15:00:00+00', 'Inspección de frenos', '00000000-0000-0000-0000-0000000000a2', '2026-07-31 14:05:00+00'),
  ('81000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000006', 'tentative', '2026-08-01 10:00:00+00', '2026-08-01 11:00:00+00', 'Revisión de frenos', '00000000-0000-0000-0000-0000000000b1', null)
on conflict (id) do nothing;

insert into appointment_resources (id, organization_id, appointment_id, resource_id) values
  ('81000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into resource_reservations (id, organization_id, resource_id, appointment_id, status, starts_at, ends_at, created_by) values
  ('81000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', 'active', '2026-07-31 14:00:00+00', '2026-07-31 15:00:00+00', '00000000-0000-0000-0000-0000000000a2')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Inspección + evidencia (R0-D Fase 2, ola 0070) — una inspección en curso
-- sobre el template de frenos sembrado por la propia migración 0070, con
-- un resultado, un finding, una recomendación y evidencia internal +
-- customer, lo mínimo que supabase/tests/0070_inspection_evidence.sql
-- necesita.
-- ---------------------------------------------------------------------------

insert into inspections (id, organization_id, case_id, vehicle_id, template_version_id, status, started_by, odometer_km_at_inspection)
select
  '82000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005',
  '70000000-0000-0000-0000-000000000001', v.id, 'in_progress', '00000000-0000-0000-0000-0000000000a3', 84210
from inspection_template_versions v
join inspection_templates t on t.id = v.template_id
where t.key = 'brakes' and v.version_number = 1
on conflict (id) do nothing;

insert into inspection_results (id, organization_id, inspection_id, template_item_id, axle, side, condition, provenance, actor_id, measured_at)
select '82000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', i.id, 'front', 'left', 'attention', 'measured', '00000000-0000-0000-0000-0000000000a3', '2026-07-31 14:30:00+00'
from inspection_template_items i where i.item_key = 'pad_thickness_inner'
on conflict (id) do nothing;

insert into measurements (id, organization_id, inspection_result_id, value, unit, provenance, actor_id, measured_at) values
  ('82000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', 3.2, 'mm', 'measured', '00000000-0000-0000-0000-0000000000a3', '2026-07-31 14:30:00+00')
on conflict (id) do nothing;

insert into findings (id, organization_id, case_id, inspection_id, inspection_result_id, description, urgency, visibility, actor_id) values
  ('82000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', 'Pastilla delantera izquierda por debajo del mínimo recomendado.', 'attention', 'customer', '00000000-0000-0000-0000-0000000000a3')
on conflict (id) do nothing;

insert into maintenance_recommendations (id, organization_id, case_id, vehicle_id, finding_id, trigger_kind, due_odometer_km, basis_kind, status, actor_id) values
  ('82000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000004', 'odometer', 90000, 'inspection', 'due_soon', '00000000-0000-0000-0000-0000000000a3')
on conflict (id) do nothing;

insert into upload_intents (id, organization_id, case_id, actor_id, purpose, declared_mime, visibility_requested, bucket, object_path, status, expires_at) values
  ('82000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a3', 'inspection_evidence', 'image/jpeg', 'customer', 'evidence-dtek', 'org-10000000/case-80000000/6f1c9e2e-photo.jpg', 'confirmed', now() + interval '1 hour')
on conflict (id) do nothing;

-- visibility_max=internal a propósito: demuestra que un link posterior con
-- visibility=customer NO puede ampliarlo (sección 8.3) — ver
-- supabase/tests/0070_inspection_evidence.sql.
insert into evidence_assets (id, organization_id, upload_intent_id, uploader_id, bucket, path, mime_declared, mime_detected, bytes, hash, uploaded_at, provenance, visibility_max, status) values
  ('82000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a3', 'evidence-dtek', 'org-10000000/case-80000000/6f1c9e2e-photo.jpg', 'image/jpeg', 'image/jpeg', 245760, 'a3f5c1d9e2b7...sha256demo', now(), 'observed', 'internal', 'verified')
on conflict (id) do nothing;

insert into evidence_links (id, organization_id, asset_id, entity_type, entity_id, visibility, actor_id) values
  ('82000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000007', 'finding', '82000000-0000-0000-0000-000000000004', 'customer', '00000000-0000-0000-0000-0000000000a3')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Catálogo de productos (0094_product_catalog.sql) — dos repuestos para
-- DTEK Servicios (uno con existencia, uno agotado, para que la UI futura
-- tenga un caso de "sin stock" que mostrar sin inventarlo) y uno para
-- Taller Demo, suficiente para que supabase/tests/0094_product_catalog.sql
-- pruebe aislamiento entre organizaciones.
-- ---------------------------------------------------------------------------

insert into product_catalog_items (id, organization_id, sku, category, name, description, brand, part_number, unit) values
  ('83000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'DTEK-PAD-001', 'frenos', 'Pastillas de freno delanteras', 'Juego de pastillas delanteras, cerámicas.', 'Brembo', 'P85020N', 'juego'),
  ('83000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'DTEK-OIL-005', 'lubricantes', 'Aceite de motor sintético 5W-30', 'Vendido por litro.', 'Mobil 1', null, 'litro'),
  ('83000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'DEMO-PAD-001', 'frenos', 'Pastillas de freno traseras', 'Juego de pastillas traseras, semi-metálicas.', 'Bosch', 'BP905', 'juego')
on conflict (id) do nothing;

insert into product_catalog_versions (id, organization_id, catalog_item_id, version_number, price_mode, fixed_amount, currency, quantity_on_hand, status) values
  ('83000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 1, 'fixed', 45000, 'GTQ', 6, 'active'),
  ('83000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', 1, 'fixed', 9500, 'GTQ', 0, 'active'),
  ('83000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000003', 1, 'fixed', 38000, 'GTQ', 4, 'active')
on conflict (id) do nothing;
