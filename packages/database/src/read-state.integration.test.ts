// Prueba de integración de `loadOrganizationReadState` — la función que
// alimenta las 7 páginas de solo lectura de Pro (dashboard, clientes,
// vehículos, casos) cuando `DATATEK_PERSISTENCE=postgres` está activo.
// Crea un caso real vía el motor híbrido (mismo camino que
// `hybrid-engine.integration.test.ts`), confirma que la lectura escopeada
// lo devuelve completo para el actor dueño, y que un actor de OTRA
// organización — sin ningún filtro de organización en la llamada, RLS
// decide — no ve ni una fila.
//
// Se salta si SUPABASE_DB_URL no está definida.
import { describe, it, after } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPostgresPool } from "./pool.ts";
import { createHybridCommandEngine } from "./hybrid-command-engine.ts";
import { loadOrganizationReadState } from "./read-state.ts";
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
const ORG_DEMO = "10000000-0000-0000-0000-000000000002";
const OWNER_DTEK = "00000000-0000-0000-0000-0000000000a1";
const OWNER_DEMO = "00000000-0000-0000-0000-0000000000b1";

describe(
  "Puerta A — loadOrganizationReadState contra Postgres real",
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

    it("devuelve el caso/cliente/vehículo real al dueño y nada a DTEK", async () => {
      if (!pool) return;
      const engine = createHybridCommandEngine(pool, createEmptyState());

      // Taller Demo, no DTEK: `hybrid-engine.integration.test.ts` ya crea un
      // caso para ORG_DTEK en el mismo proceso — `node --test` corre los
      // archivos de un paquete EN PARALELO por defecto, y el contador de
      // folio (`organization_counters`) se lee-computa-escribe sin lock de
      // fila (carga con `pg`, calcula en JS, escribe el valor final) — dos
      // transacciones concurrentes para el MISMO `organization_id` pueden
      // leer el mismo `next_value` y chocar en el `unique(organization_id,
      // folio_number)` de `cases`. Usar Taller Demo aquí evita la carrera
      // sin ocultarla: sigue siendo una fragilidad real del contador bajo
      // escritura concurrente, no arreglada aquí (fuera del alcance de esta
      // prueba de lectura) — digna de su propia tarea si dos miembros del
      // mismo taller abren casos al mismo tiempo en producción.
      const ctx = buildCommandContext({
        actorId: OWNER_DEMO,
        organizationId: ORG_DEMO,
        capabilities: {
          membershipStatus: "active",
          membershipId: "integration-test-membership",
          permissions: ["crm.manage", "vehicle.manage", "intake.manage"],
          branchScope: "all",
        },
        idempotencyKey: `integration-test-read-state-${Date.now()}`,
        correlationId: crypto.randomUUID(),
      });

      const outcome = await engine.openCaseFromRequest(ctx, {
        customer: { kind: "new", displayName: "Cliente de integración — lectura Puerta A" },
        vehicle: { kind: "new", vin: `1HGCM82633B${Date.now() % 100000}` },
        channel: "walk_in",
        reportedText: "Prueba de integración de lectura Puerta A — vibración al frenar.",
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      createdCaseId = outcome.data.case.id;
      createdCustomerId = outcome.data.customer.id;
      createdVehicleId = outcome.data.vehicleId;
      createdThreadId = outcome.data.thread.id;

      const ownerState = await loadOrganizationReadState(
        pool,
        OWNER_DEMO,
        ORG_DEMO,
        createEmptyState(),
      );
      const seenCase = ownerState.cases.find((c) => c.id === createdCaseId);
      expect(seenCase).toBeDefined();
      expect(seenCase?.folioCode).toBe(outcome.data.case.folioCode);
      expect(ownerState.customers.some((c) => c.id === createdCustomerId)).toBe(true);
      expect(ownerState.vehicles.some((v) => v.id === createdVehicleId)).toBe(true);

      // Mismo organizationId pasado explícitamente, pero un actor que NO es
      // miembro de Taller Demo — RLS decide, no un filtro de este archivo.
      const otherOrgState = await loadOrganizationReadState(
        pool,
        OWNER_DTEK,
        ORG_DEMO,
        createEmptyState(),
      );
      expect(otherOrgState.cases.find((c) => c.id === createdCaseId)).toBeUndefined();
      expect(otherOrgState.customers.find((c) => c.id === createdCustomerId)).toBeUndefined();

      // El propio DTEK, leyendo SU organización, no ve nada de esto tampoco
      // (no es solo "otro actor no ve" — es "otra organización no existe"
      // desde ese punto de vista).
      const dtekOwnState = await loadOrganizationReadState(
        pool,
        OWNER_DTEK,
        ORG_DTEK,
        createEmptyState(),
      );
      expect(dtekOwnState.cases.find((c) => c.id === createdCaseId)).toBeUndefined();
    });
  },
);
