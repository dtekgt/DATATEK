import {
  createCommandEngine,
  buildFixtureCrmVehicleState,
  instrumentCommandEngine,
  type CommandEngine,
} from "@datatek/application/commands";
import {
  createLogger,
  createMetricsRegistry,
  jsonLineSink,
  type MetricsRegistry,
} from "@datatek/application";

// R0-D Fase 1 — server-side, in-memory command engine singleton.
//
// There is no Postgres reachable in this sandbox (see
// docs/runbooks/database-reset.md), so `0020`/`0030` have no real tables to
// write to yet. This module-level `let` is the "estado en memoria...
// server-side, vive mientras el proceso de `pnpm dev` corre" the phase
// requires: Next.js keeps a route handler's imported modules alive for the
// lifetime of the Node process running `next dev`/`next start`, so every
// request in that process shares the same `engineSingleton` and therefore
// the same customers/vehicles/audit log — exactly like a real backend would
// share one connection pool across requests. A server restart resets it,
// same as `pnpm db:reset` would reset real tables.
//
// Swapping this for real Postgres writes (once reachable) means replacing
// the body of `getCommandsEngine()` with a repository-backed adapter; the
// six command functions in `@datatek/application` and every caller of
// `getCommandsEngine()` stay unchanged, same pattern as
// `fixture-session.ts` documents for auth.
//
// Fase 4b finding: a plain module-level `let` is NOT enough to guarantee
// "one engine per `next dev` process" once Server Actions enter the
// picture. `next dev --webpack` compiles each route/Server Action as its
// own on-demand entry; a page's RSC render and a Server Action invoked from
// that same page can end up as SEPARATE webpack module instantiations, each
// getting its own `engineSingleton` closure — a case built via
// `/api/dev/commands` (or read by a page's server-rendered query) then
// looks like it does not exist to a Server Action hitting a NOT_FOUND on a
// real id, even though nothing is wrong with the command logic itself
// (confirmed by re-running the exact same command through
// `/api/dev/commands` immediately after, which succeeds). Stashing the
// instance on `globalThis` instead of a module closure is the standard fix
// for this exact class of dev-mode re-instantiation issue (the same pattern
// every "Prisma Client in Next.js dev" guide uses) — one JS heap, one
// `global`, shared no matter which webpack module graph asks for it. Same
// runtime behavior in production (`next start`), where this was never an
// issue in the first place.
declare global {
  // `globalThis` augmentation requires `var`, not `let`/`const` — this
  // project's lint config does not flag `no-var` inside a `declare global`
  // block (TypeScript itself requires `var` here), so no suppression
  // comment is needed.
  var __datatekCommandsEngine: CommandEngine | undefined;
  var __datatekMetrics: MetricsRegistry | undefined;
}

// R0-E Fase 3 — el registro de métricas vive en `globalThis` por la MISMA
// razón que el motor (ver arriba): si cada grafo de módulos de webpack se
// quedara con su propio registro, las series se partirían entre
// instanciaciones y ningún conteo cuadraría. Es en-proceso y se pierde al
// reiniciar; ese límite está declarado en la cabecera de metrics.ts y no se
// disfraza aquí.
function getMetricsRegistry(): MetricsRegistry {
  if (!globalThis.__datatekMetrics) {
    globalThis.__datatekMetrics = createMetricsRegistry();
  }
  return globalThis.__datatekMetrics;
}

/** Envuelve el motor para que CADA comando emita su línea de log y su
 * métrica. Se hace en este único punto —y no editando `engine.ts`— para que
 * un comando nuevo quede instrumentado el día que se agrega, sin que nadie
 * tenga que acordarse; ver el comentario de `instrumentCommandEngine`. */
function buildInstrumentedEngine(): CommandEngine {
  return instrumentCommandEngine(createCommandEngine(buildFixtureCrmVehicleState()), {
    logger: createLogger({
      app: "web",
      environment: process.env.NODE_ENV ?? "development",
      // Una línea JSON por comando a stdout, el mismo artefacto que ya
      // emite `apps/worker`. `console.log` es el transporte correcto aquí:
      // en Node el stdout del proceso ES el canal de logs.
      // eslint-disable-next-line no-console
      sink: jsonLineSink((line) => console.log(line)),
    }),
    metrics: getMetricsRegistry(),
  });
}

export function getCommandsEngine(): CommandEngine {
  if (!globalThis.__datatekCommandsEngine) {
    globalThis.__datatekCommandsEngine = buildInstrumentedEngine();
  }
  return globalThis.__datatekCommandsEngine;
}

/** Test/dev-only escape hatch — never called from product code. */
export function resetCommandsEngine(): void {
  globalThis.__datatekCommandsEngine = buildInstrumentedEngine();
}

/** Instantánea de métricas del proceso. Sólo para uso operativo/interno —
 * ninguna pantalla de producto la consume (sección 13: "No mostrar métricas
 * de negocio inventadas al usuario"). */
export function getCommandMetricsSnapshot() {
  return getMetricsRegistry().snapshot();
}
