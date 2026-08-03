#!/usr/bin/env node
// Verificación de aislamiento del legado (R0-E §17).
//
// El handoff exige comprobar cuatro cosas, y las cuatro se comprueban aquí
// sobre el árbol de fuentes real, no sobre la memoria de nadie:
//
//   1. cero imports runtime desde el legado;
//   2. cero URL o clave productiva;
//   3. cero escritura hacia el legado;
//   4. DTEKPro sólo aparece como texto de referencia.
//
// Es un gate ejecutable a propósito: una afirmación de aislamiento que no se
// puede volver a correr mañana no es una garantía, es una anécdota.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".git",
  "dist",
  "test-dist",
  "playwright-report",
  "test-results",
]);

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql|json|md)$/;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Todo archivo de fuente bajo la raíz, sin artefactos de build. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (SOURCE_EXT.test(entry)) yield full;
  }
}

const findings = [];
const report = (check, file, line, detail) =>
  findings.push({ check, file: relative(ROOT, file).split(sep).join("/"), line, detail });

// --- 1. Imports que salen del workspace -------------------------------------
// Un import relativo que resuelve fuera de la raíz es la única forma de
// alcanzar el legado sin nombrarlo, así que se resuelve de verdad cada
// especificador en vez de buscar cadenas sospechosas.
const IMPORT_RE =
  /(?:^|[^\w.])(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;

// --- 2. Secretos y hosts productivos ----------------------------------------
const FORBIDDEN = [
  { re: /[a-z0-9]{20}\.supabase\.co/i, label: "host Supabase productivo" },
  { re: /\bsk_live_[A-Za-z0-9]/, label: "clave secreta live" },
  { re: /\bpk_live_[A-Za-z0-9]/, label: "clave pública live" },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, label: "llave privada" },
  { re: /amazonaws\.com\/prod/i, label: "bucket productivo" },
  // Un service_role real es un JWT de tres segmentos largos. El literal
  // "SUPABASE_SERVICE_ROLE_KEY" como NOMBRE de variable es legítimo.
  { re: /eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\./, label: "JWT embebido" },
];

// --- 3/4. Legado -------------------------------------------------------------
const LEGACY_NAME = /dtek\s*pro|dtekpro|dtek_pro|dtek-pro/i;
// Una mención es *ejecutable* (y por tanto prohibida) si vive en una línea que
// importa, navega, escribe o lee configuración. Nombrarlo en prosa no lo es.
const EXECUTABLE_CONTEXT =
  /\b(?:import|require|from\s*["']|fetch\(|axios|process\.env|createClient|connectionString|writeFile|appendFile|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b|https?:\/\//i;

const files = [...walk(ROOT)];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const isCode = CODE_EXT.test(file);
  const isTestOrScript = /[\\/](?:tests?|scripts)[\\/]|\.test\.|check-legacy-isolation/.test(file);

  if (isCode) {
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(text)) !== null) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      const line = text.slice(0, m.index).split(/\r?\n/).length;
      if (/^[A-Za-z]:[\\/]/.test(spec) || spec.startsWith("/")) {
        report("1-import-externo", file, line, `especificador absoluto: ${spec}`);
        continue;
      }
      if (LEGACY_NAME.test(spec)) {
        report("1-import-externo", file, line, `especificador de legado: ${spec}`);
        continue;
      }
      if (spec.startsWith(".")) {
        const resolved = resolve(dirname(file), spec);
        if (!resolved.startsWith(ROOT + sep) && resolved !== ROOT) {
          report("1-import-externo", file, line, `resuelve fuera de la raíz: ${spec}`);
        }
      }
    }
  }

  lines.forEach((raw, i) => {
    const n = i + 1;
    // Las listas de patrones prohibidos de los propios gates no son hallazgos.
    if (!isTestOrScript) {
      for (const { re, label } of FORBIDDEN) {
        if (re.test(raw)) report("2-secreto-o-produccion", file, n, label);
      }
    }
    if (LEGACY_NAME.test(raw) && !isTestOrScript) {
      const isDoc = /\.md$/.test(file);
      if (EXECUTABLE_CONTEXT.test(raw) && !isDoc) {
        report("3/4-legado-ejecutable", file, n, raw.trim().slice(0, 120));
      }
    }
  });
}

// Las menciones legítimas se listan para que el reporte final pueda citarlas.
const mentions = [];
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join("/");
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      if (LEGACY_NAME.test(raw) && !/check-legacy-isolation/.test(rel)) {
        mentions.push({ file: rel, line: i + 1, texto: raw.trim().slice(0, 100) });
      }
    });
}

console.log(`archivos de fuente inspeccionados: ${files.length}`);
console.log(`menciones a DTEKPro: ${mentions.length}`);
for (const m of mentions) console.log(`  · ${m.file}:${m.line} — ${m.texto}`);

if (findings.length === 0) {
  console.log("\nAISLAMIENTO DEL LEGADO: OK — 0 hallazgos en las 4 comprobaciones.");
  process.exit(0);
}

console.error(`\nAISLAMIENTO DEL LEGADO: ${findings.length} hallazgo(s)`);
for (const f of findings) console.error(`  [${f.check}] ${f.file}:${f.line} — ${f.detail}`);
process.exit(1);
