// Postgres connection pool — Puerta A (persistencia real, ver
// docs/domain/history-correction-and-visibility.md's hermano de alcance:
// el addendum de contrato; este archivo es la primera pieza de la
// implementación real).
//
// Reutiliza exactamente el mismo patrón ya probado en
// `scripts/apply-migrations.mjs`/`scripts/run-pgtap.mjs`: el paquete `pg`
// puro (sin binario nativo, no bloqueado por Smart App Control) contra
// `SUPABASE_DB_URL`. No se introduce `@supabase/supabase-js` aquí — ese
// paquete es para Auth (GoTrue), no para esta conexión directa a Postgres.
import pg from "pg";

/** Nunca loguear `connectionString` completo — puede llevar la contraseña.
 * Mismo criterio que `safeHost()` en `scripts/apply-migrations.mjs`. */
export function redactedHost(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  } catch {
    return "destino no interpretable";
  }
}

export function createPostgresPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, application_name: "datatek-web" });
}
