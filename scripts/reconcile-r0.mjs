#!/usr/bin/env node
// Reconciliación R0 (Puerta 19): rutas reales contra el registro, y tablas
// reales contra las 78 esperadas. Genera además el ER del esquema realmente
// implementado, que el handoff exige como documentación obligatoria.
//
// El ER se GENERA desde las migraciones en vez de escribirse a mano por una
// razón concreta: un ER escrito a mano describe lo que alguien creyó haber
// implementado. Éste describe lo que las migraciones realmente crean, y si
// alguien agrega una tabla sin actualizar el documento, el gate falla.
//
//   node ./scripts/reconcile-r0.mjs           → verifica
//   node ./scripts/reconcile-r0.mjs --write   → verifica y reescribe el ER

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

const EXPECTED_TABLES = 78;
// R0-A sección 12 fija 58 entradas de registro. Eso NO es 58 archivos: cinco
// paths están registrados dos veces y la diferencia importa, porque contar
// archivos y llamarlo "58 rutas" da un número que cuadra por accidente.
//
//   · `/`, `/security`, `/status` existen como archivo en web Y en control;
//   · `/pass` y `/market` son un solo archivo que sirve dos superficies
//     (marketing para el visitante, experiencia real para el usuario).
//
// De ahí: 58 entradas → 53 paths distintos → 56 archivos `page.tsx`.
const EXPECTED_REGISTRY_ENTRIES = 58;

// ===========================================================================
// Rutas
// ===========================================================================

const SURFACE_BY_GROUP = {
  "(public)": "Sitio público",
  "(pro)": "Datatek Pro",
  "(pass)": "Datatek Pass",
  "(market)": "Datatek Market",
};

function collectRoutes(appDir, appName) {
  const base = join(ROOT, "apps", appDir, "src", "app");
  const out = [];
  const walk = (dir, segments, group) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "api") continue; // endpoints, no rutas de interfaz
        const isGroup = entry.startsWith("(") && entry.endsWith(")");
        walk(full, isGroup ? segments : [...segments, entry], isGroup ? entry : group);
      } else if (entry === "page.tsx") {
        const url = "/" + segments.join("/");
        const src = readFileSync(full, "utf8");
        out.push({
          url: url === "/" ? "/" : url,
          app: appName,
          surface:
            appName === "control"
              ? "Datatek Control"
              : (SURFACE_BY_GROUP[group] ?? "Sitio público"),
          planned: /\bPlannedRoute\b/.test(src),
        });
      }
    }
  };
  walk(base, [], null);
  return out;
}

const routes = [...collectRoutes("web", "web"), ...collectRoutes("control", "control")].sort(
  (a, b) => a.url.localeCompare(b.url),
);

// `/a/[token]` cuenta como Pass en el registro (es la superficie del cliente).
for (const r of routes) if (r.url.startsWith("/a/")) r.surface = "Datatek Pass";

const bySurface = {};
for (const r of routes) {
  bySurface[r.surface] ??= { total: 0, planned: 0 };
  bySurface[r.surface].total++;
  if (r.planned) bySurface[r.surface].planned++;
}

// Paridad filesystem ↔ registro sobre paths distintos. Es la comprobación que
// de verdad importa: que no exista una ruta servida sin declarar, ni una
// declarada que nadie sirve.
const registrySrc = readFileSync(
  join(ROOT, "packages", "domain", "src", "routes", "route-registry.ts"),
  "utf8",
);
const registryEntries = [...registrySrc.matchAll(/^\s*path:\s*"([^"]+)"/gm)].map((m) => m[1]);
const registryPaths = new Set(registryEntries);
const fsPaths = new Set(routes.map((r) => r.url));
const soloFs = [...fsPaths].filter((p) => !registryPaths.has(p)).sort();
const soloRegistro = [...registryPaths].filter((p) => !fsPaths.has(p)).sort();

// ===========================================================================
// Esquema
// ===========================================================================

const migrationsDir = join(ROOT, "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const tables = [];
const rlsEnabled = new Set();

for (const file of migrations) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");

  for (const m of sql.matchAll(
    /^\s*alter\s+table\s+([a-z_][a-z0-9_.]*)\s+enable\s+row\s+level\s+security/gim,
  )) {
    rlsEnabled.add(m[1].replace(/^public\./, ""));
  }

  const re = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_.]*)\s*\(/gim;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].replace(/^public\./, "");
    // Cuerpo hasta el `);` que cierra la definición, contando paréntesis.
    let depth = 0;
    let i = sql.indexOf("(", m.index + m[0].length - 1);
    const start = i + 1;
    for (; i < sql.length; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = sql.slice(start, i);
    const fks = [];
    for (const f of body.matchAll(/references\s+([a-z_][a-z0-9_.]*)\s*\(/gi)) {
      const target = f[1].replace(/^public\./, "");
      if (!fks.includes(target)) fks.push(target);
    }
    const columns = body
      .split(/,\n/)
      .map((l) => l.trim())
      .filter((l) =>
        /^[a-z_][a-z0-9_]*\s+(uuid|text|int|bigint|smallint|boolean|numeric|timestamptz|date|jsonb|bytea)/i.test(
          l,
        ),
      )
      .map((l) => l.split(/\s+/)[0]);
    tables.push({ name, migration: file, fks, columnCount: columns.length });
  }
}

// ===========================================================================
// Veredicto
// ===========================================================================

