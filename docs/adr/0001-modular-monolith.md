# ADR 0001 — Monolito modular, no microservicios

**Estado:** aceptado
**Fecha:** 2026-08-01
**Contexto:** R0-B, primer shell ejecutable

## Contexto

R0-A prohíbe explícitamente introducir microservicios o un motor de workflow
en el Foundation Release, y R0-B pide un monorepo con `apps/*` como
adaptadores delgados sobre paquetes compartidos (`domain`, `application`,
`database`, `auth`, `ui`). El sistema tiene múltiples superficies (sitio,
Pro, Pass, Market, Control) que comparten dominio y datos autorizados, pero
no layouts, navegación, scopes ni telemetría.

## Decisión

Adoptamos un **monolito modular**:

- `packages/domain` es TypeScript puro (spec generado + route/feature
  registry). No importa de `application`, `database` ni de ninguna app.
- `packages/application` depende solo de `domain` y define los contratos de
  lectura (ViewModels) más los adapters de fixtures de R0-B.
- `packages/database` define puertos (interfaces), sin ORM y sin conexión
  real en R0-B.
- `packages/auth` define boundaries e interfaces de capacidad efectiva, sin
  simular permisos reales.
- `packages/ui` son primitivas accesibles que solo reciben props/ViewModels;
  nunca hacen fetch ni importan Supabase.
- `apps/web`, `apps/control` y `apps/worker` son los únicos puntos donde el
  dominio se conecta a un framework (Next.js) o a un runtime de proceso.

No hay colas, no hay orquestador, no hay despliegue independiente por
superficie. Postgres (cuando exista, desde R0-C) es la única fuente de
verdad; las apps son proyecciones sobre ella.

## Alternativas consideradas

- **Microservicios por superficie:** rechazado. R0-A lo prohíbe
  explícitamente y el dominio (casos, cotizaciones, autorización) es
  compartido entre Pro/Pass/Market; separarlo en servicios introduciría
  consistencia eventual innecesaria para un release de fundación.
- **Un único paquete sin capas:** rechazado. Rompería la regla "domain no
  importa de application/database/apps" y dificultaría que R0-C reemplace
  adapters sin tocar componentes de UI.

## Consecuencias

- Cambiar de fixtures a datos reales (R0-C/R0-D) significa reemplazar
  funciones en `packages/application/src/adapters/*`, no reescribir UI.
- El boundary `domain → application → apps` se verifica con
  `pnpm typecheck` (imports circulares fallarían la compilación) y con
  revisión de código; no hay un linter de arquitectura dedicado en R0-B.
- Un futuro ADR debe documentar si/cuándo se introduce separación de
  despliegue (por ejemplo, `apps/control` ya vive en un proceso y puerto
  separados por razones de seguridad — ver ADR 0004 — sin ser un
  microservicio con su propio dominio).
