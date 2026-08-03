// Logs estructurados — DATATEK_R0_E sección 13 ("Logs").
//
// La sección pide once propiedades por línea de log: estructurados, nivel,
// app/worker, environment, request ID, correlation/causation ID,
// actor/tenant por referencia segura, comando/evento, duración, resultado,
// "sin PII innecesaria".
//
// =========================================================================
// LA DECISIÓN DE DISEÑO QUE IMPORTA: NO EXISTE UN CAMPO `message`
// =========================================================================
//
// Un logger con `log.info("Cliente " + customer.displayName + " autorizó")`
// cumple "estructurado" de nombre y viola "sin PII" de hecho. Aquí el
// registro es un objeto CERRADO (`LogRecord`): cada campo tiene tipo y
// significado, `event` es un identificador estable de vocabulario, el error
// se identifica por CÓDIGO (`CommandErrorCode`, ya estable en
// commands/context.ts) y nunca por su texto. No hay forma de concatenar el
// nombre de un cliente en una línea de log porque no hay campo donde
// ponerlo. La prohibición es estructural, no una convención que alguien
// deba recordar.
//
// Los campos libres viven solo en `extra`, cuyos valores son primitivos y
// pasan SIEMPRE por `redactLogValue` antes de serializarse.
//
// =========================================================================
// "ACTOR/TENANT POR REFERENCIA SEGURA" — QUÉ SIGNIFICA AQUÍ
// =========================================================================
//
// La propia sección 13 define el término entre paréntesis: por referencia
// segura = por su id, nunca por nombre/email/teléfono. Esa es exactamente la
// convención que `apps/worker/src/outbox/worker.ts` ya adoptó en R0-E Fase 2
// (`WorkerLogEntry.organizationId`, comentado ahí como "referencia segura al
// tenant: el id, nunca su nombre"). Este módulo usa el MISMO vocabulario a
// propósito: `actorId` y `organizationId` crudos, para que una línea del
// worker y una línea de la app se puedan cruzar sin traducción.
//
// Un uuid de `auth.users` es un identificador seudónimo: no revela quién es
// la persona sin acceso a la base que ya está detrás de RLS. Lo que sí sería
// una fuga —y lo que `redactLogValue` bloquea— es un email, un teléfono o el
// SECRETO de un enlace de autorización (deuda #2 de la Fase 2: el token
// viaja en la ruta, así que es justamente el valor con más probabilidad de
// llegar por accidente a un log).

import type { CommandErrorCode } from "../commands/context.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Sección 13 pide distinguir app/worker. `worker` existe aquí para que el
 * vocabulario sea uno solo aunque `apps/worker` no pueda importar este
 * paquete (ver nota de runtime al final del archivo). */
export type LogApp = "web" | "control" | "worker";

/** Resultado de la unidad de trabajo que la línea describe. `unknown` es un
 * valor legítimo y NO significa "salió bien" — mismo principio que
 * `HealthStatus.unknown` en health.ts. */
export type LogResult = "succeeded" | "failed" | "denied" | "conflict" | "not_found" | "unknown";

/** Valores admitidos en `extra`. Deliberadamente primitivos: un objeto
 * anidado permitiría colar `{ customer: { email } }` sin que la redacción
 * lo vea. */
export type LogExtraValue = string | number | boolean | null;

export interface LogFields {
  event: string;
  /** Id de la petición HTTP que originó el trabajo. */
  requestId?: string;
  correlationId?: string;
  /** Id del evento/comando que CAUSÓ este. Mismo significado que en
   * `apps/worker/src/outbox/types.ts`. */
  causationId?: string | null;
  actorId?: string;
  organizationId?: string;
  /** Nombre del comando o del evento de dominio. */
  command?: string;
  durationMs?: number;
  result?: LogResult;
  /** Código estable, nunca el texto del error. */
  errorCode?: CommandErrorCode | "UNHANDLED" | "TIMEOUT";
  extra?: Record<string, LogExtraValue>;
}

export interface LogRecord extends Omit<LogFields, "extra"> {
  level: LogLevel;
  app: LogApp;
  environment: string;
  at: string;
  extra?: Record<string, LogExtraValue>;
}

// -------------------------------------------------------------------------
// Redacción
// -------------------------------------------------------------------------

