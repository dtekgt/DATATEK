// Lecturas que corren como `authenticated` de verdad, para que las 92
// políticas RLS ya verificadas por pgTAP sean el filtro real — nunca una
// promesa de la aplicación. Mismo mecanismo que usa PostgREST/Supabase en
// producción: `SET LOCAL ROLE authenticated` (para que los grants de tabla
// apliquen) + `request.jwt.claims` con `sub = <uuid del actor>` (para que
// `auth.uid()` / `datatek_platform.current_actor()` resuelvan al actor
// correcto dentro de cada política).
//
// La conexión de fondo (`SUPABASE_DB_URL`) es Service Role — puede hacer
// `SET ROLE` a cualquier rol. Por eso las ESCRITURAS (ver
// postgres-command-engine.ts) nunca pasan por este wrapper: no hay grant de
// insert/update/delete para `authenticated` en ninguna tabla de negocio
// (0085_transactional_trust.sql), así que intentarlo fallaría con
// "permission denied" — la autorización de escritura ya la resuelven las
// funciones puras de comando antes de que este archivo exista siquiera.
import type pg from "pg";

export async function withRlsRead<T>(
  pool: pg.Pool,
  actorId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: actorId, role: "authenticated" }),
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
