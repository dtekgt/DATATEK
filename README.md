# Datatek — Foundation Release R0-C (identidad, tenancy, aislamiento)

Monorepo reproducible que abre las cinco superficies de Datatek con datos de
demostración rotulados: sitio corporativo, Datatek Pro, Datatek Pass, Datatek
Market y Datatek Control. R0-B (B1–B5: toolchain, domain spec, sistema
visual, route/feature registry, AppShells) está aceptado; esta sesión agrega
**R0-C**: migración `0010` (17 tablas, RLS, grants, helpers), catálogo de
permisos aditivo, resolución real de capacidades (`packages/auth`),
`AccessBoundary`/`OrganizationSwitcher`/`BranchSwitcher`/
`ElevatedAccessBanner`, seeds de actores ficticios y pruebas pgTAP de
aislamiento DTEK ↔ Taller Demo.

**No incluye en esta sesión** (explícitamente diferido, ver sección 1 de
`DATATEK_R0_C_IDENTITY_TENANCY_ISOLATION.md`): clientes, vehículos, casos,
agenda, inspección, cotización, autorización reales, MFA productiva,
impersonación silenciosa, importación desde DTEKPro, y — igual que en
R0-B — ejecución real contra Supabase local (Docker no disponible en esta
sandbox; ver sección 3 más abajo).

## Requisitos (Windows + VS Code)

- Node.js 24.18.x (ver `.nvmrc`). Con `nvm-windows`: `nvm install 24.18.0 && nvm use 24.18.0`.
- Corepack (incluido con Node ≥ 16.9).
- VS Code recomendado, sin extensiones obligatorias adicionales.
- Docker Desktop **no es necesario** para esta sesión (Supabase local queda diferido).

## 1. Instalar

En PowerShell, dentro de `app/`:

```powershell
node -v
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install
```

`pnpm install` genera `pnpm-lock.yaml` en la primera ejecución. Ejecuciones
posteriores pueden usar `pnpm install --frozen-lockfile` para reproducibilidad
estricta.

Copia las variables de entorno de ejemplo (sin secretos):

```powershell
Copy-Item .env.example .env.local
```

## 2. Levantar las apps

```powershell
pnpm dev
```

Esto levanta en paralelo:

- `apps/web` en `http://localhost:3000` — sitio público, Datatek Pro, Pass,
  Market y `/a/[token]`;
- `apps/control` en `http://localhost:3001` — Datatek Control, aplicación y
  sesión separadas;
- `apps/worker` — placeholder inactivo que imprime un mensaje y termina (no
  hay jobs en R0-B).

Rutas útiles para probar manualmente:

| Ruta | Qué muestra |
|---|---|
| `http://localhost:3000/` | Sitio corporativo |
| `http://localhost:3000/pro/o/dtek-servicios/dashboard` | Datatek Pro (demo) |
| `http://localhost:3000/pro/o/dtek-servicios/cases/case-demo-brakes` | Caso demo con stage rail |
| `http://localhost:3000/pass` | Datatek Pass (demo, mobile-first) |
| `http://localhost:3000/market` | Datatek Market (demo) |
| `http://localhost:3000/a/demo-token` | Enlace de autorización limitado |
| `http://localhost:3001/` | Datatek Control (app separada) |

## 3. Base local (Supabase) — diferido

`pnpm db:start`, `pnpm db:reset` y `pnpm db:types` existen como scripts (ver
`scripts/db-stub.mjs`) pero **no inician Docker ni Supabase en esta sesión**:
imprimen un mensaje honesto y terminan con éxito. Lo que sí existe como
código completo, revisado y sin ejecutar (`implemented_pending_environment_evidence`):

- `supabase/migrations/0000_foundation.sql` — extensiones, schema privado,
  helper de `updated_at`; sin tablas de negocio.
- `supabase/migrations/0010_identity_tenancy_isolation.sql` — las 17 tablas
  de R0-C (perfiles, organizaciones, sucursales, permisos, roles,
  memberships, branch scopes, plataforma, sesiones elevadas), con RLS en
  cada una, grants mínimos y helpers `security definer` con `search_path`
  fijo.
- `supabase/seeds/local_actors.sql` — 10 actores ficticios, DTEK Servicios y
  Taller Demo con sus sucursales, y una sesión de soporte elevada de
  ejemplo.
- `supabase/tests/0010_identity_tenancy.sql` — pgTAP, 20 assertions
  (aislamiento DTEK↔Taller Demo, branch scope, elevación, expiración, grants
  mínimos).

`pnpm test:db` corre una verificación **estática** de todo lo anterior (sin
tablas de negocio, sin secretos, sin hosts productivos, las 17 tablas de
`0010` presentes con RLS activada) que **sí se ejecuta** en esta sesión. Ver
`docs/runbooks/database-reset.md` y `docs/runbooks/local-auth-seeds.md`.

## 4. Nota sobre el entorno de esta sesión

Esta sesión corrió dentro de un sandbox con una política de Application
Control activa que bloquea la ejecución de binarios nativos descargados
(esbuild, el binario nativo de Rollup, el addon nativo `@next/swc-*`, el
binario de Turborepo). Eso es específico de este sandbox, no un defecto del
proyecto. Dos ajustes de tooling documentan y absorben esa restricción sin
sacrificar cobertura real:

