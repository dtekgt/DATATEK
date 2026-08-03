// Outbox message model + repository contract — DATATEK_R0_E sección 8.
//
// ## Por qué estos tipos viven en `apps/worker` y no en `packages/application`
//
// El motor de comandos (`packages/application/src/commands`) es el "functional
// core" del dominio: produce hechos. El worker es un PROCESO separado que
// consume esos hechos. Mantener su modelo aquí evita que el paquete de
// aplicación (que Next.js empaqueta para dos apps web) arrastre código que
// solo un proceso de fondo ejecuta. También hay una razón concreta de
// runtime: Node 24 hace type-stripping nativo de `.ts`, pero NO dentro de
// `node_modules/` — y un workspace package se resuelve por symlink a
// `node_modules/`, así que `node src/index.ts` no podría importar TypeScript
// de `@datatek/application` sin un paso de build. Manteniendo el worker
// autocontenido, `pnpm --filter @datatek/worker dev` corre sin compilar nada.
//
// ## Espejo EXACTO de `outbox_messages` (0085_transactional_trust.sql, línea ~97)
//
// Cada campo de abajo existe en esa tabla con el mismo nombre en snake_case.
// Esta migración NO se modificó en esta fase — el modelo TypeScript se
// adaptó al schema, nunca al revés. Los `check` constraints de SQL se
// reflejan como uniones de literales y como invariantes que el repositorio
// mantiene:
//
// | Columna SQL          | Campo TS         | Constraint SQL reflejado                       |
// |----------------------|------------------|------------------------------------------------|
// | `status`             | `status`         | `check (status in (...))` -> `OutboxStatus`     |
// | `attempts`           | `attempts`       | `check (attempts >= 0)` y `attempts <= max`     |
// | `max_attempts`       | `maxAttempts`    | `check (max_attempts > 0)`                      |
// | `next_attempt_at`    | `nextAttemptAt`  | `not null default now()`                        |
// | `locked_at`/`locked_by` | `lockedAt`/`lockedBy` | lease del worker                       |
// | `last_error`         | `lastError`      | SANITIZADO — nunca stack ni PII                 |
// | `idempotency_key`    | `idempotencyKey` | `unique (organization_id, idempotency_key)`     |
// | `archived_at`        | `archivedAt`     | estado terminal archivado                       |
//
// `correlation_id`/`causation_id` NO son columnas de `outbox_messages`: viven
// en `domain_events`, al que la tabla apunta por `domain_event_id` con FK
// compuesta `(domain_event_id, organization_id)`. El worker por tanto los LEE
// del evento enlazado, exactamente como lo haría un `JOIN` en Postgres — ver
// `ClaimedOutboxMessage`. Inventar esas columnas en el worker habría
// divergido del schema real.

/** `check (status in ('pending','processing','sent','failed','dead'))`. */
export type OutboxStatus = "pending" | "processing" | "sent" | "failed" | "dead";

/** Estados terminales: el worker nunca vuelve a reclamar una fila así. */
export const TERMINAL_OUTBOX_STATUSES: readonly OutboxStatus[] = ["sent", "dead"];

