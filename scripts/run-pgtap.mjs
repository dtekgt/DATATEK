#!/usr/bin/env node
// `pnpm test:db:live` — ejecuta supabase/tests/*.sql (pgTAP) contra un
// Postgres alcanzable y reporta el TAP resultante.
//
// Complementa a `pnpm test:db`, que solo revisa el SQL de forma estática.
// Este sí prueba que la RLS aísla de verdad, no que esté "habilitada".
//
// Cada archivo abre su propia transacción y termina en `rollback`, así que
// las pruebas no dejan filas. La semilla (supabase/seeds/local_actors.sql)
// sí persiste: se aplica con --seed y es idempotente.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const testsDir = path.join(repoRoot, "supabase", "tests");
const seedFile = path.join(repoRoot, "supabase", "seeds", "local_actors.sql");

const withSeed = process.argv.includes("--seed");

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(repoRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* opcional */
  }
}

loadEnvLocal();

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("[test:db:live] Falta SUPABASE_DB_URL en .env.local.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, application_name: "datatek-pgtap" });

// Parsea salida TAP: cuenta ok / not ok y devuelve los fallos con su texto.
function parseTap(lines) {
  let ok = 0;
  const failures = [];
  for (const line of lines) {
    if (/^ok\b/.test(line)) ok += 1;
    else if (/^not ok\b/.test(line)) failures.push(line);
  }
  return { ok, failures };
}

async function main() {
  await client.connect();

  await client.query(`create extension if not exists pgtap;`);

  if (withSeed) {
    process.stdout.write("[test:db:live] Aplicando semilla de actores ... ");
    await client.query(readFileSync(seedFile, "utf8"));
    console.log("ok");
  }

  const files = readdirSync(testsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let totalOk = 0;
  let totalFail = 0;

  for (const file of files) {
    const sql = readFileSync(path.join(testsDir, file), "utf8");
    process.stdout.write(`  ${file} ... `);
    try {
      const result = await client.query(sql);
      // El resultado útil es el del `select * from finish()` y los selects
      // de pgTAP: cada fila es una línea TAP en la primera columna.
      const lines = [];
      for (const r of Array.isArray(result) ? result : [result]) {
        if (!r || !r.rows) continue;
        for (const row of r.rows) {
          const first = Object.values(row)[0];
          if (typeof first === "string") lines.push(...first.split("\n"));
        }
      }
      const { ok, failures } = parseTap(lines);
      totalOk += ok;
      totalFail += failures.length;
      if (failures.length === 0) {
        console.log(`${ok} ok`);
      } else {
        console.log(`${ok} ok, ${failures.length} FALLARON`);
        for (const f of failures) console.log(`      ${f}`);
      }
    } catch (error) {
      await client.query("rollback").catch(() => {});
      totalFail += 1;
      console.log("ERROR");
      console.error(`      ${error.message}`);
    }
  }

  console.log(`\n[test:db:live] Aserciones ok: ${totalOk} · fallidas: ${totalFail}`);
  if (totalFail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`[test:db:live] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
