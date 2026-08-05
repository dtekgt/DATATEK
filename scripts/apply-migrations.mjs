#!/usr/bin/env node
// `pnpm db:migrate` — aplica supabase/migrations/*.sql contra un Postgres
// alcanzable, en orden lexicográfico y una transacción por archivo.
//
// Existe porque la CLI de Supabase no corre en todos los equipos (Smart App
// Control de Windows bloquea su binario, ver docs/runbooks/database-reset.md).
// `pg` es JavaScript puro, así que no depende de ningún ejecutable externo.
//
// No inventa estado: registra cada migración aplicada en
// `datatek_platform.schema_migrations` y vuelve a correr solo lo que falta.
// Si un archivo cambió después de aplicarse, lo detecta por hash y se detiene
// en vez de re-ejecutarlo en silencio (invariante 4: nada aplicado cambia sin
// dejar rastro).
//
// La cadena de conexión sale de SUPABASE_DB_URL y nunca se imprime.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const dryRun = process.argv.includes("--dry-run");

// --- configuración -------------------------------------------------------

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(repoRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) process.env[key] = value.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local es opcional: la variable puede venir del entorno.
  }
}

loadEnvLocal();

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    "[db:migrate] Falta SUPABASE_DB_URL.\n" +
      "  Copiala del panel de Supabase (Settings → Database → Connection string → URI)\n" +
      "  y pegala en .env.local. El archivo está en .gitignore.",
  );
  process.exit(1);
}

// Redacta la contraseña por si algún error de `pg` incluye la cadena.
function safeHost(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  } catch {
    return "destino no interpretable";
  }
}

// --- migraciones ---------------------------------------------------------

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("[db:migrate] No hay migraciones en supabase/migrations.");
  process.exit(1);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

const client = new pg.Client({ connectionString, application_name: "datatek-db-migrate" });

async function main() {
  console.log(`[db:migrate] Destino: ${safeHost(connectionString)}`);
  console.log(`[db:migrate] ${files.length} migraciones encontradas.`);
  if (dryRun) console.log("[db:migrate] --dry-run: no se escribe nada.\n");

  await client.connect();

  await client.query(`create schema if not exists datatek_platform;`);
  await client.query(`
    create table if not exists datatek_platform.schema_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    );
  `);

  const { rows } = await client.query(
    `select filename, checksum from datatek_platform.schema_migrations;`,
  );
  const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

  let ran = 0;
  let skipped = 0;

  for (const filename of files) {
    const sql = readFileSync(path.join(migrationsDir, filename), "utf8");
    const checksum = sha256(sql);
    const previous = applied.get(filename);

    if (previous) {
      if (previous !== checksum) {
        console.error(
          `\n[db:migrate] ${filename} ya se aplicó pero su contenido cambió.\n` +
            `  Aplicado: ${previous} · Ahora: ${checksum}\n` +
            `  Una migración aplicada no se reescribe: creá una nueva.`,
        );
        process.exitCode = 1;
        return;
      }
      skipped += 1;
      console.log(`  = ${filename} (ya aplicada)`);
      continue;
    }

    if (dryRun) {
      console.log(`  + ${filename} (se aplicaría)`);
      ran += 1;
      continue;
    }

    process.stdout.write(`  + ${filename} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        `insert into datatek_platform.schema_migrations (filename, checksum) values ($1, $2);`,
        [filename, checksum],
      );
      await client.query("commit");
      console.log("ok");
      ran += 1;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      console.log("FALLÓ");
      console.error(`\n[db:migrate] ${filename} falló y se revirtió por completo.`);
      console.error(`  ${error.message}`);
      if (error.position) console.error(`  Posición en el archivo: ${error.position}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    `\n[db:migrate] ${dryRun ? "Pendientes" : "Aplicadas"}: ${ran} · Ya estaban: ${skipped}`,
  );
}

main()
  .catch((error) => {
    console.error(`[db:migrate] Error de conexión o de sesión: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
