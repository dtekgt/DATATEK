// Handlers permitidos en R0 — DATATEK_R0_E sección 8, "Casos R0".
//
// La sección enumera exactamente lo que este worker puede hacer:
//
//   - registro de intento de notificación local;
//   - cleanup de uploads huérfanos;
//   - health de worker;
//   - NINGÚN envío real;
//   - NINGÚN PDF final.
//
// Las dos primeras están abajo. La tercera (health) no es un handler sino
// una capacidad del propio worker (`OutboxWorker.health()`).
//
// Las dos prohibiciones son estructurales, no una promesa: ningún handler
// recibe un cliente HTTP, un transporte SMTP/WhatsApp, ni un generador de
// documentos. `OutboxHandlerDeps` (abajo) es la ÚNICA superficie que un
// handler puede tocar, y solo contiene sumideros de registro locales. Para
// que un handler enviara algo de verdad habría que ampliar ese tipo, lo que
// convierte cualquier intento futuro en un cambio visible en revisión.

import type { ClaimedOutboxMessage } from "./types.ts";

/** Un intento de notificación REGISTRADO, nunca despachado. */
export interface NotificationAttemptRecord {
  id: string;
  organizationId: string;
  /** `simulado_local` siempre — mismo vocabulario que usa
   * `MarkAuthorizationRequestSent` en el motor de comandos. */
  channel: "simulado_local";
  messageType: string;
  /** Referencia opaca al destinatario (id), NUNCA su email/teléfono. */
  audienceRef: string | null;
  correlationId: string;
  causationId: string | null;
  recordedAt: string;
  /** Clave de dedupe — la del mensaje de outbox que lo originó. */
  idempotencyKey: string;
}

/** Un upload intent huérfano marcado como vencido por el cleanup. */
export interface OrphanUploadCleanupRecord {
  id: string;
  organizationId: string;
  uploadIntentIds: string[];
  correlationId: string;
  recordedAt: string;
  idempotencyKey: string;
}

/**
 * Sumidero idempotente. La dedupe por `(organizationId, idempotencyKey)`
 * refleja el `unique (organization_id, idempotency_key)` que
 * `outbox_messages` ya declara en `0085` — el mismo par que identifica al
 * mensaje identifica a su efecto, así que reintentar no duplica.
 */
export class LocalNotificationLog {
  private readonly records: NotificationAttemptRecord[] = [];

  /** @returns `true` si escribió; `false` si ya existía (replay). */
  record(record: NotificationAttemptRecord): boolean {
    if (this.has(record.organizationId, record.idempotencyKey)) return false;
    this.records.push({ ...record });
    return true;
  }

  has(organizationId: string, idempotencyKey: string): boolean {
    return this.records.some(
      (r) => r.organizationId === organizationId && r.idempotencyKey === idempotencyKey,
    );
  }

  all(): NotificationAttemptRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  countFor(organizationId: string, idempotencyKey: string): number {
    return this.records.filter(
      (r) => r.organizationId === organizationId && r.idempotencyKey === idempotencyKey,
    ).length;
  }
}

export class OrphanUploadCleanupLog {
  private readonly records: OrphanUploadCleanupRecord[] = [];

  record(record: OrphanUploadCleanupRecord): boolean {
    if (
      this.records.some(
        (r) =>
          r.organizationId === record.organizationId && r.idempotencyKey === record.idempotencyKey,
      )
    ) {
      return false;
    }
    this.records.push({ ...record, uploadIntentIds: [...record.uploadIntentIds] });
    return true;
  }

  all(): OrphanUploadCleanupRecord[] {
    return this.records.map((r) => ({ ...r, uploadIntentIds: [...r.uploadIntentIds] }));
  }
}