/** Un secreto de enlace de autorización es `randomBytes(32).toString("base64url")`
 * — 43 caracteres de [A-Za-z0-9_-]. El umbral de 32 lo captura, y el
 * lookahead evita empezar a mitad de un uuid. */
const TOKEN_LIKE = /\b(?![0-9a-f]{8}-)[A-Za-z0-9_-]{32,}\b/g;
const EMAIL_LIKE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;
/**
 * Siete o más dígitos con separadores opcionales: teléfono GT (8 dígitos),
 * internacional, o con guiones/espacios/paréntesis.
 *
 * ANCLADO a ambos lados (`(?<!...)` / `(?!...)`) para que el número no pueda
 * empezar ni terminar pegado a un identificador. Sin las anclas, el patrón
 * mordía la cola de un uuid —`550e8400-e29b-41d4-a716-446655440000` se
 * convertía en `550e8400-e29b-41d4-a[phone]`— y, peor, partía un secreto en
 * dos (ver el bloque de ORDEN abajo).
 */
const PHONE_LIKE = /(?<![A-Za-z0-9_-])\+?\d[\d\s().-]{6,}\d(?![A-Za-z0-9_-])/g;

/**
 * Reemplaza por una etiqueta cualquier valor con forma de dato personal o de
 * secreto. NO intenta ser un clasificador de PII general —eso sería una
 * promesa que no se puede cumplir— sino una última línea de defensa contra
 * los tres valores que este sistema sí maneja y que no deben aparecer nunca
 * en un log: el secreto del enlace de autorización, un email de cliente y un
 * teléfono de cliente.
 *
 * =========================================================================
 * ORDEN: email -> token -> teléfono. NO ES ARBITRARIO.
 * =========================================================================
 *
 * `String.replace` sustituye por `[etiqueta]`, y los corchetes NO pertenecen
 * a ninguna de las tres clases de caracteres. Es decir: cada sustitución
 * PARTE EN DOS lo que quedaba alrededor. Un patrón que corre antes puede
 * dejar fragmentos demasiado cortos para que el siguiente los reconozca.
 *
 * Con el orden email -> teléfono -> token, un secreto que contuviera una
 * corrida de dígitos/guiones (base64url incluye `-`) quedaba partido por el
 * patrón de teléfono y sus dos mitades ya no llegaban al umbral de 32, así
 * que el token escapaba a medias. Sobre el formato real del enlace
 * (`${uuid}.${secreto}`) el resultado observado era:
 *
 *   viejo: 550e8400-…-446655440000.aBcDeFgHiJkLmNoPqRsTuVwXyZ[phone]_-abcXY
 *   nuevo: 550e8400-…-446655440000.[token]
 *
 * — es decir, la versión anterior escribía en el log casi todo el secreto
 * que este módulo existe para ocultar.
 *
 * Cada par está ordenado por especificidad, del más estructurado al menos:
 *   - email ANTES que token: un email con local-part de 32+ caracteres se
 *     comería como `[token]@dominio.com`, filtrando el dominio.
 *   - token ANTES que teléfono: el caso de arriba.
 *   - email ANTES que teléfono: `5555555555@x.com` daría `[phone]@x.com`.
 * Un token nunca contiene `@`, así que email-primero no lo daña.
 *
 * Es el mismo tipo de bug de orden que la Fase 2 encontró en
 * `apps/worker/src/outbox/sanitize.ts` (rutas antes que URLs). Las tres
 * líneas de abajo están cubiertas por tests de orden en `logger.test.ts`;
 * no las reordenes sin leerlos.
 *
 * LÍMITE CONOCIDO (sobre-redacción, dirección segura): un folio como
 * `2026-00001` cumple la forma de teléfono y sale como `[phone]`. Se prefiere
 * perder legibilidad de un dato inocuo a arriesgar uno sensible. Los
 * identificadores que sí importan para correlacionar (`actorId`,
 * `organizationId`, `requestId`, `correlationId`) son campos de primer nivel
 * de `LogFields` y NO pasan por aquí — `redactExtra` sólo toca `extra`.
 */
export function redactLogValue(value: LogExtraValue): LogExtraValue {
  if (typeof value !== "string") return value;
  return value
    .replace(EMAIL_LIKE, "[email]")
    .replace(TOKEN_LIKE, "[token]")
    .replace(PHONE_LIKE, "[phone]");
}

