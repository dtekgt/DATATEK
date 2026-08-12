// Compara el `CrmVehicleState` cargado antes de correr un comando puro
// contra el `nextState` que devolvió, y produce exactamente las filas que
// hay que escribir — nunca vuelve a escribir lo que ya estaba. No asume
// "solo inserts": `transitionCase`/`linkCustomerAuthIdentity`/
// `createCaseFromIntake` actualizan filas existentes (status de caso,
// status de cliente, status de intake thread, contador de organización),
// así que cada fila de `after` se compara contra su par en `before` por
// identidad (`idOf`) y, si ya existía, por igualdad estructural.
import type { CrmVehicleState } from "@datatek/application/commands";
import type { TableSpec } from "./tables.ts";

export interface TableDiff<K extends keyof CrmVehicleState = keyof CrmVehicleState> {
  key: K;
  inserted: CrmVehicleState[K][number][];
  updated: CrmVehicleState[K][number][];
}

type Registry = { [K in keyof CrmVehicleState]?: TableSpec<CrmVehicleState[K][number]> };

/** `keys` es la lista acotada de tablas que ESTE comando pudo haber tocado
 * (el `writeTables` de cada loader) — nunca las 36 de `CrmVehicleState`,
 * para no pagar el costo de comparar arrays que el comando ni siquiera
 * cargó (quedaron `[]` en ambos lados, diff trivialmente vacío, pero
 * igual sería trabajo de más sin acotar). */
export function diffState<K extends keyof CrmVehicleState>(
  before: CrmVehicleState,
  after: CrmVehicleState,
  registry: Registry,
  keys: K[],
): TableDiff<K>[] {
  return keys.map((key) => {
    const spec = registry[key];
    if (!spec) {
      throw new Error(`diffState: no hay TableSpec registrado para "${String(key)}".`);
    }
    const beforeRows = before[key] as CrmVehicleState[K][number][];
    const afterRows = after[key] as CrmVehicleState[K][number][];
    const beforeById = new Map(beforeRows.map((row) => [spec.idOf(row), row]));

    const inserted: CrmVehicleState[K][number][] = [];
    const updated: CrmVehicleState[K][number][] = [];

    for (const row of afterRows) {
      const id = spec.idOf(row);
      const prior = beforeById.get(id);
      if (prior === undefined) {
        inserted.push(row);
      } else if (JSON.stringify(prior) !== JSON.stringify(row)) {
        updated.push(row);
      }
    }

    return { key, inserted, updated };
  });
}
