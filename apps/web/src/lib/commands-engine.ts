import {
  createCommandEngine,
  buildFixtureCrmVehicleState,
  instrumentCommandEngine,
  type CommandEngine,
  type CommandContext,
  type CommandResult,
  type CrmVehicleState,
} from "@datatek/application/commands";
import {
  createLogger,
  createMetricsRegistry,
  jsonLineSink,
  type MetricsRegistry,
} from "@datatek/application";
import {
  createPostgresPool,
  createPostgresCommandEngine,
  loadOrganizationReadState,
} from "@datatek/database";
import type pg from "pg";
import { loadRepoRootEnvLocal } from "./repo-root-env";

// Puerta A, primer corte — CRM + Vehículo + Intake/Caso (14 comandos) tienen
// ahora un adaptador real de Postgres (`@datatek/database`). El resto (29
// comandos: agenda, inspección/evidencia, cotización, autorización,
// catálogo de productos) sigue en el motor en memoria original — ver
// `docs domain history-correction-and-visibility.md`'s hermano de alcance
// (el addendum de Puerta A) para el porqué de este corte acotado.
//
// Gateado por `DATATEK_PERSISTENCE=postgres`: sin la variable, comportamiento
// IDÉNTICO al de antes (motor en memoria, mismo estado seed, mismo
// singleton). Con la variable, los 14 comandos en alcance corren contra
// Postgres real; el resto sigue igual.
//
// Por qué solo esos 14 cambian de tipo (no los 43): una llamada real a
// Postgres nunca puede ser síncrona en JS — pero forzar TODOS los métodos a
// `Promise<...>` habría obligado a tocar los ~22 archivos que llaman a
// `getCommandsEngine()` incluso para comandos que este corte ni toca
// (agenda, inspección...). `PuertaAEngine` abajo solo envuelve los 14 en
// `Promise<CommandResult<T>>`; el resto queda exactamente como
// `CommandEngine` ya los tipaba.
const IN_SCOPE_COMMANDS = [
  "openCaseFromRequest",
  "createProvisionalCustomer",
  "addCustomerContact",
  "linkCustomerAuthIdentity",
  "registerVehicle",
  "createVehicleOwnershipClaim",
  "recordOdometerEvent",
  "createManualIntake",
  "appendIntakeEntry",
  "interpretReportedSymptom",
  "createCaseFromIntake",
  "assignCaseParticipant",
  "transitionCase",
  "addCaseNote",
] as const;

type InScopeCommand = (typeof IN_SCOPE_COMMANDS)[number];

export type PuertaAEngine = {
  [K in keyof CommandEngine]: K extends InScopeCommand
    ? CommandEngine[K] extends (ctx: CommandContext, input: infer I) => CommandResult<infer T>
      ? (ctx: CommandContext, input: I) => Promise<CommandResult<T>>
      : CommandEngine[K]
    : CommandEngine[K];
};

/** Envuelve los 14 métodos en alcance de un motor síncrono en una promesa ya
 * resuelta — usado cuando `DATATEK_PERSISTENCE` no está activo, para que
 * `PuertaAEngine` sea el tipo de `getCommandsEngine()` siempre, sin importar
 * el gate. El comportamiento real (qué hace cada comando) no cambia en
 * absoluto; solo la forma en que el valor de retorno llega al caller. */
function asPuertaAEngine(sync: CommandEngine): PuertaAEngine {
  const wrapped: Record<string, unknown> = { ...sync };
  for (const key of IN_SCOPE_COMMANDS) {
    const original = sync[key] as (ctx: CommandContext, input: unknown) => CommandResult<unknown>;
    wrapped[key] = async (ctx: CommandContext, input: unknown) => original(ctx, input);
  }
  return wrapped as unknown as PuertaAEngine;
}

// R0-D Fase 1 — server-side command engine singleton.
//
// This module-level `let` (vía `globalThis`, ver más abajo) es "estado en
// memoria... server-side, vive mientras el proceso de `pnpm dev` corre" —
// para los 29 comandos que siguen fuera de Puerta A. Los 14 en alcance, con
// `DATATEK_PERSISTENCE=postgres`, persisten de verdad y sobreviven un
// reinicio del proceso — ver `packages/database/src/hybrid-engine.
// integration.test.ts` para la prueba de ese criterio exacto.
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
  var __datatekCommandsEngine: PuertaAEngine | undefined;
  var __datatekMetrics: MetricsRegistry | undefined;
  var __datatekPgPool: pg.Pool | undefined;
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

