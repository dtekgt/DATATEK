#!/usr/bin/env node
// `pnpm test:db` — static contract check for supabase/migrations, run
// without Docker or a live Postgres. Confirms each migration exists,
// creates no business tables, contains no secrets or production hosts, and
// (for 0010, R0-C) that every one of the 17 tables enables RLS. Full
// `db:reset` + pgTAP execution is deferred to a future session with Docker
// Desktop — see docs/runbooks/database-reset.md.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "..", "supabase", "migrations");

const forbiddenBusinessTables = [
  "create table cases",
  "create table customers",
  "create table vehicles",
  "create table quotes",
  "create table authorizations",
];
const forbiddenSecrets = ["service_role_key", "sk_live", "-----begin"];
const forbiddenHosts = [".supabase.co", "amazonaws.com/prod"];

let failed = false;

function checkCommon(name, sql) {
  const lower = sql.toLowerCase();
  for (const needle of forbiddenBusinessTables) {
    if (lower.includes(needle)) {
      console.error(
        `[test:db] Migration ${name} must not create business tables (${needle} found).`,
      );
      failed = true;
    }
  }
  for (const needle of forbiddenSecrets) {
    if (lower.includes(needle)) {
      console.error(`[test:db] Migration ${name} must not contain secrets (${needle} found).`);
      failed = true;
    }
  }
  for (const needle of forbiddenHosts) {
    if (lower.includes(needle)) {
      console.error(
        `[test:db] Migration ${name} must not reference production hosts (${needle} found).`,
      );
      failed = true;
    }
  }
}

// --- 0000_foundation.sql ---------------------------------------------------
const path0000 = path.join(migrationsDir, "0000_foundation.sql");
if (!existsSync(path0000)) {
  console.error(`[test:db] Missing migration: ${path0000}`);
  process.exit(1);
}
checkCommon("0000", readFileSync(path0000, "utf8"));

// --- 0010_identity_tenancy_isolation.sql (R0-C) -----------------------------
const path0010 = path.join(migrationsDir, "0010_identity_tenancy_isolation.sql");
if (!existsSync(path0010)) {
  console.error(`[test:db] Missing migration: ${path0010}`);
  process.exit(1);
}
const sql0010 = readFileSync(path0010, "utf8");
checkCommon("0010", sql0010);

const requiredTables = [
  "user_profiles",
  "organizations",
  "organization_slug_history",
  "organization_branches",
  "permissions",
  "role_templates",
  "role_template_permissions",
  "organization_memberships",
  "membership_roles",
  "membership_branch_scopes",
  "organization_settings",
  "organization_counters",
  "platform_memberships",
  "platform_role_templates",
  "platform_role_permissions",
  "platform_membership_roles",
  "support_access_sessions",
];

for (const table of requiredTables) {
  if (!new RegExp(`create table ${table}\\b`, "i").test(sql0010)) {
    console.error(`[test:db] 0010 must create table ${table} (sección 3, 17 tablas).`);
    failed = true;
  }
  if (!new RegExp(`alter table ${table} enable row level security`, "i").test(sql0010)) {
    console.error(
      `[test:db] 0010 must enable RLS on ${table} (sección 6.1: "RLS en cada tabla expuesta").`,
    );
    failed = true;
  }
}

if (!/revoke all on all tables in schema public from public, anon, authenticated/i.test(sql0010)) {
  console.error(
    "[test:db] 0010 must revoke default public/anon/authenticated grants before granting minimal access.",
  );
  failed = true;
}

// --- seeds + pgTAP artifacts exist (written, not executed here) -----------
const seedPath = path.resolve(__dirname, "..", "supabase", "seeds", "local_actors.sql");
const pgtapPath = path.resolve(__dirname, "..", "supabase", "tests", "0010_identity_tenancy.sql");
if (!existsSync(seedPath)) {
  console.error(`[test:db] Missing seed file: ${seedPath}`);
  failed = true;
}
if (!existsSync(pgtapPath)) {
  console.error(`[test:db] Missing pgTAP file: ${pgtapPath}`);
  failed = true;
}

if (failed) process.exit(1);
console.log(
  "[test:db] Static contract OK: 0000 and 0010 have no business tables, secrets, or production hosts.",
);
console.log(
  "[test:db] 0010 creates all 17 sección-3 tables with RLS enabled and revoked default grants.",
);
console.log(
  "[test:db] supabase/seeds/local_actors.sql and supabase/tests/0010_identity_tenancy.sql exist.",
);
console.log(
  "[test:db] Live db:reset + pgTAP execution require Docker Desktop — implemented_pending_environment_evidence, see docs/runbooks/database-reset.md.",
);
