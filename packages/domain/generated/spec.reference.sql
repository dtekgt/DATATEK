-- GENERATED FILE — do not edit by hand.
-- Source: packages/domain/spec/domain-spec.r0.yaml
-- Regenerate with `pnpm spec:generate`.
--
-- Referencia informativa de los enums normativos R0.
-- No crea tablas ni tipos reales; R0-B no toca Postgres de negocio.
-- R0-C/R0-D crearán los CREATE TYPE / CHECK constraints reales por ola.

-- quote_version_statuses
-- DO $$ BEGIN
--   -- valores permitidos: 'draft', 'frozen', 'superseded', 'voided'
-- END $$;

-- authorization_request_statuses
-- DO $$ BEGIN
--   -- valores permitidos: 'prepared', 'sent', 'viewed', 'decided', 'expired', 'revoked'
-- END $$;

-- authorization_statuses
-- DO $$ BEGIN
--   -- valores permitidos: 'accepted', 'partially_accepted', 'rejected', 'invalidated'
-- END $$;

-- case_statuses
-- DO $$ BEGIN
--   -- valores permitidos: 'new', 'triage', 'waiting_customer', 'scheduled', 'received', 'inspection', 'waiting_authorization', 'ready', 'in_progress', 'blocked', 'quality', 'ready_for_delivery', 'delivered', 'closed', 'cancelled'
-- END $$;

-- provenance
-- DO $$ BEGIN
--   -- valores permitidos: 'observed', 'measured', 'reported', 'estimated', 'derived'
-- END $$;

-- visibility
-- DO $$ BEGIN
--   -- valores permitidos: 'internal', 'customer', 'shared_case'
-- END $$;

-- vehicle_now_statuses
-- DO $$ BEGIN
--   -- valores permitidos: 'action_required', 'attention', 'no_current_alerts', 'unknown', 'stale'
-- END $$;

-- service_price_modes
-- DO $$ BEGIN
--   -- valores permitidos: 'fixed', 'from', 'range', 'inspection_required', 'diagnosis_required'
-- END $$;

-- maintenance_trigger_kinds
-- DO $$ BEGIN
--   -- valores permitidos: 'date', 'odometer', 'whichever_first', 'condition'
-- END $$;

-- maintenance_statuses
-- DO $$ BEGIN
--   -- valores permitidos: 'upcoming', 'due_soon', 'due', 'overdue', 'unknown'
-- END $$;

-- brake_conditions
-- DO $$ BEGIN
--   -- valores permitidos: 'pass', 'attention', 'fail', 'not_inspected', 'not_applicable'
-- END $$;

-- organization_permissions
-- DO $$ BEGIN
--   -- valores permitidos: 'organization.read', 'organization.manage', 'branch.manage', 'membership.read', 'membership.manage', 'role.assign', 'catalog.read', 'catalog.manage', 'audit.read_organization', 'crm.read', 'crm.manage', 'vehicle.read', 'vehicle.manage', 'intake.read', 'intake.manage', 'agenda.read', 'agenda.manage', 'inspection.read', 'inspection.publish', 'evidence.read_internal', 'evidence.read_customer', 'evidence.upload', 'evidence.publish_to_customer', 'quote.read', 'quote.manage', 'authorization.request', 'authorization.decide', 'work.read', 'work.manage', 'quality.manage', 'finance.read', 'finance.manage', 'parts.read', 'parts.manage'
-- END $$;

-- platform_permissions
-- DO $$ BEGIN
--   -- valores permitidos: 'platform.control.enter', 'platform.organization.manage', 'platform.catalog.manage', 'platform.feature.manage', 'platform.support.manage', 'platform.security.read', 'platform.audit.read', 'platform.access.request', 'platform.access.approve', 'platform.access.use'
-- END $$;

-- organization_role_templates
--   owner: organization.read, organization.manage, branch.manage, membership.read, membership.manage, role.assign, catalog.read, catalog.manage, audit.read_organization, crm.read, crm.manage, vehicle.read, vehicle.manage, intake.read, intake.manage, agenda.read, agenda.manage, inspection.read, inspection.publish, evidence.read_internal, evidence.read_customer, evidence.upload, evidence.publish_to_customer, quote.read, quote.manage, authorization.request, authorization.decide, work.read, work.manage, quality.manage, finance.read, finance.manage, parts.read, parts.manage
--   advisor: organization.read, membership.read, catalog.read, crm.read, crm.manage, vehicle.read, vehicle.manage, intake.read, intake.manage, agenda.read, agenda.manage, inspection.read, evidence.read_internal, evidence.read_customer, evidence.upload, evidence.publish_to_customer, quote.read, quote.manage, authorization.request, work.read, parts.read
--   inspector: organization.read, catalog.read, vehicle.read, inspection.read, inspection.publish, evidence.read_internal, evidence.upload, work.read
--   mechanic: organization.read, catalog.read, vehicle.read, work.read, work.manage, parts.read
--   cashier: organization.read, catalog.read, finance.read, finance.manage, parts.read
--   customer: crm.read

-- platform_role_templates
--   platform_support: platform.control.enter, platform.access.request, platform.access.use
--   platform_security: platform.control.enter, platform.security.read, platform.audit.read
--   platform_admin: platform.control.enter, platform.organization.manage, platform.catalog.manage, platform.feature.manage, platform.support.manage, platform.security.read, platform.audit.read, platform.access.approve, platform.access.use
--   platform_auditor: platform.control.enter, platform.audit.read, platform.security.read

-- security
--   permission_model = "additive"
--   explicit_deny = false
--   rls_with_each_table = true
--   platform_roles_separate = true
--   control_session_separate = true
--   offline_sensitive_writes = false
--   authorization_token_max_attempts = 5

-- experience
--   max_immediate_decisions = 3
--   global_vehicle_health_score = false
--   guest_authorization_requires_account = false
--   plain_language_first = true
--   technical_detail_on_demand = true
--   guided_complex_flows = true
--   reuse_known_data = true

