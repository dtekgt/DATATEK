# Runbook — Auth local y seeds de actores (R0-C)

## Estado en esta sesión

Esta sandbox no tiene Docker Desktop ni Supabase CLI ejecutable
(`docs/runbooks/database-reset.md`). Todo lo de abajo está **escrito,
revisado y listo para ejecutarse** contra Supabase local en una sesión
futura con Docker; hoy corre en su lugar un doble equivalente:
`apps/web/src/lib/fixture-session.ts` resuelve la sesión desde una cookie
fixture (`dtek_actor`) en vez de un JWT real, usando exactamente los mismos
tipos (`AccessBoundaryState`, `OrganizationCapabilityResolution`) que
producirá Supabase Auth. Cambiar el origen del dato (cookie → JWT) no
requiere tocar ningún componente consumidor.

## Artefactos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/0010_identity_tenancy_isolation.sql` | 17 tablas, RLS, grants, helpers |
| `supabase/seeds/local_actors.sql` | 10 actores, 2 organizaciones, roles, branch scopes, 1 sesión elevada |
| `supabase/tests/0010_identity_tenancy.sql` | pgTAP, 20 assertions |
| `apps/web/src/lib/fixture-session.ts` | doble in-process de la sesión mientras no hay Supabase local |
| `packages/application/src/fixtures/tenancy.ts` | mismo grafo de actores que el seed SQL, en TypeScript |

`FIXTURE_ACTOR_IDS`, `FIXTURE_ORGANIZATION_IDS` y los IDs literales del seed
SQL están alineados a propósito (incluso si los UUID exactos difieren) —
mismos 10 actores, mismas 2 organizaciones, mismos roles.

## Actores (sección 8)

| Actor | Organización | Rol | Email seed |
|---|---|---|---|
| Owner DTEK | DTEK Servicios | owner (todas las sucursales) | `owner.dtek@datatek.local` |
| Asesor DTEK | DTEK Servicios | advisor (Sucursal Central) | `advisor.dtek@datatek.local` |
| Inspector DTEK | DTEK Servicios | inspector (Sucursal Central) | `inspector.dtek@datatek.local` |
| Mecánico DTEK | DTEK Servicios | mechanic (Sucursal Central) | `mechanic.dtek@datatek.local` |
| Caja DTEK | DTEK Servicios | cashier (Sucursal Central) | `cashier.dtek@datatek.local` |
| Cliente DTEK | DTEK Servicios | customer (Sucursal Central) | `customer.dtek@datatek.local` |
| Owner Taller Demo | Taller Demo | owner (todas las sucursales) | `owner.demo@datatek.local` |
| Cliente Taller Demo | Taller Demo | customer (Sucursal Demo) | `customer.demo@datatek.local` |
| Soporte de plataforma | — | `platform_support`, sin elevación sobre Taller Demo, elevado sobre DTEK (ticket `TCK-1042`) | `support@datatek.local` |
| Admin de plataforma | — | `platform_admin` | `admin@datatek.local` |

Contraseña local para todos: `datatek-local-dev-only` — **nunca** una
contraseña reutilizable ni real; solo válida contra una instancia de
Supabase Auth local. `raw_user_meta_data` se deja vacío a propósito: ningún
rol ni permiso vive ahí (sección 2.1).

## Procedimiento cuando exista Docker Desktop

```powershell
pnpm db:reset   # aplica 0000 y 0010, luego supabase/seeds/*.sql
pnpm test:db    # estático (ya corre hoy) + pgTAP real (nuevo una vez con Docker)
```

`scripts/db-stub.mjs` hoy imprime un aviso honesto en vez de invocar el
Supabase CLI real; reemplazarlo por `supabase db reset` es el único cambio
necesario para que este runbook deje de ser
`implemented_pending_environment_evidence`.

## Procedimiento hoy (fixtures, sin Docker)

```powershell
pnpm dev
```

En `http://localhost:3000`, la app Pro lee el actor desde la cookie
`dtek_actor`; el formulario de login fixture (superficie `pro`) la escribe.
Sin cookie, cualquier ruta de `/pro/o/[orgSlug]/*` resuelve a
`unauthenticated` → `ForbiddenState`. Cambiar de actor cambia
organización(es) disponibles, sucursales visibles y permisos — exactamente
el mismo contrato que producirá la sesión real.

## Por qué esto es reproducible

- El seed SQL usa `on conflict ... do nothing`/`insert ... on conflict`: se
  puede correr dos veces sobre la misma base sin duplicar filas.
- Los UUID de actores/organizaciones/branches son literales fijos (no
  `gen_random_uuid()` en el seed), así que un segundo `db:reset` produce
  exactamente los mismos IDs — necesario para que los pgTAP de
  `supabase/tests/0010_identity_tenancy.sql` (que referencian esos IDs
  literalmente) sigan pasando.