export interface OutboxMessageRow {
  id: string;
  organizationId: string;
  domainEventId: string;
  messageType: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  /** ISO 8601. El worker nunca reclama una fila con `nextAttemptAt` futuro. */
  nextAttemptAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  /** Siempre pasado por `sanitizeOutboxError` antes de escribirse. */
  lastError: string | null;
  idempotencyKey: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Subconjunto de `domain_events` que el worker necesita. NO es el modelo
 * completo de la tabla — solo lo que la cadena causal exige (sección 8:
 * "correlation/causation IDs").
 */
export interface DomainEventRef {
  id: string;
  organizationId: string;
  eventType: string;
  correlationId: string;
  causationId: string | null;
}

/**
 * Lo que `claimBatch` devuelve: la fila del outbox YA marcada `processing`
 * con lease del worker, más los IDs de correlación resueltos desde el
 * `domain_events` enlazado. En Postgres esto es un `UPDATE ... RETURNING`
 * con un `JOIN` al evento; aquí el repositorio en memoria produce la misma
 * forma.
 */
export interface ClaimedOutboxMessage {
  message: OutboxMessageRow;
  correlationId: string;
  causationId: string | null;
  /** Tipo del `domain_events` que originó el mensaje — contexto de log. */
  eventType: string;
}

export interface ClaimBatchInput {
  /** Identidad del proceso que reclama — se persiste en `locked_by`. */
  workerId: string;
  now: Date;
  /** Duración del lease en ms; vencido, otro worker puede recuperar la fila. */
  leaseMs: number;
  /** Tope de filas por ciclo. */
  limit: number;
}

export interface MarkFailedInput {
  id: string;
  organizationId: string;
  now: Date;
  /** Ya sanitizado por el worker — el repositorio no re-sanitiza. */
  sanitizedError: string;
  /** ISO 8601 calculado por la política de backoff. */
  nextAttemptAt: string;
}

export interface MarkDeadInput {
  id: string;
  organizationId: string;
  now: Date;
  sanitizedError: string;
}

export interface OutboxHealthSnapshot {
  /** Conteo por estado — nunca payloads ni `lastError` (sección 13: "no
   * exponer configuración o detalles internos en endpoint público"). */
  countsByStatus: Record<OutboxStatus, number>;
  /** Antigüedad en segundos del mensaje pendiente más viejo — "outbox lag". */
  oldestPendingAgeSeconds: number | null;
  /** Mensajes en estado terminal de fallo, visibles para operación. */
  deadCount: number;
}

/**
 * Contrato del repositorio de outbox.
 *
 * ## Por qué esta interfaz existe (mismo patrón que `commands-engine.ts`)
 *
 * `apps/web/src/lib/commands-engine.ts` documenta la filosofía de este
 * proyecto: el estado vive detrás de una función de acceso, de modo que
 * cambiar la implementación en memoria por una respaldada por Postgres sea
 * un reemplazo directo, sin tocar a los llamadores. Este contrato es lo
 * mismo para el outbox: `OutboxWorker` solo conoce esta interfaz, nunca la
 * implementación. `InMemoryOutboxRepository` es la única implementación en
 * R0 porque este entorno no tiene Postgres alcanzable.
 *
 * ## Cómo se implementa cada método contra Postgres real (mapeo comprometido)
 *
 * - `claimBatch` — UNA sentencia, no un select-luego-update:
 *   ```sql
 *   update outbox_messages m
 *      set status = 'processing', locked_at = $now, locked_by = $workerId,
 *          attempts = m.attempts + 1, updated_at = $now
 *    where m.id in (
 *      select id from outbox_messages
 *       where status in ('pending','processing')
 *         and next_attempt_at <= $now
 *         and (status = 'pending' or locked_at is null
 *              or locked_at <= $now - ($leaseMs || ' milliseconds')::interval)
 *       order by next_attempt_at
 *       limit $limit
 *       for update skip locked          -- <= exclusión mutua real
 *    )
 *   returning m.*;
 *   ```
 *   `for update skip locked` es lo que garantiza "dos workers no procesan el
 *   mismo mensaje". El índice `outbox_messages_pending_idx (next_attempt_at)
 *   where status in ('pending','processing')` de `0085` ya sirve ese
 *   predicado exacto — no hace falta índice nuevo.
 *
 * - `markSent` / `markFailedWithRetry` / `markDead` — `update ... where id = $1
 *   and organization_id = $2`, liberando el lease (`locked_at`/`locked_by` a
 *   null). El trigger `outbox_messages_set_updated_at` de `0085` ya mantiene
 *   `updated_at`; la implementación en memoria lo hace a mano para
 *   comportarse igual.
 *
 * - `health` — agregación por `status`; en Postgres corresponde a la función
 *   `datatek_platform.outbox_health()` que la migración `0090` ya declara
 *   (`security_definer`, gateada por permiso, sin payload ni `last_error`).
 *
 * ## Invariantes que CUALQUIER implementación debe sostener
 *
 * 1. Un mensaje reclamado por un worker no puede ser reclamado por otro
 *    hasta que su lease venza o alcance estado terminal.
 * 2. `claimBatch` incrementa `attempts` en el momento del claim, no al
 *    fallar — así un worker que muere a media tarea igual consumió su
 *    intento y un poison message no puede girar para siempre.
 * 3. `lastError` nunca contiene stack trace ni PII (ver `sanitizeOutboxError`).
 * 4. Ninguna operación del repositorio toca tablas de negocio. Un fallo del
 *    worker jamás revierte un caso, una cotización ni una autorización.
 */
export interface OutboxRepository {
  claimBatch(input: ClaimBatchInput): Promise<ClaimedOutboxMessage[]>;
  markSent(input: { id: string; organizationId: string; now: Date }): Promise<void>;
  markFailedWithRetry(input: MarkFailedInput): Promise<void>;
  markDead(input: MarkDeadInput): Promise<void>;
  health(now: Date): Promise<OutboxHealthSnapshot>;
}