function redactExtra(
  extra: Record<string, LogExtraValue> | undefined,
): Record<string, LogExtraValue> | undefined {
  if (!extra) return undefined;
  const out: Record<string, LogExtraValue> = {};
  for (const [key, value] of Object.entries(extra)) {
    out[key] = redactLogValue(value);
  }
  return out;
}

// -------------------------------------------------------------------------
// Logger
// -------------------------------------------------------------------------

export type LogSink = (record: LogRecord) => void;

export interface LoggerOptions {
  app: LogApp;
  environment: string;
  sink: LogSink;
  /** Campos heredados por toda línea emitida (p. ej. requestId por
   * petición). */
  base?: Partial<LogFields>;
  now?: () => Date;
}

export interface Logger {
  debug(fields: LogFields): void;
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
  /** Deriva un logger que arrastra campos adicionales — el patrón normal es
   * `logger.child({ requestId, correlationId })` al entrar una petición. */
  child(base: Partial<LogFields>): Logger;
}

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const base = options.base ?? {};

  function emit(level: LogLevel, fields: LogFields): void {
    const merged = { ...base, ...fields };
    const record: LogRecord = {
      level,
      app: options.app,
      environment: options.environment,
      at: now().toISOString(),
      ...merged,
      extra: redactExtra(merged.extra),
    };
    // Nunca serializar `undefined` como clave presente.
    for (const key of Object.keys(record) as (keyof LogRecord)[]) {
      if (record[key] === undefined) delete record[key];
    }
    options.sink(record);
  }

  return {
    debug: (f) => emit("debug", f),
    info: (f) => emit("info", f),
    warn: (f) => emit("warn", f),
    error: (f) => emit("error", f),
    child: (extraBase) => createLogger({ ...options, base: { ...base, ...extraBase } }),
  };
}

/** Sink de una línea JSON por registro. Es el formato que ya emite
 * `apps/worker/src/index.ts`, para que ambos procesos produzcan el mismo
 * artefacto. */
export function jsonLineSink(write: (line: string) => void): LogSink {
  return (record) => write(JSON.stringify(record));
}

/** Sink que acumula en memoria. Único uso previsto: tests y el registro de
 * métricas en proceso. No es un transporte. */
export function memorySink(): LogSink & { records: LogRecord[] } {
  const records: LogRecord[] = [];
  const sink = ((record: LogRecord) => {
    records.push(record);
  }) as LogSink & { records: LogRecord[] };
  sink.records = records;
  return sink;
}

// -------------------------------------------------------------------------
// Duración y resultado
// -------------------------------------------------------------------------

/** Traduce un `CommandErrorCode` al vocabulario de `LogResult`. Un fallo de
 * permiso NO es lo mismo que un fallo técnico: la sección 13 pide "resultado"
 * y la 13/métricas pide contar denegaciones aparte. */
export function resultForErrorCode(code: CommandErrorCode): LogResult {
  switch (code) {
    case "FORBIDDEN":
    case "MEMBERSHIP_INACTIVE":
    case "BRANCH_DENIED":
    case "TOKEN_INVALID":
      return "denied";
    case "CONFLICT":
      return "conflict";
    case "NOT_FOUND":
      return "not_found";
    case "VALIDATION":
      return "failed";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

// =========================================================================
// NOTA DE RUNTIME — por qué `apps/worker` no importa este archivo
// =========================================================================
//
// Node 24 hace type-stripping nativo de `.ts`, pero NO dentro de
// `node_modules/`, y un workspace package se resuelve por symlink ahí. El
// worker corre con `node src/index.ts` SIN paso de build (decisión
// documentada en DATATEK_R0_E_FASE2_REPORT.md §1.2), así que importar
// `@datatek/application/observability` lo rompería. Por eso `WorkerLogEntry`
// (worker.ts) y `LogRecord` (este archivo) son dos tipos distintos que
// comparten vocabulario deliberadamente: `level`, `app`, `event`,
// `organizationId`, `correlationId`, `causationId`, `durationMs`, `result`,
// `environment`, `at`. Unificarlos exige darle un paso de build al worker;
// queda declarado como deuda, no como algo resuelto.
