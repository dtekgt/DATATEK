# Route / feature registry

Fuente: `packages/domain/src/routes/route-registry.ts` (tipos en
`packages/domain/src/routes/types.ts`).

## Qué es

Un arreglo `ROUTE_REGISTRY: RouteEntry[]` con exactamente **58 entradas**,
una por cada ruta canónica de R0-A sección 12:

| Superficie | Cantidad |
|---|---:|
| Sitio público | 12 |
| Datatek Pro | 15 |
| Datatek Pass (incl. `/a/[token]`) | 9 |
| Datatek Market | 9 |
| Datatek Control | 13 |
| **Total** | **58** |

Cada entrada declara: `id`, `surface`, `label`, `path`, `icon` (nombre
Lucide), `release`, `permission`, `featureFlag`, `navVisible`, `telemetry`,
`emptyState`, `breadcrumbs`, `hiddenForRoles?` y `planned?`.

## `[orgSlug]` es la única convención de tenant en Pro

Todas las rutas de superficie `pro` empiezan con `/pro/o/[orgSlug]/`. Un test
(`route-registry.test.ts`) falla si aparece cualquier otra convención
(`[orgId]`, query string, etc.).

## Rutas planned

Cuando una entrada no tiene datos demo reales, declara `planned:
PlannedDetail` con `purpose`, `dependency`, `release`, `dataToBeUsed` y
`whyDisabled`. El componente `PlannedFeatureState` (en `packages/ui`)
renderiza ese objeto tal cual — nunca un texto genérico de "próximamente".

## Por qué 58 entradas no son 58 archivos

Cinco paths están registrados dos veces, por dos razones distintas. La
aritmética conviene tenerla explícita, porque contar archivos `page.tsx` y
llamarlo "58 rutas" da un número que sólo cuadra por accidente:

| | |
|---|---:|
| Entradas del registro | 58 |
| − registros dobles | 5 |
| **Paths distintos** | **53** |
| + paths que existen como archivo en web *y* en control (`/`, `/security`, `/status`) | 3 |
| **Archivos `page.tsx`** | **56** |

`pnpm reconcile:r0` verifica esta reconciliación y, además, la paridad exacta
de conjuntos entre filesystem y registro: falla si existe una ruta servida sin
declarar o una declarada que nadie sirve.

## Rutas compartidas entre superficies

Dos de esos cinco duplicados son un mismo archivo sirviendo dos superficies,
porque R0-B no tiene login real y por lo tanto no puede distinguir "visitante"
de "usuario Pass/Market" en la misma URL:

- `/pass` — registrado como `public.pass` (superficie `public`) y como
  `pass.home` (superficie `pass`). Un solo archivo físico
  (`apps/web/src/app/(pass)/pass/page.tsx`) sirve ambos propósitos: además de
  la experiencia Now/Next/History, la página explica qué es Pass para
  cualquier visitante.
- `/market` — registrado como `public.market` y como `market.home`, servido
  por un único `apps/web/src/app/(market)/market/page.tsx`.

`/pro` no tiene este conflicto: la superficie funcional vive en
`/pro/o/[orgSlug]/dashboard`, un path distinto de la página de marketing
`/pro`.

El test de paridad filesystem↔registry (`route-registry.test.ts`) usa un
`Set` de paths al comparar contra el árbol de `apps/web`/`apps/control`, así
que estos duplicados intencionales (mismo path, distinta superficie) no
producen falsos positivos de "ruta faltante" o "ruta extra".

## Ocultamiento por rol

`isHiddenForRole(route, role)` oculta las cuatro rutas
`/market/supplier/*` para el rol `conductor`. `MarketShell` filtra la
navegación con esta función usando un fixture de rol simple
(`getFixtureActorRole()` en `apps/web/src/lib/fixture-session.ts`); no hay
autenticación real todavía.

## Verificación

- `packages/domain/src/routes/route-registry.test.ts` (Vitest): cuenta 58
  entradas, sin ids ni pares `(surface, path)` duplicados, convención
  `[orgSlug]`, ocultamiento de `/market/supplier/*`, y paridad exacta contra
  el filesystem real de `apps/web` y `apps/control`.
