// Aplica un `TableDiff[]` dentro de la transacción en curso — un
// INSERT ... ON CONFLICT DO NOTHING por fila nueva, un UPDATE por fila
// cambiada. Genérico: no hay una sola línea de SQL específica de un
// comando en este archivo, todo sale de `TableSpec` (tables.ts).
import type pg from "pg";
import type { CrmVehicleState } from "@datatek/application/commands";
import type { TableSpec } from "./tables.ts";
import type { TableDiff } from "./diff.ts";

type Registry = { [K in keyof CrmVehicleState]?: TableSpec<CrmVehicleState[K][number]> };

async function insertRow(
  client: pg.PoolClient,
  spec: TableSpec<unknown>,
  row: unknown,
): Promise<void> {
  const values = spec.toRow(row);
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const sql = `insert into ${spec.sqlTable} (${columns.join(", ")}) values (${placeholders.join(", ")}) on conflict (${spec.pkColumns.join(", ")}) do nothing`;
  await client.query(
    sql,
    columns.map((c) => values[c]),
  );
}

async function updateRow(
  client: pg.PoolClient,
  spec: TableSpec<unknown>,
  row: unknown,
): Promise<void> {
  if (spec.updateColumns.length === 0) {
    // Tabla declarada append-only pero el differ encontró un cambio —
    // señal de un comando que muta algo que esta tabla no anticipó. Fallar
    // ruidoso en vez de descartar el cambio en silencio.
    throw new Error(
      `write.ts: "${spec.sqlTable}" no declara updateColumns pero diffState encontró una fila cambiada.`,
    );
  }
  const values = spec.toRow(row);
  const setClauses = spec.updateColumns.map((col, i) => `${col} = $${i + 1}`);
  const whereClauses = spec.pkColumns.map(
    (col, i) => `${col} = $${spec.updateColumns.length + i + 1}`,
  );
  const sql = `update ${spec.sqlTable} set ${setClauses.join(", ")} where ${whereClauses.join(" and ")}`;
  const params = [
    ...spec.updateColumns.map((c) => values[c]),
    ...spec.pkColumns.map((c) => values[c]),
  ];
  await client.query(sql, params);
}

export async function writeDiff(
  client: pg.PoolClient,
  registry: Registry,
  diffs: TableDiff[],
): Promise<void> {
  for (const diff of diffs) {
    const spec = registry[diff.key];
    if (!spec) {
      throw new Error(`writeDiff: no hay TableSpec registrado para "${String(diff.key)}".`);
    }
    for (const row of diff.inserted) {
      await insertRow(client, spec as TableSpec<unknown>, row);
    }
    for (const row of diff.updated) {
      await updateRow(client, spec as TableSpec<unknown>, row);
    }
  }
}
