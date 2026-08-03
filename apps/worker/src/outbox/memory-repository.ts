// Implementación en memoria de `OutboxRepository` — DATATEK_R0_E sección 8.
//
// Única implementación en R0: este entorno no tiene Postgres alcanzable
// (sin Docker ni Supabase CLI, ver docs/runbooks/database-reset.md), igual
// que `apps/web/src/lib/commands-engine.ts` mantiene el estado del motor de
// comandos en memoria por la misma razón. El contrato que implementa
// (`types.ts`) documenta el SQL exacto que la versión Postgres ejecutará;
// esta clase se reemplaza sin tocar `OutboxWorker` ni sus tests de política.
//
// ## Cómo se logra exclusión mutua aquí, y qué prueba (y qué no)
//
// En Postgres la exclusión la da `for update skip locked`. Aquí la da el
// hecho de que la SECCIÓN CRÍTICA de `claimBatch` (elegir filas elegibles y
// estamparlas como `processing` con lease) es SÍNCRONA: no contiene ningún
// `await`, así que el event loop de Node no puede intercalar otra llamada a
// la mitad. Dos `claimBatch` disparados con `Promise.all` se ejecutan uno
// después del otro completo, y el segundo ya ve las filas con lease vivo.
//
// Esto es honestidad, no un atajo: la misma nota de arquitectura que
// DATATEK_R0_E_FASE1_REPORT.md hizo para el motor de comandos aplica aquí —
// Node es single-threaded, así que `Promise.all` no crea dos hilos reales.
// La diferencia con el caso de folios de la Fase 1 (donde dos "transacciones"
// que leían el mismo snapshot SÍ colisionaban) es que allí el algoritmo
// leía y escribía en pasos separados; aquí la lectura y el estampado son
// UNA sola operación indivisible, que es precisamente la propiedad que
// `for update skip locked` aporta en Postgres. Por eso este repositorio sí
// reproduce la garantía, y el de folios no reproducía la suya.

import type {
  ClaimBatchInput,
  ClaimedOutboxMessage,
  DomainEventRef,
  MarkDeadInput,
  MarkFailedInput,
  OutboxHealthSnapshot,
  OutboxMessageRow,
  OutboxRepository,
  OutboxStatus,
} from "./types.ts";

const ALL_STATUSES: readonly OutboxStatus[] = ["pending", "processing", "sent", "failed", "dead"];

export interface InMemoryOutboxSeed {
  messages: OutboxMessageRow[];
  domainEvents: DomainEventRef[];
}

export class InMemoryOutboxRepository implements OutboxRepository {
  private messages: OutboxMessageRow[];
  private readonly domainEvents: DomainEventRef[];

  constructor(seed: InMemoryOutboxSeed = { messages: [], domainEvents: [] }) {
    this.messages = seed.messages.map((m) => ({ ...m }));
    this.domainEvents = seed.domainEvents.map((e) => ({ ...e }));
  }

  /** Solo para tests/inspección — nunca lo llama el worker. */
  snapshot(): OutboxMessageRow[] {
    return this.messages.map((m) => ({ ...m }));
  }

  /** Solo para tests/inspección. */
  findById(id: string): OutboxMessageRow | undefined {
    const found = this.messages.find((m) => m.id === id);
    return found ? { ...found } : undefined;
  }

  async claimBatch(input: ClaimBatchInput): Promise<ClaimedOutboxMessage[]> {
    // --- SECCIÓN CRÍTICA SÍNCRONA (ver cabecera) -------------------------
    // Nada de `await` entre elegir y estampar. Equivale al
    // `update ... where id in (select ... for update skip locked) returning *`
    // documentado en `types.ts`.
    const nowMs = input.now.getTime();
    const leaseCutoffMs = nowMs - input.leaseMs;

    const eligible = this.messages
      .filter((m) => isClaimable(m, nowMs, leaseCutoffMs))
      .sort((a, b) => Date.parse(a.nextAttemptAt) - Date.parse(b.nextAttemptAt))
      .slice(0, Math.max(0, input.limit));

    const nowIso = input.now.toISOString();
    const claimed: ClaimedOutboxMessage[] = [];

    for (const row of eligible) {
      // El intento se consume EN EL CLAIM, no al fallar. Un worker que
      // muere a media tarea igual gastó su intento — sin esto, un mensaje
      // que siempre mata a su worker giraría para siempre sin llegar nunca
      // a `dead` (el "loop infinito silencioso" que sección 8 prohíbe).
      const updated: OutboxMessageRow = {
        ...row,
        status: "processing",
        attempts: row.attempts + 1,
        lockedAt: nowIso,
        lockedBy: input.workerId,
        updatedAt: nowIso,
      };
      this.replace(updated);

      const event = this.domainEvents.find((e) => e.id === updated.domainEventId);
      claimed.push({
        message: { ...updated },
        // Un mensaje sin su `domain_events` enlazado es imposible en
        // Postgres (FK compuesta NOT NULL en `0085`). En memoria puede
        // ocurrir por una siembra incompleta de test: se degrada a un
        // correlation id derivado del propio mensaje en vez de romper el
        // ciclo, y nunca a `undefined`.
        correlationId: event?.correlationId ?? `orphan-event:${updated.domainEventId}`,
        causationId: event?.causationId ?? null,
        eventType: event?.eventType ?? "unknown",
      });
    }
    // --- FIN SECCIÓN CRÍTICA ---------------------------------------------

    return claimed;
  }

