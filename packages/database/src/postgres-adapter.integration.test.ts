// Prueba de integración real — corre solo si SUPABASE_DB_URL está
// alcanzable (mismo gate que scripts/run-pgtap.mjs; se salta, no falla, en
// una máquina sin Postgres reachable). Verifica el contrato central de
// Puerta A: una fila escrita por Service Role (writeDiff) es visible bajo
// RLS para el actor correcto (withRlsRead) e invisible para un actor de
// OTRA organización — sin ningún filtro de organización en la query misma,
// para probar que es RLS, no un WHERE de la aplicación, lo que decide.
import { describe, it, after } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPostgresPool } from "./pool.ts";
import { withRlsRead } from "./rls-read.ts";
import { writeDiff } from "./write.ts";
import { buildTableRegistry } from "./tables.ts";
import type { CustomerRow } from "@datatek/application/commands";

// `__dirname` lo provee el runtime CommonJS al que este archivo se
// compila para pruebas (ver run-node-tests.mjs) — mismo patrón que
// packages/domain/src/routes/route-registry.test.ts.
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

// UUIDs reales del seed (supabase/seeds/local_actors.sql) — NO son los
// mismos que FIXTURE_ORGANIZATION_IDS/FIXTURE_ACTOR_IDS del motor en
// memoria (packages/application/src/fixtures/tenancy.ts): esos son
// identificadores de fixture puramente en memoria, con su propio espacio de
// ids, sin relación con las filas reales sembradas en Postgres. Confundir
// los dos espacios de ids es exactamente el tipo de error que este archivo
// existe para prevenir en el resto de Puerta A.
const ORG_DTEK = "10000000-0000-0000-0000-000000000001";
const ORG_DEMO = "10000000-0000-0000-0000-000000000002";
const OWNER_DTEK = "00000000-0000-0000-0000-0000000000a1";
const OWNER_DEMO = "00000000-0000-0000-0000-0000000000b1";

const TEST_CUSTOMER_ID = "99999999-0000-0000-0000-000000000001";

describe(
  "Puerta A — writeDiff (Service Role) + withRlsRead (RLS real)",
  { skip: connectionString ? false : "SUPABASE_DB_URL no está definida en .env.local" },
  () => {
    const pool = connectionString ? createPostgresPool(connectionString) : null;

    after(async () => {
      if (!pool) return;
      // Limpieza: la conexión de fondo es Service Role, puede borrar sin RLS.
      const client = await pool.connect();
      try {
        await client.query("delete from customers where id = $1", [TEST_CUSTOMER_ID]);
      } finally {
        client.release();
      }
      await pool.end();
    });

    it("una fila escrita por Service Role es legible bajo RLS para un actor con crm.manage en esa org", async () => {
      if (!pool) return;
      const registry = buildTableRegistry(ORG_DTEK);
      const row: CustomerRow = {
        id: TEST_CUSTOMER_ID,
        organizationId: ORG_DTEK,
        displayName: "Cliente de prueba (integration test)",
        customerType: "person",
        status: "provisional",
        source: "walk_in",
        createdAt: new Date().toISOString(),
        effectiveAt: new Date().toISOString(),
        createdBy: OWNER_DTEK,
      };

      const client = await pool.connect();
      try {
        await client.query("begin");
        await writeDiff(client, registry, [{ key: "customers", inserted: [row], updated: [] }]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      const seenByOwner = await withRlsRead(pool, OWNER_DTEK, async (c) => {
        const { rows } = await c.query("select id from customers where id = $1", [
          TEST_CUSTOMER_ID,
        ]);
        return rows;
      });
      expect(seenByOwner).toHaveLength(1);
    });

    it("la misma fila es invisible bajo RLS para un actor de otra organización — sin filtro de organización en la query", async () => {
      if (!pool) return;
      const seenByOtherOrgOwner = await withRlsRead(pool, OWNER_DEMO, async (c) => {
        const { rows } = await c.query("select id from customers where id = $1", [
          TEST_CUSTOMER_ID,
        ]);
        return rows;
      });
      expect(seenByOtherOrgOwner).toHaveLength(0);
      void ORG_DEMO; // referenciado por documentación del escenario, no por la query en sí — RLS es lo que filtra, no un WHERE de organización.
    });
  },
);