/**
 * Todo lo que un handler puede tocar. Deliberadamente sin red, sin sistema
 * de archivos y sin acceso de ESCRITURA a ninguna tabla de negocio.
 *
 * `readOnlyUploadIntents` es una VISTA de solo lectura: el cleanup de
 * uploads huérfanos en R0 REGISTRA cuáles vencieron, no los borra. Borrar
 * evidencia desde un proceso de fondo es exactamente el tipo de acción
 * irreversible que R0 no autoriza (sección 1: "No incluye ejecución
 * mecánica"), y el propio motor de comandos todavía no expone un
 * `CancelUploadIntent` (deuda #4 de DATATEK_R0_E_FASE1_REPORT.md).
 */
export interface OutboxHandlerDeps {
  notificationLog: LocalNotificationLog;
  cleanupLog: OrphanUploadCleanupLog;
  readOnlyUploadIntents: readonly {
    id: string;
    organizationId: string;
    status: string;
    expiresAt: string;
  }[];
  now: Date;
}

export type OutboxHandler = (
  claimed: ClaimedOutboxMessage,
  deps: OutboxHandlerDeps,
) => Promise<void> | void;

export const MESSAGE_TYPE_NOTIFY_AUTHORIZATION_PREPARED = "notify.customer.authorization_prepared";
export const MESSAGE_TYPE_NOTIFY_AUTHORIZATION_REISSUED = "notify.customer.authorization_reissued";
export const MESSAGE_TYPE_CLEANUP_ORPHANED_UPLOADS = "maintenance.uploads.cleanup_orphaned";

/**
 * Registro de intento de notificación local. NO envía nada: escribe una
 * fila que dice "aquí se habría notificado", con la misma semántica que
 * `channel: "simulado_local"` ya tiene en `authorization_events`.
 *
 * Nunca lee email/teléfono del payload — solo un id de audiencia opaco.
 * Si el payload trajera un token de autorización, no se toca: el token
 * jamás sale del `PrepareAuthorizationRequest` que lo generó (sección 9,
 * "tokens no logueados").
 */
export const recordLocalNotificationAttempt: OutboxHandler = (claimed, deps) => {
  const { message } = claimed;
  const audienceRef = readStringField(message.payload, "audienceCustomerId");

  deps.notificationLog.record({
    id: `notif-${message.id}`,
    organizationId: message.organizationId,
    channel: "simulado_local",
    messageType: message.messageType,
    audienceRef,
    correlationId: claimed.correlationId,
    causationId: claimed.causationId,
    recordedAt: deps.now.toISOString(),
    idempotencyKey: message.idempotencyKey,
  });
};

/**
 * Cleanup de uploads huérfanos: identifica upload intents `pending` cuyo
 * `expires_at` ya pasó y registra el hallazgo. No borra (ver
 * `OutboxHandlerDeps.readOnlyUploadIntents`).
 */
export const recordOrphanUploadCleanup: OutboxHandler = (claimed, deps) => {
  const { message } = claimed;
  const nowMs = deps.now.getTime();
  const orphaned = deps.readOnlyUploadIntents
    .filter(
      (u) =>
        u.organizationId === message.organizationId &&
        u.status === "pending" &&
        Date.parse(u.expiresAt) <= nowMs,
    )
    .map((u) => u.id);

  deps.cleanupLog.record({
    id: `cleanup-${message.id}`,
    organizationId: message.organizationId,
    uploadIntentIds: orphaned,
    correlationId: claimed.correlationId,
    recordedAt: deps.now.toISOString(),
    idempotencyKey: message.idempotencyKey,
  });
};

/** Registro por defecto de handlers permitidos en R0. */
export function buildDefaultHandlers(): Map<string, OutboxHandler> {
  return new Map<string, OutboxHandler>([
    [MESSAGE_TYPE_NOTIFY_AUTHORIZATION_PREPARED, recordLocalNotificationAttempt],
    [MESSAGE_TYPE_NOTIFY_AUTHORIZATION_REISSUED, recordLocalNotificationAttempt],
    [MESSAGE_TYPE_CLEANUP_ORPHANED_UPLOADS, recordOrphanUploadCleanup],
  ]);
}

function readStringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}