  async markSent(input: { id: string; organizationId: string; now: Date }): Promise<void> {
    const row = this.locate(input.id, input.organizationId);
    if (!row) return;
    const nowIso = input.now.toISOString();
    this.replace({
      ...row,
      status: "sent",
      // Libera el lease. El `check (status <> 'sent' or locked_at is not
      // null or attempts > 0)` de `0085` se sigue cumpliendo porque
      // `claimBatch` ya dejó `attempts > 0`.
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      archivedAt: nowIso,
      updatedAt: nowIso,
    });
  }

  async markFailedWithRetry(input: MarkFailedInput): Promise<void> {
    const row = this.locate(input.id, input.organizationId);
    if (!row) return;
    const nowIso = input.now.toISOString();
    this.replace({
      ...row,
      // Vuelve a `pending`: sigue siendo trabajo por hacer, pero con el
      // lease liberado y `next_attempt_at` empujado por el backoff.
      status: "pending",
      lockedAt: null,
      lockedBy: null,
      lastError: input.sanitizedError,
      nextAttemptAt: input.nextAttemptAt,
      updatedAt: nowIso,
    });
  }

  async markDead(input: MarkDeadInput): Promise<void> {
    const row = this.locate(input.id, input.organizationId);
    if (!row) return;
    const nowIso = input.now.toISOString();
    this.replace({
      ...row,
      // Estado terminal VISIBLE — sección 8: "poison message termina en
      // estado visible". `dead` + `archived_at` + `last_error` sanitizado
      // es exactamente lo que un operador necesita para encontrarlo.
      status: "dead",
      lockedAt: null,
      lockedBy: null,
      lastError: input.sanitizedError,
      archivedAt: nowIso,
      updatedAt: nowIso,
    });
  }

  async health(now: Date): Promise<OutboxHealthSnapshot> {
    const countsByStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
      OutboxStatus,
      number
    >;

    let oldestPendingMs: number | null = null;
    for (const m of this.messages) {
      countsByStatus[m.status] += 1;
      if (m.status === "pending" || m.status === "processing") {
        const created = Date.parse(m.createdAt);
        if (!Number.isNaN(created) && (oldestPendingMs === null || created < oldestPendingMs)) {
          oldestPendingMs = created;
        }
      }
    }

    return {
      countsByStatus,
      oldestPendingAgeSeconds:
        oldestPendingMs === null
          ? null
          : Math.max(0, Math.floor((now.getTime() - oldestPendingMs) / 1000)),
      deadCount: countsByStatus.dead,
    };
  }

  private locate(id: string, organizationId: string): OutboxMessageRow | undefined {
    // El filtro por `organization_id` no es decorativo: reproduce el
    // `where id = $1 and organization_id = $2` que la versión Postgres usa
    // para que ni siquiera un id adivinado cruce de tenant.
    return this.messages.find((m) => m.id === id && m.organizationId === organizationId);
  }

  private replace(updated: OutboxMessageRow): void {
    this.messages = this.messages.map((m) => (m.id === updated.id ? updated : m));
  }
}

function isClaimable(row: OutboxMessageRow, nowMs: number, leaseCutoffMs: number): boolean {
  // Terminal: nunca se vuelve a tocar.
  if (row.status === "sent" || row.status === "dead") return false;
  // `failed` es un estado de reposo explícito; solo `pending`/`processing`
  // entran al índice parcial `outbox_messages_pending_idx` de `0085`, y el
  // claim respeta exactamente ese predicado.
  if (row.status !== "pending" && row.status !== "processing") return false;
  // Respeta el backoff.
  if (Date.parse(row.nextAttemptAt) > nowMs) return false;
  // Nunca exceder `check (attempts <= max_attempts)`: si ya no quedan
  // intentos, la fila no se reclama (el worker la matará por la vía de
  // `markDead`, no reclamándola otra vez).
  if (row.attempts >= row.maxAttempts) return false;
  // Lease vivo de OTRO worker (o del mismo tras un crash): intocable hasta
  // que venza. Esta es la recuperación por lease vencida de sección 8.
  if (row.status === "processing") {
    const lockedAtMs = row.lockedAt === null ? null : Date.parse(row.lockedAt);
    if (lockedAtMs !== null && !Number.isNaN(lockedAtMs) && lockedAtMs > leaseCutoffMs) {
      return false;
    }
  }
  return true;
}
