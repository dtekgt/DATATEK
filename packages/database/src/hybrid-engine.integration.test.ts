// Prueba de integración de punta a punta — el criterio de éxito de
// Puerta A tal cual lo define el documento de reorientación: "un caso
// creado por el Taller A persiste después de reiniciar el servidor, es
// visible para el actor autorizado, e imposible de leer para el Taller
// B." Corre `openCaseFromRequest` (el mismo comando compuesto que
// `apps/web/.../cases/actions.ts` llama en producción) a través del
// motor híbrido real, confirma que cada fila quedó en Postgres, y que
// una sesión de otra organización no puede leer el caso — sin ningún
// filtro de organización en la query de verificación, para que sea RLS
// quien lo pruebe, no un WHERE de este archivo.
//
// Se salta si SUPABASE_DB_URL no está definida (mismo gate que el resto
// de pruebas de integración de este paquete).
import { describe, it, after } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPostgresPool } from "./pool.ts";
import { withRlsRead } from "./rls-read.ts";
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
const OWNER_DEMO = "00000000-0000-0000-0000-0000000000b1";

describe(
  "Puerta A — openCaseFromRequest a través del motor híbrido, contra Postgres real",
  { skip: connectionString ? false : "SUPABASE_DB_URL no está definida en .env.local" },
  () => {
    const pool = connectionString ? createPostgresPool(connectionString) : null;
    let createdCaseId: string | null = null;
    let createdCustomerId: string | null = null;
    let createdVehicleId: string | null = null;
    let createdThreadId: string | null = null;

    after(async () => {
      if (!pool) return;
      const client = await pool.connect();
      try {
        // Orden que respeta las FK compuestas ON DELETE SET NULL de
        // `reported_symptoms` hacia `service_requests`/`intake_entries`
        // (ambas `organization_id` NOT NULL — borrar el lado referenciado
        // primero dispara esa violación): reported_symptoms siempre
        // primero, antes que service_requests E intake_entries.
        if (createdCaseId) {
          await client.query("delete from case_status_events where case_id = $1", [createdCaseId]);
          await client.query("delete from reported_symptoms where case_id = $1", [createdCaseId]);
          await client.query("delete from service_requests where case_id = $1", [createdCaseId]);
          await client.query("delete from case_participants where case_id = $1", [createdCaseId]);
        }
        if (createdThreadId) {
          await client.query("delete from intake_entries where thread_id = $1", [createdThreadId]);
        }
        if (createdCaseId) {
          await client.query("delete from cases where id = $1", [createdCaseId]);
        }
        if (createdThreadId) {
          await client.query("delete from intake_threads where id = $1", [createdThreadId]);
        }
        if (createdCustomerId) {
          await client.query("delete from customers where id = $1", [createdCustomerId]);
        }
        if (createdVehicleId) {
          await client.query("delete from vehicle_access_grants where vehicle_id = $1", [
            createdVehicleId,
          ]);
          await client.query("delete from vehicle_identifiers where vehicle_id = $1", [
            createdVehicleId,
          ]);
          await client.query("delete from vehicles where id = $1", [createdVehicleId]);
        }
      } finally {
        client.release();
      }
      await pool.end();
    });

    it("persiste un caso real y lo aísla por organización bajo RLS", async () => {
      if (!pool) return;
      const engine = createHybridCommandEngine(pool, createEmptyState());

      const ctx = buildCommandContext({
        actorId: OWNER_DTEK,
        organizationId: ORG_DTEK,
        capabilities: {
          membershipStatus: "active",
          membershipId: "integration-test-membership",
          permissions: ["crm.manage", "vehicle.manage", "intake.manage"],
          branchScope: "all",
        },
        // `correlation_id` es `uuid` en SQL (audit_events, case_status_events)
        // — a diferencia de `idempotency_keys.key`, que es texto libre.
        idempotencyKey: `integration-test-${Date.now()}`,
        correlationId: crypto.randomUUID(),
      });

      const outcome = await engine.openCaseFromRequest(ctx, {
        customer: { kind: "new", displayName: "Cliente de integración Puerta A" },
        vehicle: { kind: "new", vin: `1HGCM82633A${Date.now() % 100000}` },
        channel: "walk_in",
        reportedText: "Prueba de integración de Puerta A — ruido en frenos.",
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      createdCaseId = outcome.data.case.id;
      createdCustomerId = outcome.data.customer.id;
      createdVehicleId = outcome.data.vehicleId;
      createdThreadId = outcome.data.thread.id;

      // "Persiste" = una SEGUNDA conexión, independiente de la que lo
      // escribió, lo ve — no una caché de proceso.
      const seenByOwner = await withRlsRead(pool, OWNER_DTEK, async (c) => {
        const { rows } = await c.query("select id, folio_code from cases where id = $1", [
          createdCaseId,
        ]);
        return rows;
      });
      expect(seenByOwner).toHaveLength(1);
      expect(seenByOwner[0]?.folio_code).toBe(outcome.data.case.folioCode);

      // "Imposible de leer para el Taller B" — sin filtro de organización
      // en esta query: RLS es quien decide, no este archivo.
      const seenByOtherOrg = await withRlsRead(pool, OWNER_DEMO, async (c) => {
        const { rows } = await c.query("select id from cases where id = $1", [createdCaseId]);
        return rows;
      });
      expect(seenByOtherOrg).toHaveLength(0);
    });
  },
);
