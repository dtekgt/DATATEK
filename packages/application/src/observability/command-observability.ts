// Instrumentación del motor de comandos — DATATEK_R0_E sección 13.
//
// Une las tres piezas de la sección 13 en el único punto donde las tres
// significan lo mismo: la ejecución de un comando. De ahí salen a la vez el
// log estructurado ("comando/evento, duración, resultado"), la métrica
// "duración/error por comando", el contador de "intentos de autorización" y
// el de denegaciones de acceso.
//
// =========================================================================
// POR QUÉ UN DECORADOR Y NO 36 LÍNEAS EDITADAS EN engine.ts
// =========================================================================
//
// `createCommandEngine` devuelve un objeto con ~40 métodos, todos de la
// forma `(ctx, input) => CommandResult<T>`. Instrumentar editando cada uno
// significaría 40 ediciones y, peor, 40 oportunidades futuras de agregar un
// comando SIN instrumentar y no notarlo. Envolver el motor entero recorre
// sus claves en tiempo de ejecución: **un comando nuevo queda instrumentado
// el día que se agrega, sin que nadie se acuerde de hacerlo.** Un test fija
// esa propiedad comparando el número de métodos envueltas contra el número
// de métodos del motor.
//
// Además deja `engine.ts` intacto, así que ningún test existente de R0-D o
// de las Fases 1-2 cambia de comportamiento: quien no envuelve el motor,
// obtiene exactamente el motor de antes.

import type { CommandContext, CommandError } from "../commands/context.ts";
import type { CommandEngine, CommandResult } from "../commands/engine.ts";
import { createLogger, resultForErrorCode, type Logger, type LogResult } from "./logger.ts";
import { METRIC_NAMES, type MetricsRegistry } from "./metrics.ts";

/** Métodos del motor que NO son comandos: no reciben `CommandContext` y no
 * producen un resultado de dominio. */
const NON_COMMAND_KEYS = new Set<string>(["getState", "reset"]);

/** Comandos cuyo desenlace cuenta como "intento de autorización" (sección
 * 13). Se listan explícitamente en vez de deducirlos del nombre: un
 * `startsWith("record")` habría contado `recordOdometerEvent` como intento
 * de autorización. */
const AUTHORIZATION_ATTEMPT_COMMANDS = new Set<string>([
  "verifyAuthorizationAccess",
  "recordAuthorization",
]);

/** Códigos que representan una denegación de acceso a nivel de aplicación.
 * NO son fallos de RLS — ver la nota 3 de metrics.ts. */
const ACCESS_DENIED_CODES = new Set<string>([
  "FORBIDDEN",
  "MEMBERSHIP_INACTIVE",
  "BRANCH_DENIED",
  "TOKEN_INVALID",
]);

export interface CommandObservabilityDeps {
  logger: Logger;
  metrics: MetricsRegistry;
  /** Reloj monótono en ms. Inyectable para que los tests fijen duraciones
   * exactas en vez de depender del cronómetro real. */
  monotonicNowMs?: () => number;
}

type AnyCommandMethod = (ctx: CommandContext, input: unknown) => CommandResult<unknown>;

function logResultFor(result: CommandResult<unknown>): LogResult {
  return result.ok ? "succeeded" : resultForErrorCode(result.error.code);
}

/**
 * Devuelve un motor con la misma interfaz, que además emite una línea de log
 * y actualiza las métricas por cada comando ejecutado.
 *
 * Lo que la línea de log LLEVA: comando, resultado, duración, código de
 * error estable, `correlationId`, `actorId`, `organizationId`.
 *
 * Lo que NO lleva, y un test lo verifica: el `input` del comando. Ese objeto
 * contiene, según el comando, el nombre de un cliente
 * (`CreateProvisionalCustomer`), su teléfono (`AddCustomerContact`) o el
 * secreto de un enlace (`RecordAuthorization`). Loguear "el input" es la
 * forma más fácil de convertir un log en una fuga, así que el decorador
 * nunca lo toca.
 */
export function instrumentCommandEngine(
  engine: CommandEngine,
  deps: CommandObservabilityDeps,
): CommandEngine {
  const monotonicNowMs = deps.monotonicNowMs ?? (() => performance.now());
  const wrapped: Record<string, unknown> = {};

  for (const key of Object.keys(engine)) {
    const member = (engine as unknown as Record<string, unknown>)[key];
    if (NON_COMMAND_KEYS.has(key) || typeof member !== "function") {
      wrapped[key] = member;
      continue;
    }

    const original = member as AnyCommandMethod;
    wrapped[key] = (ctx: CommandContext, input: unknown): CommandResult<unknown> => {
      const startedAt = monotonicNowMs();
      let result: CommandResult<unknown>;
      try {
        result = original.call(engine, ctx, input);
      } catch (error) {
        // Un throw NO es un `CommandResult`: es un fallo no manejado del
        // motor. Se registra con código `UNHANDLED` y se vuelve a lanzar sin
        // tocarlo — tragarse la excepción convertiría un bug en un silencio.
        // Nunca se serializa `error`: podría traer un stack (sección 9,
        // "errores sin stack/PII").
        const durationMs = monotonicNowMs() - startedAt;
        deps.logger.error({
          event: "command.unhandled",
          command: key,
          durationMs,
          result: "failed",
          errorCode: "UNHANDLED",
          actorId: ctx.actorId,
          organizationId: ctx.organizationId,
          correlationId: ctx.correlationId,
        });
        deps.metrics.increment(METRIC_NAMES.commandErrors, {
          command: key,
          error_code: "UNHANDLED",
        });
        throw error;
      }

      const durationMs = monotonicNowMs() - startedAt;
      const outcome = logResultFor(result);
      const error: CommandError | null = result.ok ? null : result.error;

      deps.logger.info({
        event: "command.executed",
        command: key,
        durationMs,
        result: outcome,
        errorCode: error?.code,
        actorId: ctx.actorId,
        organizationId: ctx.organizationId,
        correlationId: ctx.correlationId,
        extra: result.ok ? { replayed: result.replayed } : undefined,
      });

      deps.metrics.observeDuration(METRIC_NAMES.commandDuration, durationMs, {
        command: key,
        result: outcome,
      });

      if (error) {
        deps.metrics.increment(METRIC_NAMES.commandErrors, {
          command: key,
          error_code: error.code,
        });
        if (ACCESS_DENIED_CODES.has(error.code)) {
          deps.metrics.increment(METRIC_NAMES.accessDenied, {
            command: key,
            error_code: error.code,
          });
        }
      }

      if (AUTHORIZATION_ATTEMPT_COMMANDS.has(key)) {
        deps.metrics.increment(METRIC_NAMES.authorizationAttempts, {
          command: key,
          outcome,
        });
      }

      return result;
    };
  }

  return wrapped as unknown as CommandEngine;
}

/** Conveniencia para un host que solo quiere un motor instrumentado y un
 * sumidero de líneas JSON. */
export function createInstrumentedEngine(params: {
  engine: CommandEngine;
  metrics: MetricsRegistry;
  app: "web" | "control";
  environment: string;
  sink: (line: string) => void;
}): CommandEngine {
  const logger = createLogger({
    app: params.app,
    environment: params.environment,
    sink: (record) => params.sink(JSON.stringify(record)),
  });
  return instrumentCommandEngine(params.engine, { logger, metrics: params.metrics });
}
