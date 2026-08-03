// El worker de outbox — DATATEK_R0_E sección 8.
//
// Cubre los nueve requisitos que la sección enumera:
//
//   1. claim con lock/lease      -> `repository.claimBatch` (ver types.ts)
//   2. procesamiento idempotente -> handlers dedupean por idempotency key
//   3. heartbeat/health          -> `recordHeartbeat()` / `health()`
//   4. intentos                  -> `attempts`, incrementado en el claim
//   5. backoff                   -> `computeNextAttemptAt`
//   6. error sanitizado          -> `sanitizeOutboxError` antes de persistir
//   7. `next_attempt_at`         -> escrito en cada fallo recuperable
//   8. estado terminal/archive   -> `sent`/`dead` + `archived_at`
//   9. correlation/causation IDs -> leídos del `domain_events` enlazado y
//                                   propagados a logs y efectos
//
// El worker NUNCA escribe en una tabla de negocio. Su única superficie de
// escritura es `OutboxRepository` (cuatro métodos, todos sobre
// `outbox_messages`) más los sumideros locales de `OutboxHandlerDeps`. Esa
// restricción es lo que hace cierto el quinto test obligatorio de la
// sección: "fallo del worker no revierte el caso ya confirmado" — no por
// disciplina, sino porque no existe el camino de código.

import {
  buildDefaultHandlers,
  type OutboxHandler,
  type OutboxHandlerDeps,
  LocalNotificationLog,
  OrphanUploadCleanupLog,
} from "./handlers.ts";
import {
  computeNextAttemptAt,
  DEFAULT_BACKOFF,
  sanitizeOutboxError,
  type BackoffPolicy,
} from "./sanitize.ts";
import type { ClaimedOutboxMessage, OutboxHealthSnapshot, OutboxRepository } from "./types.ts";

/**
 * Error que el worker NO debe reintentar: reintentarlo daría el mismo
 * resultado para siempre. Se manda directo a estado terminal `dead`, que es
 * "visible" en el sentido que pide la sección 8 — con `last_error`
 * sanitizado y `archived_at`, no girando en silencio.
 */
export class PermanentOutboxError extends Error {
  override readonly name = "PermanentOutboxError";
}

export interface WorkerLogEntry {
  level: "info" | "warn" | "error";
  /** Siempre `"worker"` — sección 13 pide distinguir app/worker. */
  app: "worker";
  event: string;
  workerId: string;
  /** Referencia segura al tenant: el id, nunca su nombre. */
  organizationId?: string;
  messageId?: string;
  messageType?: string;
  correlationId?: string;
  causationId?: string | null;
  attempts?: number;
  durationMs?: number;
  result?: "succeeded" | "retry_scheduled" | "dead";
  /** Ya sanitizado. Nunca un stack. */
  error?: string;
}

export type WorkerLogger = (entry: WorkerLogEntry) => void;

export interface OutboxWorkerOptions {
  repository: OutboxRepository;
  workerId: string;
  /** Duración del lease. Debe exceder cómodamente el peor tiempo de
   * procesamiento esperado, o dos workers procesarán en paralelo un mensaje
   * lento (mitigado por la idempotencia de los handlers, pero igual
   * indeseable). */
  leaseMs?: number;
  batchSize?: number;
  backoff?: BackoffPolicy;
  handlers?: Map<string, OutboxHandler>;
  logger?: WorkerLogger;
  notificationLog?: LocalNotificationLog;
  cleanupLog?: OrphanUploadCleanupLog;
  readOnlyUploadIntents?: readonly {
    id: string;
    organizationId: string;
    status: string;
    expiresAt: string;
  }[];
}

export interface CycleResult {
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
}

export interface WorkerHealth {
  workerId: string;
  /** `null` hasta el primer ciclo — un worker que nunca latió NO se
   * presenta como saludable (NO-GO: "`unknown` se presenta como saludable"). */
  lastHeartbeatAt: string | null;
  status: "unknown" | "healthy";
  cyclesRun: number;
  outbox: OutboxHealthSnapshot;
}

export const DEFAULT_LEASE_MS = 30_000;
export const DEFAULT_BATCH_SIZE = 10;

export class OutboxWorker {
  private readonly repository: OutboxRepository;
  private readonly workerId: string;
  private readonly leaseMs: number;
  private readonly batchSize: number;
  private readonly backoff: BackoffPolicy;
  private readonly handlers: Map<string, OutboxHandler>;
  private readonly logger: WorkerLogger;
  readonly notificationLog: LocalNotificationLog;
  readonly cleanupLog: OrphanUploadCleanupLog;
  private readonly readOnlyUploadIntents: readonly {
    id: string;
    organizationId: string;
    status: string;
    expiresAt: string;
  }[];

  private lastHeartbeatAt: string | null = null;
  private cyclesRun = 0;