const problems = [];
if (tables.length !== EXPECTED_TABLES) {
  problems.push(`tablas: ${tables.length} reales vs ${EXPECTED_TABLES} esperadas`);
}
if (registryEntries.length !== EXPECTED_REGISTRY_ENTRIES) {
  problems.push(
    `registro: ${registryEntries.length} entradas vs ${EXPECTED_REGISTRY_ENTRIES} esperadas`,
  );
}
for (const p of soloFs) problems.push(`ruta servida sin declarar en el registro: ${p}`);
for (const p of soloRegistro) problems.push(`ruta declarada que nadie sirve: ${p}`);
const sinRls = tables.filter((t) => !rlsEnabled.has(t.name)).map((t) => t.name);

console.log(`registro: ${registryEntries.length} entradas · ${registryPaths.size} paths distintos`);
console.log(`filesystem: ${routes.length} archivos page.tsx · ${fsPaths.size} paths distintos`);
console.log(`paridad filesystem ↔ registro: ${soloFs.length + soloRegistro.length} diferencias`);
for (const [surface, v] of Object.entries(bySurface).sort()) {
  console.log(`  · ${surface}: ${v.total} archivos (planned: ${v.planned})`);
}
console.log(
  `funcionales: ${routes.filter((r) => !r.planned).length} · planned: ${routes.filter((r) => r.planned).length}`,
);
console.log(`tablas reales: ${tables.length} (esperadas ${EXPECTED_TABLES})`);
console.log(`tablas con RLS habilitada: ${rlsEnabled.size}`);
if (sinRls.length) console.log(`  · sin RLS explícita: ${sinRls.join(", ")}`);

// ===========================================================================
// ER
// ===========================================================================

const MODULES = {
  "0000_foundation.sql": "Fundación (extensiones, helpers, auditoría)",
  "0010_identity_tenancy_isolation.sql": "Identidad, tenancy y aislamiento",
  "0020_crm.sql": "CRM",
  "0030_vehicles_access.sql": "Vehículos y acceso",
  "0040_catalog.sql": "Catálogo",
  "0050_intake_cases.sql": "Intake y casos",
  "0060_scheduling.sql": "Agenda",
  "0070_inspection_evidence.sql": "Inspección y evidencia",
  "0080_quote_authorization.sql": "Cotización y autorización",
  "0085_transactional_trust.sql": "Confianza transaccional",
  "0086_features.sql": "Feature flags",
  "0087_documents.sql": "Documentos",
  "0090_query_projections_and_health.sql": "Proyecciones de consulta y salud",
};

function buildEr() {
  const lines = [];
  lines.push("# ER del esquema realmente implementado");
  lines.push("");
  lines.push("> **Generado**, no escrito a mano: `pnpm reconcile:r0 --write` lo deriva de");
  lines.push("> `supabase/migrations/*.sql`. Un ER redactado a mano describe lo que alguien");
  lines.push("> creyó implementar; éste describe lo que las migraciones crean. Si alguien");
  lines.push("> agrega una tabla sin regenerarlo, `pnpm reconcile:r0` falla.");
  lines.push("");
  lines.push("## Alcance verificado");
  lines.push("");
  lines.push("| Métrica | Real | Esperado |");
  lines.push("|---|---:|---:|");
  lines.push(`| Tablas | ${tables.length} | ${EXPECTED_TABLES} |`);
  lines.push(`| Migraciones | ${migrations.length} | \`0000\`–\`0090\` |`);
  lines.push(`| Tablas con RLS habilitada | ${rlsEnabled.size} | ${tables.length} |`);
  lines.push(
    `| Entradas de registro de rutas | ${registryEntries.length} | ${EXPECTED_REGISTRY_ENTRIES} |`,
  );
  lines.push(`| Paths distintos servidos | ${fsPaths.size} | ${registryPaths.size} |`);
  lines.push("");
  lines.push("Las migraciones son artefactos **autorizados pero no ejecutados** en esta");
  lines.push("máquina: no hay Docker ni Supabase CLI, así que este ER refleja el SQL fuente");
  lines.push("revisado estáticamente, no un `information_schema` consultado. Ver");
  lines.push("`docs/runbooks/database-reset.md`.");
  lines.push("");

  for (const mig of migrations) {
    const own = tables.filter((t) => t.migration === mig);
    if (own.length === 0) continue;
    lines.push(`## ${MODULES[mig] ?? mig} — \`${mig}\``);
    lines.push("");
    lines.push("| Tabla | Columnas | RLS | Referencias a |");
    lines.push("|---|---:|:---:|---|");
    for (const t of own) {
      const fks = t.fks.length ? t.fks.map((f) => `\`${f}\``).join(", ") : "—";
      lines.push(
        `| \`${t.name}\` | ${t.columnCount} | ${rlsEnabled.has(t.name) ? "sí" : "**no**"} | ${fks} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Diagrama de relaciones");
  lines.push("");
  lines.push("```mermaid");
  lines.push("erDiagram");
  const known = new Set(tables.map((t) => t.name));
  for (const t of tables) {
    for (const fk of t.fks) {
      if (known.has(fk) && fk !== t.name) lines.push(`  ${fk} ||--o{ ${t.name} : ""`);
    }
  }
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

const erPath = join(ROOT, "docs", "domain", "er-implemented.md");
const er = buildEr();
if (WRITE) {
  writeFileSync(erPath, er, "utf8");
  console.log(`ER escrito: docs/domain/er-implemented.md (${er.length} bytes)`);
} else {
  let current = null;
  try {
    current = readFileSync(erPath, "utf8");
  } catch {
    problems.push("docs/domain/er-implemented.md no existe — corre `pnpm reconcile:r0 --write`");
  }
  if (current !== null && current !== er) {
    problems.push("docs/domain/er-implemented.md está desactualizado respecto a las migraciones");
  }
}

if (problems.length) {
  console.error("\nRECONCILIACIÓN R0: FALLA");
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log("\nRECONCILIACIÓN R0: OK");