- **`pnpm build` usa `next build --webpack`** en vez del Turbopack por
  defecto de Next 16 (que exige bindings nativos sin *fallback*). Webpack sí
  tiene *fallback* a SWC-WASM, que corre en V8 sin permisos de ejecución de
  binario nativo. En una máquina sin esta restricción, Turbopack sigue
  disponible (`next build` a secas, o `next dev` sin `--webpack`).
- **`pnpm test` usa un runner propio en JS puro** (`scripts/run-node-tests.mjs`)
  en vez de `vitest run`, porque Vite/Vitest necesitan esbuild/Rollup
  nativos incluso para transformar TSX. El runner compila cada paquete con
  `tsc` (JS puro, sin binario nativo) a CommonJS y ejecuta el resultado con
  `node --test`. Cada paquete conserva `pnpm test:vitest` (o
  `pnpm --filter <paquete> exec vitest run`) como punto de entrada estándar
  para un entorno sin esta restricción.
- **`pnpm dev`/`turbo run *` siguen configurados** (`turbo.json`, scripts
  `turbo:build`/`turbo:dev`/`turbo:lint`/`turbo:typecheck`/`turbo:test`)
  para cuando Turborepo pueda ejecutar su binario nativo con normalidad.

Ningún ajuste cambia código de producto ni relaja una regla de negocio; son
puramente de *toolchain* y quedan documentados aquí para que una sesión
futura sin esta restricción pueda decidir si los revierte.

## 5. Verificación

Comandos que esta sesión ejecutó y verificó realmente, con salida limpia
(exit code 0) desde una instalación `--frozen-lockfile`:

```powershell
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm spec:check
pnpm test
pnpm build
```

Comandos que existen pero requieren un entorno con Docker Desktop y/o
navegadores Playwright (no disponibles en esta sesión, ver runbooks):

```powershell
pnpm e2e:install
pnpm test:e2e
pnpm db:start
pnpm db:reset
pnpm db:types
pnpm test:db   # esta parte SÍ corre (verificación estática)
```

## 6. Detener

`Ctrl+C` en la terminal de `pnpm dev` detiene las tres apps. No hay
contenedores que detener en esta sesión (Supabase local no se inició).

## 7. Qué es demo y qué es función real

- **Demo (`demo: true`, badge visible):** dashboard y casos de Pro, historial
  y decisiones de Pass, listado y perfil de talleres de Market, estado de
  Control. Los datos son fixtures tipadas en `packages/application`; nunca
  se persisten, nunca muestran un toast de éxito, nunca mutan nada.
- **Función real:** navegación, tokens visuales, componentes accesibles,
  route/feature registry, ViewModels y boundaries de acceso (con fixtures
  explícitas, no seguridad real todavía).
- **Planificado (`PlannedFeatureState`):** cualquier ruta sin implementación
  real explica propósito, dependencia, release, qué datos usará y por qué
  está deshabilitada — nunca aparenta éxito.

## Estructura

```text
apps/web       Sitio, Pro, Pass, Market y enlace limitado (puerto 3000)
apps/control   Gobierno de plataforma, app y sesión separadas (puerto 3001)
apps/worker    Placeholder inactivo en R0-B
packages/domain       TypeScript puro: spec generado, route/feature registry
packages/application  ViewModels y adapters de fixtures (depende de domain)
packages/database     Puertos placeholder, sin ORM, sin conexión real
packages/auth         Interfaces/boundaries, sin permisos falsos
packages/ui           Tokens y primitivas accesibles, sin fetch
packages/config       tsconfig/eslint compartidos
packages/testkit      Helpers de test
supabase       0010 (identidad/tenancy/RLS), seeds y pgTAP (sin ejecutar)
docs           ADR, contratos de dominio y runbooks
tests/e2e      Smoke tests Playwright (autoría completa, sin ejecutar)
```

## Documentos normativos

Este repositorio implementa `DATATEK_R0_C_IDENTITY_TENANCY_ISOLATION.md`,
que depende de `DATATEK_R0_B_FIRST_SHELL.md` y de
`DATATEK_R0_A_CONTRACT_PACK.md` (los tres en la carpeta raíz de specs, un
nivel arriba de `app/`). No modifiques esos archivos: son la fuente de
verdad normativa, de solo lectura. El resultado de la puerta de aceptación
de esta sesión vive en `DATATEK_R0_C_VERIFICATION.md`, también en la raíz de
specs.

## Documentación de R0-C

- `docs/adr/0002-tenancy-and-rls.md` — por qué RLS por fila y no un schema
  por tenant.
- `docs/domain/permissions.md` — catálogo de permisos, roles y su
  resolución.
- `docs/domain/data-visibility.md` — `AccessBoundary`, proyecciones por
  audiencia, guest tokens.
- `docs/runbooks/support-access.md` — ciclo de vida de una sesión elevada de
  soporte.
- `docs/runbooks/local-auth-seeds.md` — actores ficticios, cómo reproducir
  el seed.
- `docs/domain/er-0010.md` — diagrama ER de la migración `0010`.