  constructor(options: OutboxWorkerOptions) {
    this.repository = options.repository;
    this.workerId = options.workerId;
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.backoff = options.backoff ?? DEFAULT_BACKOFF;
    this.handlers = options.handlers ?? buildDefaultHandlers();
    this.logger = options.logger ?? (() => {});
    this.notificationLog = options.notificationLog ?? new LocalNotificationLog();
    this.cleanupLog = options.cleanupLog ?? new OrphanUploadCleanupLog();
    this.readOnlyUploadIntents = options.readOnlyUploadIntents ?? [];
  }

  /** Un ciclo: reclama un lote y procesa cada mensaje. */
  async runCycle(now: Date = new Date()): Promise<CycleResult> {
    const claimed = await this.repository.claimBatch({
      workerId: this.workerId,
      now,
      leaseMs: this.leaseMs,
      limit: this.batchSize,
    });

    const result: CycleResult = { claimed: claimed.length, succeeded: 0, retried: 0, dead: 0 };

    for (const item of claimed) {
      const outcome = await this.processOne(item, now);
      if (outcome === "succeeded") result.succeeded += 1;
      else if (outcome === "retry_scheduled") result.retried += 1;
      else result.dead += 1;
    }

    // Heartbeat al CERRAR el ciclo, no al abrirlo: así refleja "terminé un
    // ciclo completo", que es la señal útil. Un worker colgado a mitad de
    // un mensaje deja de latir, que es justo lo que health debe delatar.
    this.cyclesRun += 1;
    this.lastHeartbeatAt = now.toISOString();
    this.logger({
      level: "info",
      app: "worker",
      event: "outbox.cycle.completed",
      workerId: this.workerId,
      attempts: result.claimed,
    });

    return result;
  }

  private async processOne(
    item: ClaimedOutboxMessage,
    now: Date,
  ): Promise<"succeeded" | "retry_scheduled" | "dead"> {
    const { message } = item;
    const startedAt = Date.now();
    const handler = this.handlers.get(message.messageType);

    try {
      if (!handler) {
        // Sin handler registrado: reintentar no cambiaría nada.
        throw new PermanentOutboxError(`sin handler registrado para ${message.messageType}`);
      }

      const deps: OutboxHandlerDeps = {
        notificationLog: this.notificationLog,
        cleanupLog: this.cleanupLog,
        readOnlyUploadIntents: this.readOnlyUploadIntents,
        now,
      };
      await handler(item, deps);

      await this.repository.markSent({
        id: message.id,
        organizationId: message.organizationId,
        now,
      });
      this.log(item, "info", "outbox.message.succeeded", "succeeded", startedAt);
      return "succeeded";
    } catch (error) {
      const sanitizedError = sanitizeOutboxError(error);
      const permanent = error instanceof PermanentOutboxError;
      // `attempts` ya viene incrementado por el claim, así que
      // `attempts >= maxAttempts` significa "este fue el último intento".
      const exhausted = message.attempts >= message.maxAttempts;

      if (permanent || exhausted) {
        await this.repository.markDead({
          id: message.id,
          organizationId: message.organizationId,
          now,
          sanitizedError,
        });
        this.log(item, "error", "outbox.message.dead", "dead", startedAt, sanitizedError);
        return "dead";
      }

      await this.repository.markFailedWithRetry({
        id: message.id,
        organizationId: message.organizationId,
        now,
        sanitizedError,
        nextAttemptAt: computeNextAttemptAt(now, message.attempts, this.backoff),
      });
      this.log(
        item,
        "warn",
        "outbox.message.retry_scheduled",
        "retry_scheduled",
        startedAt,
        sanitizedError,
      );
      return "retry_scheduled";
    }
  }

  async health(now: Date = new Date()): Promise<WorkerHealth> {
    return {
      workerId: this.workerId,
      lastHeartbeatAt: this.lastHeartbeatAt,
      // Un worker sin latido declara `unknown`, nunca `healthy`.
      status: this.lastHeartbeatAt === null ? "unknown" : "healthy",
      cyclesRun: this.cyclesRun,
      outbox: await this.repository.health(now),
    };
  }

  private log(
    item: ClaimedOutboxMessage,
    level: WorkerLogEntry["level"],
    event: string,
    result: WorkerLogEntry["result"],
    startedAt: number,
    error?: string,
  ): void {
    this.logger({
      level,
      app: "worker",
      event,
      workerId: this.workerId,
      organizationId: item.message.organizationId,
      messageId: item.message.id,
      messageType: item.message.messageType,
      correlationId: item.correlationId,
      causationId: item.causationId,
      attempts: item.message.attempts,
      durationMs: Date.now() - startedAt,
      result,
      // Nunca el objeto de error: solo su etiqueta sanitizada. El payload
      // del mensaje NUNCA se loguea — puede contener datos del cliente.
      ...(error ? { error } : {}),
    });
  }
}
