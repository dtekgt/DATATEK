#!/usr/bin/env node
// Generador determinista de constantes TypeScript y referencia SQL a partir de
// packages/domain/spec/domain-spec.r0.yaml (R0-A sección 13).
//
// `pnpm spec:generate` escribe los artefactos generados.
// `pnpm spec:check` falla si el output generado difiere del commiteado.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const domainRoot = path.resolve(__dirname, "..");
const specPath = path.join(domainRoot, "spec", "domain-spec.r0.yaml");
const generatedDir = path.join(domainRoot, "generated");
const tsOutPath = path.join(generatedDir, "spec.constants.ts");
const sqlOutPath = path.join(generatedDir, "spec.reference.sql");

const CHECK_MODE = process.argv.includes("--check");

const raw = readFileSync(specPath, "utf8");
const spec = parse(raw);

const ENUM_KEYS = [
  "quote_version_statuses",
  "authorization_request_statuses",
  "authorization_statuses",
  "case_statuses",
  "provenance",
  "visibility",
  "vehicle_now_statuses",
  "service_price_modes",
  "maintenance_trigger_kinds",
  "maintenance_statuses",
  "brake_conditions",
  "organization_permissions",
  "platform_permissions",
];

// Maps of role template name -> list of permission strings (R0-C sección 4/8).
const ROLE_TEMPLATE_KEYS = ["organization_role_templates", "platform_role_templates"];

function toConstName(key) {
  return key.toUpperCase();
}

// Explicit, readable singular type names (deterministic, hand-mapped).
const TYPE_NAMES = {
  quote_version_statuses: "QuoteVersionStatus",
  authorization_request_statuses: "AuthorizationRequestStatus",
  authorization_statuses: "AuthorizationStatus",
  case_statuses: "CaseStatus",
  provenance: "Provenance",
  visibility: "Visibility",
  vehicle_now_statuses: "VehicleNowStatus",
  service_price_modes: "ServicePriceMode",
  maintenance_trigger_kinds: "MaintenanceTriggerKind",
  maintenance_statuses: "MaintenanceStatus",
  brake_conditions: "BrakeCondition",
  organization_permissions: "OrganizationPermission",
  platform_permissions: "PlatformPermission",
};

const ROLE_TEMPLATE_TYPE_NAMES = {
  organization_role_templates: {
    constName: "ORGANIZATION_ROLE_TEMPLATES",
    typeName: "OrganizationRoleTemplateKey",
    permissionType: "OrganizationPermission",
  },
  platform_role_templates: {
    constName: "PLATFORM_ROLE_TEMPLATES",
    typeName: "PlatformRoleTemplateKey",
    permissionType: "PlatformPermission",
  },
};

function buildTs() {
  const lines = [];
  lines.push("// GENERATED FILE — do not edit by hand.");
  lines.push("// Source: packages/domain/spec/domain-spec.r0.yaml");
  lines.push("// Regenerate with `pnpm spec:generate`. Verify with `pnpm spec:check`.");
  lines.push("");
  lines.push(`export const SPEC_VERSION = ${JSON.stringify(spec.spec_version)} as const;`);
  lines.push(`export const LOCALE_SEED = ${JSON.stringify(spec.locale_seed)} as const;`);
  lines.push(`export const TIMEZONE_SEED = ${JSON.stringify(spec.timezone_seed)} as const;`);
  lines.push(`export const CURRENCY_SEED = ${JSON.stringify(spec.currency_seed)} as const;`);
  lines.push("");

  for (const key of ENUM_KEYS) {
    const values = spec[key];
    if (!Array.isArray(values)) {
      throw new Error(`Spec key missing or not an array: ${key}`);
    }
    const constName = toConstName(key).toUpperCase();
    const typeName = TYPE_NAMES[key];
    lines.push(`export const ${constName} = ${JSON.stringify(values)} as const;`);
    lines.push(`export type ${typeName} = (typeof ${constName})[number];`);
    lines.push("");
  }

  for (const key of ROLE_TEMPLATE_KEYS) {
    const value = spec[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Spec key missing or not a map: ${key}`);
    }
    const { constName, typeName, permissionType } = ROLE_TEMPLATE_TYPE_NAMES[key];
    lines.push(
      `export const ${constName}: Record<string, readonly ${permissionType}[]> = ${JSON.stringify(value, null, 2)} as const;`,
    );
    lines.push(`export type ${typeName} = keyof typeof ${constName};`);
    lines.push("");
  }

  lines.push(
    "export const SECURITY_SPEC = " + JSON.stringify(spec.security, null, 2) + " as const;",
  );
  lines.push("");
  lines.push(
    "export const EXPERIENCE_SPEC = " + JSON.stringify(spec.experience, null, 2) + " as const;",
  );
  lines.push("");
  lines.push("export type SecuritySpec = typeof SECURITY_SPEC;");
  lines.push("export type ExperienceSpec = typeof EXPERIENCE_SPEC;");
  lines.push("");

  return lines.join("\n") + "\n";
}

function buildSql() {
  const lines = [];
  lines.push("-- GENERATED FILE — do not edit by hand.");
  lines.push("-- Source: packages/domain/spec/domain-spec.r0.yaml");
  lines.push("-- Regenerate with `pnpm spec:generate`.");
  lines.push("--");
  lines.push("-- Referencia informativa de los enums normativos R0.");
  lines.push("-- No crea tablas ni tipos reales; R0-B no toca Postgres de negocio.");
  lines.push("-- R0-C/R0-D crearán los CREATE TYPE / CHECK constraints reales por ola.");
  lines.push("");

  for (const key of ENUM_KEYS) {
    const values = spec[key];
    lines.push(`-- ${key}`);
    lines.push("-- DO $$ BEGIN");
    lines.push(`--   -- valores permitidos: ${values.map((v) => `'${v}'`).join(", ")}`);
    lines.push("-- END $$;");
    lines.push("");
  }

  for (const key of ROLE_TEMPLATE_KEYS) {
    const value = spec[key];
    lines.push(`-- ${key}`);
    for (const [role, perms] of Object.entries(value)) {
      lines.push(`--   ${role}: ${perms.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("-- security");
  for (const [k, v] of Object.entries(spec.security)) {
    lines.push(`--   ${k} = ${JSON.stringify(v)}`);
  }
  lines.push("");
  lines.push("-- experience");
  for (const [k, v] of Object.entries(spec.experience)) {
    lines.push(`--   ${k} = ${JSON.stringify(v)}`);
  }
  lines.push("");

  return lines.join("\n") + "\n";
}

const nextTs = buildTs();
const nextSql = buildSql();

if (CHECK_MODE) {
  let drift = false;
  for (const [outPath, next, label] of [
    [tsOutPath, nextTs, "spec.constants.ts"],
    [sqlOutPath, nextSql, "spec.reference.sql"],
  ]) {
    if (!existsSync(outPath)) {
      console.error(`[spec:check] Missing generated file: ${label}`);
      drift = true;
      continue;
    }
    const current = readFileSync(outPath, "utf8");
    if (current !== next) {
      console.error(`[spec:check] Drift detected in ${label}. Run \`pnpm spec:generate\`.`);
      drift = true;
    }
  }
  if (drift) {
    process.exit(1);
  }
  console.log("[spec:check] Generated spec artifacts match domain-spec.r0.yaml.");
  process.exit(0);
} else {
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(tsOutPath, nextTs, "utf8");
  writeFileSync(sqlOutPath, nextSql, "utf8");
  console.log("[spec:generate] Wrote spec.constants.ts and spec.reference.sql");
}
