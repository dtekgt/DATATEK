// GENERATED FILE — do not edit by hand.
// Source: packages/domain/spec/domain-spec.r0.yaml
// Regenerate with `pnpm spec:generate`. Verify with `pnpm spec:check`.

export const SPEC_VERSION = "r0.1" as const;
export const LOCALE_SEED = "es-GT" as const;
export const TIMEZONE_SEED = "America/Guatemala" as const;
export const CURRENCY_SEED = "GTQ" as const;

export const QUOTE_VERSION_STATUSES = ["draft","frozen","superseded","voided"] as const;
export type QuoteVersionStatus = (typeof QUOTE_VERSION_STATUSES)[number];

export const AUTHORIZATION_REQUEST_STATUSES = ["prepared","sent","viewed","decided","expired","revoked"] as const;
export type AuthorizationRequestStatus = (typeof AUTHORIZATION_REQUEST_STATUSES)[number];

export const AUTHORIZATION_STATUSES = ["accepted","partially_accepted","rejected","invalidated"] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const CASE_STATUSES = ["new","triage","waiting_customer","scheduled","received","inspection","waiting_authorization","ready","in_progress","blocked","quality","ready_for_delivery","delivered","closed","cancelled"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PROVENANCE = ["observed","measured","reported","estimated","derived"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const VISIBILITY = ["internal","customer","shared_case"] as const;
export type Visibility = (typeof VISIBILITY)[number];

export const VEHICLE_NOW_STATUSES = ["action_required","attention","no_current_alerts","unknown","stale"] as const;
export type VehicleNowStatus = (typeof VEHICLE_NOW_STATUSES)[number];

export const SERVICE_PRICE_MODES = ["fixed","from","range","inspection_required","diagnosis_required"] as const;
export type ServicePriceMode = (typeof SERVICE_PRICE_MODES)[number];

export const MAINTENANCE_TRIGGER_KINDS = ["date","odometer","whichever_first","condition"] as const;
export type MaintenanceTriggerKind = (typeof MAINTENANCE_TRIGGER_KINDS)[number];

export const MAINTENANCE_STATUSES = ["upcoming","due_soon","due","overdue","unknown"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const BRAKE_CONDITIONS = ["pass","attention","fail","not_inspected","not_applicable"] as const;
export type BrakeCondition = (typeof BRAKE_CONDITIONS)[number];

export const ORGANIZATION_PERMISSIONS = ["organization.read","organization.manage","branch.manage","membership.read","membership.manage","role.assign","catalog.read","catalog.manage","audit.read_organization","crm.read","crm.manage","vehicle.read","vehicle.manage","intake.read","intake.manage","agenda.read","agenda.manage","inspection.read","inspection.publish","evidence.read_internal","evidence.read_customer","evidence.upload","evidence.publish_to_customer","quote.read","quote.manage","authorization.request","authorization.decide","work.read","work.manage","quality.manage","finance.read","finance.manage","parts.read","parts.manage","history.dispute","history.correct"] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

export const PLATFORM_PERMISSIONS = ["platform.control.enter","platform.organization.manage","platform.catalog.manage","platform.feature.manage","platform.support.manage","platform.security.read","platform.audit.read","platform.access.request","platform.access.approve","platform.access.use"] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const ORGANIZATION_ROLE_TEMPLATES: Record<string, readonly OrganizationPermission[]> = {
  "owner": [
    "organization.read",
    "organization.manage",
    "branch.manage",
    "membership.read",
    "membership.manage",
    "role.assign",
    "catalog.read",
    "catalog.manage",
    "audit.read_organization",
    "crm.read",
    "crm.manage",
    "vehicle.read",
    "vehicle.manage",
    "intake.read",
    "intake.manage",
    "agenda.read",
    "agenda.manage",
    "inspection.read",
    "inspection.publish",
    "evidence.read_internal",
    "evidence.read_customer",
    "evidence.upload",
    "evidence.publish_to_customer",
    "quote.read",
    "quote.manage",
    "authorization.request",
    "authorization.decide",
    "work.read",
    "work.manage",
    "quality.manage",
    "finance.read",
    "finance.manage",
    "parts.read",
    "parts.manage",
    "history.dispute",
    "history.correct"
  ],
  "advisor": [
    "organization.read",
    "membership.read",
    "catalog.read",
    "crm.read",
    "crm.manage",
    "vehicle.read",
    "vehicle.manage",
    "intake.read",
    "intake.manage",
    "agenda.read",
    "agenda.manage",
    "inspection.read",
    "evidence.read_internal",
    "evidence.read_customer",
    "evidence.upload",
    "evidence.publish_to_customer",
    "quote.read",
    "quote.manage",
    "authorization.request",
    "work.read",
    "parts.read",
    "history.dispute"
  ],
  "inspector": [
    "organization.read",
    "catalog.read",
    "vehicle.read",
    "inspection.read",
    "inspection.publish",
    "evidence.read_internal",
    "evidence.upload",
    "work.read"
  ],
  "mechanic": [
    "organization.read",
    "catalog.read",
    "vehicle.read",
    "work.read",
    "work.manage",
    "parts.read"
  ],
  "cashier": [
    "organization.read",
    "catalog.read",
    "finance.read",
    "finance.manage",
    "parts.read"
  ],
  "customer": [
    "crm.read"
  ]
} as const;
export type OrganizationRoleTemplateKey = keyof typeof ORGANIZATION_ROLE_TEMPLATES;

export const PLATFORM_ROLE_TEMPLATES: Record<string, readonly PlatformPermission[]> = {
  "platform_support": [
    "platform.control.enter",
    "platform.access.request",
    "platform.access.use"
  ],
  "platform_security": [
    "platform.control.enter",
    "platform.security.read",
    "platform.audit.read"
  ],
  "platform_admin": [
    "platform.control.enter",
    "platform.organization.manage",
    "platform.catalog.manage",
    "platform.feature.manage",
    "platform.support.manage",
    "platform.security.read",
    "platform.audit.read",
    "platform.access.approve",
    "platform.access.use"
  ],
  "platform_auditor": [
    "platform.control.enter",
    "platform.audit.read",
    "platform.security.read"
  ]
} as const;
export type PlatformRoleTemplateKey = keyof typeof PLATFORM_ROLE_TEMPLATES;

export const SECURITY_SPEC = {
  "permission_model": "additive",
  "explicit_deny": false,
  "rls_with_each_table": true,
  "platform_roles_separate": true,
  "control_session_separate": true,
  "offline_sensitive_writes": false,
  "authorization_token_max_attempts": 5
} as const;

export const EXPERIENCE_SPEC = {
  "max_immediate_decisions": 3,
  "global_vehicle_health_score": false,
  "guest_authorization_requires_account": false,
  "plain_language_first": true,
  "technical_detail_on_demand": true,
  "guided_complex_flows": true,
  "reuse_known_data": true
} as const;

export type SecuritySpec = typeof SECURITY_SPEC;
export type ExperienceSpec = typeof EXPERIENCE_SPEC;