/** Exportado — `fixture-session.ts` (resolución real de sesión/tenencia) y
 * `command-context.ts` (contexto de comandos) necesitan el MISMO pool
 * singleton, no uno propio cada uno; ver la nota de `globalThis` arriba. */
export function getPostgresPool(): pg.Pool {
  if (!globalThis.__datatekPgPool) {
    loadRepoRootEnvLocal();
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      throw new Error(
        "DATATEK_PERSISTENCE=postgres está activo pero SUPABASE_DB_URL no está definida en .env.local.",
      );
    }
    globalThis.__datatekPgPool = createPostgresPool(connectionString);
  }
  return globalThis.__datatekPgPool;
}

export function isPostgresEnabled(): boolean {
  return process.env.DATATEK_PERSISTENCE === "postgres";
}

/** Construye el motor base (sin instrumentar) — los 14 comandos en alcance
 * salen de `createPostgresCommandEngine` cuando el gate está activo; el
 * resto SIEMPRE sale del motor en memoria, con el mismo estado seed que
 * hoy. Nunca se mezclan dos estados en memoria distintos: solo hay UN
 * `createCommandEngine` real por proceso. */
function buildInstrumentedEngine(): PuertaAEngine {
  const mem = createCommandEngine(buildFixtureCrmVehicleState());

  // `instrumentCommandEngine` espera `CommandEngine` (métodos síncronos) —
  // ver la nota extensa en `packages/database/src/hybrid-command-engine.ts`
  // sobre por qué instrumentar el camino async queda pendiente
  // explícitamente. Cuando el gate está activo, los 14 comandos en alcance
  // NO pasan por este wrapper (perderían logging/métricas si lo hicieran
  // sin arreglarlo — ver la nota citada), así que se instrumenta solo la
  // base en memoria y se re-aplican los 14 reales encima, sin instrumentar,
  // documentado como brecha conocida, no un descuido.
  const instrumentedMem = instrumentCommandEngine(mem, {
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

  if (!isPostgresEnabled()) return asPuertaAEngine(instrumentedMem);

  return {
    ...asPuertaAEngine(instrumentedMem),
    ...createPostgresCommandEngine(getPostgresPool()),
  };
}

export function getCommandsEngine(): PuertaAEngine {
  if (!globalThis.__datatekCommandsEngine) {
    globalThis.__datatekCommandsEngine = buildInstrumentedEngine();
  }
  return globalThis.__datatekCommandsEngine;
}

/** Test/dev-only escape hatch — never called from product code. */
export function resetCommandsEngine(): void {
  globalThis.__datatekCommandsEngine = buildInstrumentedEngine();
}

/** Estado de lectura para las 7 páginas de solo lectura de Pro. Sin el gate,
 * es exactamente `getCommandsEngine().getState()` de siempre (mismo
 * comportamiento). Con `DATATEK_PERSISTENCE=postgres`, las 18 tablas de
 * Puerta A vienen de Postgres real (RLS-escopeadas al actor), y el resto
 * del estado (agenda, inspección, cotización, autorización, catálogo) sigue
 * saliendo del motor en memoria — ver el header de `read-state.ts` para por
 * qué esto es un merge y no proyecciones SQL por página. */
export async function getReadState(actorId: string, organizationId: string): Promise<CrmVehicleState> {
  const fallback = getCommandsEngine().getState();
  if (!isPostgresEnabled()) return fallback;
  return loadOrganizationReadState(getPostgresPool(), actorId, organizationId, fallback);
}

/** Instantánea de métricas del proceso. Sólo para uso operativo/interno —
 * ninguna pantalla de producto la consume (sección 13: "No mostrar métricas
 * de negocio inventadas al usuario"). */
export function getCommandMetricsSnapshot() {
  return getMetricsRegistry().snapshot();
}
