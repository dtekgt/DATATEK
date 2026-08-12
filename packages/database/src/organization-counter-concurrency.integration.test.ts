// Prueba de integración de la corrección de concurrencia sobre
// `organization_counters` (folio de caso) — ver el comentario en
// `loadOrganizationCounter` (loaders.ts). Sin el `for update` ahí, dos
// transacciones concurrentes para la MISMA organización pueden hacer el
// mismo SELECT antes de que cualquiera haga COMMIT, `consumeOrganizationCounter`
// (función pura, sin cambios) calcula el mismo folio para ambas, y la
// segunda `INSERT INTO cases` termina en `23505 duplicate key` sobre
// `cases_organization_id_folio_number_key` — exactamente lo que
// `hybrid-engine.integration.test.ts` y `read-state.integration.test.ts`
// reprodujeron al correr en paralelo (Node `--test` paraleliza entre
// archivos por defecto) antes de esta corrección.
//
// Dispara varios `openCaseFromRequest` reales, concurrentes, contra la
// MISMA organización sembrada (DTEK) y el mismo actor — no un mock, no el
// motor en memoria — y confirma que todos ganan con folios distintos y
// consecutivos, sin colisión.
//
// Se salta si SUPABASE_DB_URL no está definida.
import { describe, it, after } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPostgresPool } from "./pool.ts";
import { createHybridCommandEngine } from "./hybrid-command-engine.ts";
import { buildCommandContext, createEmptyState } from "@datatek/application/commands";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(path.join(repoRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      const key = match?.[1];
      const value = match?.[2];
      if (!key || value === undefined) continue;
      if (!process.env[key]) process.env[key] = value.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local es opcional.
  }
}

loadEnvLocal();

const connectionString = process.env.SUPABASE_DB_URL;

const ORG_DTEK = "10000000-0000-0000-0000-000000000001";
const OWNER_DTEK = "00000000-0000-0000-0000-0000000000a1";

// Prefijo distintivo para poder limpiar por `display_name` — con creación
// concurrente no hay forma de predecir folios/ids de antemano, así que la
// limpieza busca por este marcador en vez de por id capturado antes de
// disparar las llamadas.
const MARKER = `conc-counter-${Date.now()}`;

describe(
  "Puerta A — organization_counters bajo escritores concurrentes, contra Postgres real",
  { skip: connectionString ? false : "SUPABASE_DB_URL no está definida en .env.local" },
  () => {
    const pool = connectionString ? createPostgresPool(connectionString) : null;

    after(async () => {
      if (!pool) return;
      const client = await pool.connect();
      try {
        const { rows: cases } = await client.query(
          `select c.id as case_id, c.customer_id, c.vehicle_id, c.source_intake_thread_id
             from cases c
             join customers cu on cu.id = c.customer_id
            where cu.display_name like $1`,
          [`${MARKER}%`],
        );
        for (const row of cases) {
          await client.query("delete from case_status_events where case_id = $1", [row.case_id]);
          await client.query("delete from reported_symptoms where case_id = $1", [row.case_id]);
          await client.query("delete from service_requests where case_id = $1", [row.case_id]);
          await client.query("delete from case_participants where case_id = $1", [row.case_id]);
          if (row.source_intake_thread_id) {
            await client.query("delete from intake_entries where thread_id = $1", [
              row.source_intake_thread_id,
            ]);
          }
          await client.query("delete from cases where id = $1", [row.case_id]);
          if (row.source_intake_thread_id) {
            await client.query("delete from intake_threads where id = $1", [
              row.source_intake_thread_id,
            ]);
          }
          if (row.vehicle_id) {
            await client.query("delete from vehicle_access_grants where vehicle_id = $1", [
              row.vehicle_id,
            ]);
            await client.query("delete from vehicle_identifiers where vehicle_id = $1", [
              row.vehicle_id,
            ]);
            await client.query("delete from vehicles where id = $1", [row.vehicle_id]);
          }
          await client.query("delete from customers where id = $1", [row.customer_id]);
        }
      } finally {
        client.release();
      }
      await pool.end();
    });

    it("N llamadas openCaseFromRequest concurrentes en la MISMA organización: todas ganan, folios distintos y consecutivos, sin 23505", async () => {
      if (!pool) return;
      const engine = createHybridCommandEngine(pool, createEmptyState());
      const CONCURRENCY = 5;

      const contexts = Array.from({ length: CONCURRENCY }, (_, i) =>
        buildCommandContext({
          actorId: OWNER_DTEK,
          organizationId: ORG_DTEK,
          capabilities: {
            membershipStatus: "active",
            membershipId: "integration-test-membership",
            permissions: ["crm.manage", "vehicle.manage", "intake.manage"],
            branchScope: "all",
          },
          idempotencyKey: `${MARKER}-key-${i}-${Date.now()}`,
          correlationId: crypto.randomUUID(),
        }),
      );

      const outcomes = await Promise.all(
        contexts.map((ctx, i) =>
          engine.openCaseFromRequest(ctx, {
            customer: { kind: "new", displayName: `${MARKER} Cliente ${i}` },
            vehicle: { kind: "new", vin: `1HGCM82633B${Date.now() % 100000}${i}` },
            channel: "walk_in",
            reportedText: `Prueba de concurrencia de folio ${i} — ruido en frenos.`,
          }),
        ),
      );

      for (const outcome of outcomes) {
        expect(outcome.ok).toBe(true);
      }

      const folios = outcomes
        .filter((o): o is Extract<typeof o, { ok: true }> => o.ok)
        .map((o) => o.data.case.folioNumber)
        .sort((a, b) => a - b);

      expect(folios).toHaveLength(CONCURRENCY);
      const uniqueFolios = new Set(folios);
      expect(uniqueFolios.size).toBe(CONCURRENCY); // sin folios duplicados

      for (let i = 1; i < folios.length; i += 1) {
        expect(folios[i]).toBe(folios[i - 1]! + 1); // consecutivos, sin huecos
      }
    });
  },
);
