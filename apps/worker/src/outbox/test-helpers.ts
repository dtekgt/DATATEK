// Constructores de fixtures para los tests del worker de outbox.
// Ningún dato aquí es real: ids sintéticos, sin PII.

import type { DomainEventRef, OutboxMessageRow } from "./types.ts";

export const ORG_A = "org-dtek-servicios";
export const ORG_B = "org-taller-demo";

export const T0 = "2026-08-02T12:00:00.000Z";

export function buildDomainEvent(overrides: Partial<DomainEventRef> = {}): DomainEventRef {
  return {
    id: "evt-1",
    organizationId: ORG_A,
    eventType: "authorization.prepared",
    correlationId: "corr-1",
    causationId: "cause-1",
    ...overrides,
  };
}

export function buildOutboxMessage(overrides: Partial<OutboxMessageRow> = {}): OutboxMessageRow {
  return {
    id: "msg-1",
    organizationId: ORG_A,
    domainEventId: "evt-1",
    messageType: "notify.customer.authorization_prepared",
    payload: { audienceCustomerId: "cust-1" },
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: T0,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    idempotencyKey: "idem-msg-1",
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** `T0` desplazado por `ms`, como ISO 8601. */
export function at(ms: number): Date {
  return new Date(Date.parse(T0) + ms);
}
