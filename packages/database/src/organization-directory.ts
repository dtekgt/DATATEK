// Directorio estructural de organizaciones/sucursales: `slug -> id`, `id ->
// nombre`, lista de sucursales por org. Corre por la conexión de Service
// Role (igual que `postgres-command-engine.ts`), NO por `withRlsRead` — a
// diferencia de `tenancy-loader.ts`, esto no revela membresía/permisos de
// nadie, solo el mapeo público slug/id/nombre que ya hoy vive sin
// protección en `FIXTURE_ORGANIZATIONS`/`FIXTURE_BRANCHES`. Sirve para
// resolver la URL (`/pro/o/[orgSlug]/...`) al UUID real ANTES de saber si
// el actor es miembro — igual que la resolución por fixture hacía.
import type pg from "pg";
import { withRlsRead } from "./rls-read.ts";

export interface OrganizationDirectoryEntry {
  id: string;
  slug: string;
  name: string;
}

export async function resolveOrganizationBySlug(
  pool: pg.Pool,
  slug: string,
): Promise<OrganizationDirectoryEntry | null> {
  const { rows } = await pool.query(
    `select id, slug, name from organizations where slug = $1 and status = 'active'`,
    [slug],
  );
  const row = rows[0];
  return row ? { id: row.id as string, slug: row.slug as string, name: row.name as string } : null;
}

export async function loadOrganizationsByIds(
  pool: pg.Pool,
  ids: string[],
): Promise<OrganizationDirectoryEntry[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query(
    `select id, slug, name from organizations where id = any($1::uuid[]) and status = 'active'`,
    [ids],
  );
  return rows.map((row) => ({ id: row.id as string, slug: row.slug as string, name: row.name as string }));
}

/** Sucursales de una org, vistas como `authenticated` bajo RLS real — a
 * diferencia de las dos funciones de arriba, esto sí puede revelar
 * estructura interna del taller, así que pasa por `withRlsRead` con el
 * actor real (`organization_branches_select_member`). */
export async function loadOrganizationBranches(
  pool: pg.Pool,
  actorId: string,
  organizationId: string,
): Promise<{ id: string; label: string }[]> {
  return withRlsRead(pool, actorId, async (client) => {
    const { rows } = await client.query(
      `select id, name
         from organization_branches
        where organization_id = $1 and status = 'active'
        order by name`,
      [organizationId],
    );
    return rows.map((row) => ({ id: row.id as string, label: row.name as string }));
  });
}
