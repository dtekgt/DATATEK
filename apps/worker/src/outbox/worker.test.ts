// Pruebas obligatorias del worker de outbox — DATATEK_R0_E sección 8,
// bloque "Pruebas:". Los cinco casos que la sección enumera literalmente
// tienen aquí un `describe` con su nombre textual, más pruebas de apoyo
// para los requisitos que la lista no convierte en caso propio (backoff,
// `next_attempt_at`, heartbeat/health, correlation/causation).
//
// NOTA DE ARQUITECTURA (misma honestidad que DATATEK_R0_E_FASE1_REPORT.md
// sección 2.1): Node es single-threaded, así que `Promise.all` no crea dos
// hilos reales. Lo que estos tests SÍ prueban de forma real es que la
// exclusión mutua no depende del orden de llegada: la sección crítica de
// `claimBatch` es síncrona (no contiene `await`), que es exactamente la
// propiedad que `for update skip locked` aporta en Postgres. La diferencia
// con el caso de folios de la Fase 1 — donde dos "transacciones" sobre el
// mismo snapshot SÍ colisionaban — es que allí leer y escribir eran pasos
// separados; aquí son uno indivisible. Por eso este repositorio reproduce
// su garantía y aquel no reproducía la suya. Donde importa, los tests
// verifican el ESTADO PERSISTIDO (lease, attempts, status), no solo el
// valor de retorno, para no depender del orden de resolución de promesas.
import { describe, it } from "node:test";
import { expect } from "expect";
import { InMemoryOutboxRepository } from "./memory-repository.ts";
import { OutboxWorker, PermanentOutboxError, type WorkerLogEntry } from "./worker.ts";
import {
  buildDefaultHandlers,
  MESSAGE_TYPE_CLEANUP_ORPHANED_UPLOADS,
  type OutboxHandler,
} from "./handlers.ts";
import { at, buildDomainEvent, buildOutboxMessage, ORG_A, ORG_B, T0 } from "./test-helpers.ts";
import { computeBackoffDelayMs, DEFAULT_BACKOFF } from "./sanitize.ts";

const LEASE_MS = 30_000;

function seedOne(overrides = {}) {
  return new InMemoryOutboxRepository({
    messages: [buildOutboxMessage(overrides)],
    domainEvents: [buildDomainEvent()],
  });
}

describe("outbox worker — dos workers no procesan el mismo mensaje simultáneamente", () => {
  it("solo un worker reclama el mensaje cuando ambos corren un ciclo a la vez", async () => {
    const repository = seedOne();
    const workerA = new OutboxWorker({ repository, workerId: "worker-a", leaseMs: LEASE_MS });
    const workerB = new OutboxWorker({ repository, workerId: "worker-b", leaseMs: LEASE_MS });

    const [resultA, resultB] = await Promise.all([
      workerA.runCycle(at(0)),
      workerB.runCycle(at(0)),
    ]);

    // Exactamente uno reclamó; el otro encontró la fila con lease vivo.
    expect(resultA.claimed + resultB.claimed).toBe(1);
    expect(resultA.succeeded + resultB.succeeded).toBe(1);

    // El efecto local se registró UNA sola vez, no dos.
    const totalNotifications =
      workerA.notificationLog.all().length + workerB.notificationLog.all().length;
    expect(totalNotifications).toBe(1);

    const row = repository.findById("msg-1");
    expect(row?.status).toBe("sent");
    expect(row?.attempts).toBe(1);
  });

  it("N claims concurrentes nunca entregan el mismo id dos veces", async () => {
    const repository = new InMemoryOutboxRepository({
      messages: [
        buildOutboxMessage({ id: "m1", idempotencyKey: "k1" }),
        buildOutboxMessage({ id: "m2", idempotencyKey: "k2" }),
        buildOutboxMessage({ id: "m3", idempotencyKey: "k3" }),
      ],
      domainEvents: [buildDomainEvent()],
    });

    const batches = await Promise.all(
      ["w1", "w2", "w3", "w4", "w5"].map((workerId) =>
        repository.claimBatch({ workerId, now: at(0), leaseMs: LEASE_MS, limit: 10 }),
      ),
    );

    const claimedIds = batches.flat().map((c) => c.message.id);
    // Los 3 mensajes se repartieron y ninguno salió dos veces.
    expect(claimedIds.length).toBe(3);
    expect(new Set(claimedIds).size).toBe(3);

    // Cada fila quedó con UN solo dueño y un solo intento consumido.
    for (const id of ["m1", "m2", "m3"]) {
      const row = repository.findById(id);
      expect(row?.status).toBe("processing");
      expect(row?.attempts).toBe(1);
      expect(row?.lockedBy).toBeTruthy();
    }
  });

  it("un segundo claim dentro del lease no devuelve nada", async () => {
    const repository = seedOne();
    const first = await repository.claimBatch({
      workerId: "worker-a",
      now: at(0),
      leaseMs: LEASE_MS,
      limit: 10,
    });
    const second = await repository.claimBatch({
      workerId: "worker-b",
      now: at(LEASE_MS - 1),
      leaseMs: LEASE_MS,
      limit: 10,
    });

    expect(first.length).toBe(1);
    expect(second.length).toBe(0);
    expect(repository.findById("msg-1")?.lockedBy).toBe("worker-a");
  });
});

describe("outbox worker — lease expirada permite recuperación", () => {
  it("otro worker recupera el mensaje una vez vencido el lease", async () => {
    const repository = seedOne();

    // Worker A reclama y "muere" sin resolver (nunca llama markSent).
    const claimedByA = await repository.claimBatch({
      workerId: "worker-a",
      now: at(0),
      leaseMs: LEASE_MS,
      limit: 10,
    });
    expect(claimedByA.length).toBe(1);
    expect(repository.findById("msg-1")?.status).toBe("processing");

    // Antes de vencer: nadie más puede tocarlo.
    const tooEarly = await repository.claimBatch({
      workerId: "worker-b",
      now: at(LEASE_MS - 1),
      leaseMs: LEASE_MS,
      limit: 10,
    });
    expect(tooEarly.length).toBe(0);

    // Vencido: worker B lo recupera y lo lleva a término.
    const workerB = new OutboxWorker({ repository, workerId: "worker-b", leaseMs: LEASE_MS });
    const result = await workerB.runCycle(at(LEASE_MS + 1));

    expect(result.claimed).toBe(1);
    expect(result.succeeded).toBe(1);
    const row = repository.findById("msg-1");
    expect(row?.status).toBe("sent");
    // Dos claims => dos intentos consumidos. El intento del worker muerto
    // NO se regala: así un mensaje que mata workers igual llega a `dead`.
    expect(row?.attempts).toBe(2);
    expect(row?.lockedAt).toBeNull();
  });

  it("un worker muerto no impide que el mensaje alcance estado terminal", async () => {
    // maxAttempts 2: el claim del worker muerto gasta 1, el del vivo gasta
    // el 2.º y ese falla -> `dead`, nunca un mensaje atascado en
    // `processing` para siempre.
    const repository = seedOne({ maxAttempts: 2 });
    await repository.claimBatch({
      workerId: "dead-worker",
      now: at(0),
      leaseMs: LEASE_MS,
      limit: 10,
    });

    const alwaysFails: OutboxHandler = () => {
      throw new Error("fallo transitorio");
    };
    const workerB = new OutboxWorker({
      repository,
      workerId: "worker-b",
      leaseMs: LEASE_MS,
      handlers: new Map([["notify.customer.authorization_prepared", alwaysFails]]),
    });

    const result = await workerB.runCycle(at(LEASE_MS + 1));
    expect(result.dead).toBe(1);
    expect(repository.findById("msg-1")?.status).toBe("dead");
  });
});

describe("outbox worker — retry no duplica", () => {
  it("un reintento tras un fallo no registra dos veces el efecto local", async () => {
    const repository = seedOne();

    // Handler que SIEMPRE escribe su efecto y luego falla la primera vez.
    // Modela el caso peligroso: el efecto ya ocurrió cuando el mensaje se
    // reintenta. La dedupe por idempotency key es lo que lo salva.
    let calls = 0;
    const writeThenFailOnce: OutboxHandler = (claimed, deps) => {
      calls += 1;
      deps.notificationLog.record({
        id: `notif-${claimed.message.id}`,
        organizationId: claimed.message.organizationId,
        channel: "simulado_local",
        messageType: claimed.message.messageType,
        audienceRef: "cust-1",
        correlationId: claimed.correlationId,
        causationId: claimed.causationId,
        recordedAt: deps.now.toISOString(),
        idempotencyKey: claimed.message.idempotencyKey,
      });
      if (calls === 1) throw new Error("caída después de escribir el efecto");
    };

    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      leaseMs: LEASE_MS,
      handlers: new Map([["notify.customer.authorization_prepared", writeThenFailOnce]]),
    });

    const first = await worker.runCycle(at(0));
    expect(first.retried).toBe(1);
    expect(repository.findById("msg-1")?.status).toBe("pending");

    // El reintento debe esperar al backoff: un ciclo inmediato no reclama.
    const tooSoon = await worker.runCycle(at(1));
    expect(tooSoon.claimed).toBe(0);

    // Pasado el backoff, se reintenta y ahora sí tiene éxito.
    const delay = computeBackoffDelayMs(1, DEFAULT_BACKOFF);
    const second = await worker.runCycle(at(delay + 1));
    expect(second.succeeded).toBe(1);

    expect(calls).toBe(2);
    // Dos ejecuciones del handler, UN solo efecto persistido.
    expect(worker.notificationLog.countFor(ORG_A, "idem-msg-1")).toBe(1);
    expect(worker.notificationLog.all().length).toBe(1);
    expect(repository.findById("msg-1")?.status).toBe("sent");
  });

  it("reprocesar un mensaje ya enviado es imposible: `sent` es terminal", async () => {
    const repository = seedOne();
    const worker = new OutboxWorker({ repository, workerId: "worker-a", leaseMs: LEASE_MS });

    await worker.runCycle(at(0));
    expect(repository.findById("msg-1")?.status).toBe("sent");

    // Cualquier ciclo posterior, con lease vencido incluido, no lo reclama.
    const again = await worker.runCycle(at(LEASE_MS * 100));
    expect(again.claimed).toBe(0);
    expect(worker.notificationLog.all().length).toBe(1);
  });
});

describe("outbox worker — poison message termina en estado visible", () => {
  it("agota intentos y queda `dead` con error sanitizado y archivado", async () => {
    const repository = seedOne({ maxAttempts: 3 });
    const alwaysFails: OutboxHandler = () => {
      // Un error cuyo mensaje trae PII y una ruta — debe salir redactado.
      throw new Error(
        "no se pudo notificar a cliente@ejemplo.com desde C:\\Users\\Dominic\\app\\worker.ts",
      );
    };
    const logs: WorkerLogEntry[] = [];
    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      leaseMs: LEASE_MS,
      handlers: new Map([["notify.customer.authorization_prepared", alwaysFails]]),
      logger: (e) => logs.push(e),
    });

    // Intento 1 y 2 reprograman; el 3.º agota.
    let now = 0;
    const r1 = await worker.runCycle(at(now));
    expect(r1.retried).toBe(1);

    now += computeBackoffDelayMs(1, DEFAULT_BACKOFF) + 1;
    const r2 = await worker.runCycle(at(now));
    expect(r2.retried).toBe(1);

    now += computeBackoffDelayMs(2, DEFAULT_BACKOFF) + 1;
    const r3 = await worker.runCycle(at(now));
    expect(r3.dead).toBe(1);

    const row = repository.findById("msg-1");
    expect(row?.status).toBe("dead");
    expect(row?.attempts).toBe(3);
    // VISIBLE: archivado, con error legible y sin lease colgando.
    expect(row?.archivedAt).not.toBeNull();
    expect(row?.lockedAt).toBeNull();
    expect(row?.lastError).toBeTruthy();
    // SANITIZADO: ni email, ni ruta, ni stack.
    expect(row?.lastError).not.toContain("cliente@ejemplo.com");
    expect(row?.lastError).not.toContain("C:\\Users");
    expect(row?.lastError).not.toContain("at Object");
    expect(row?.lastError).toContain("[email]");

    // NO es un loop silencioso: ya no se reclama nunca más.
    const after = await worker.runCycle(at(now + 10_000_000));
    expect(after.claimed).toBe(0);

    // Y quedó registrado en el log estructurado con resultado explícito.
    expect(logs.some((l) => l.event === "outbox.message.dead" && l.result === "dead")).toBe(true);

    // El health lo reporta como muerto, no lo esconde.
    const health = await worker.health(at(now));
    expect(health.outbox.deadCount).toBe(1);
    expect(health.outbox.countsByStatus.dead).toBe(1);
  });

  it("un tipo de mensaje sin handler muere de inmediato, no reintenta para siempre", async () => {
    const repository = seedOne({ messageType: "notify.customer.sms_real", maxAttempts: 5 });
    const worker = new OutboxWorker({ repository, workerId: "worker-a", leaseMs: LEASE_MS });

    const result = await worker.runCycle(at(0));
    expect(result.dead).toBe(1);

    const row = repository.findById("msg-1");
    expect(row?.status).toBe("dead");
    // Murió al primer intento: un error permanente no consume 5 ciclos.
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain("sin handler registrado");
  });

  it("un `PermanentOutboxError` del handler va directo a `dead`", async () => {
    const repository = seedOne({ maxAttempts: 5 });
    const permanent: OutboxHandler = () => {
      throw new PermanentOutboxError("payload con esquema no soportado");
    };
    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      leaseMs: LEASE_MS,
      handlers: new Map([["notify.customer.authorization_prepared", permanent]]),
    });

    const result = await worker.runCycle(at(0));
    expect(result.dead).toBe(1);
    expect(repository.findById("msg-1")?.attempts).toBe(1);
  });
});

describe("outbox worker — fallo del worker no revierte el caso ya confirmado", () => {
  it("el caso autorizado queda intacto aunque el mensaje muera", async () => {
    // Estado de negocio ya confirmado, ajeno al worker. Representa lo que
    // R0-D dejó cerrado: un caso con su autorización registrada.
    const businessState = {
      cases: [
        { id: "case-1", organizationId: ORG_A, status: "authorized", folioCode: "2026-00002" },
      ],
      authorizations: [
        {
          id: "auth-1",
          organizationId: ORG_A,
          caseId: "case-1",
          status: "accepted",
          decidedAt: T0,
        },
      ],
      quoteVersions: [
        { id: "qv-1", organizationId: ORG_A, status: "frozen", snapshotHash: "abc123" },
      ],
    };
    const before = JSON.parse(JSON.stringify(businessState));

    const repository = seedOne({ maxAttempts: 1 });
    const alwaysFails: OutboxHandler = () => {
      throw new Error("el proveedor de notificación no respondió");
    };
    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      leaseMs: LEASE_MS,
      handlers: new Map([["notify.customer.authorization_prepared", alwaysFails]]),
    });

    const result = await worker.runCycle(at(0));
    expect(result.dead).toBe(1);
    expect(repository.findById("msg-1")?.status).toBe("dead");

    // El estado de negocio es idéntico byte a byte.
    expect(businessState).toEqual(before);
    expect(businessState.cases[0]?.status).toBe("authorized");
    expect(businessState.authorizations[0]?.status).toBe("accepted");
    expect(businessState.quoteVersions[0]?.snapshotHash).toBe("abc123");
  });

  it("la superficie de escritura del worker es solo `outbox_messages`", async () => {
    // Prueba estructural del argumento anterior: se registra CADA método
    // del repositorio que el worker invoca durante un fallo total. Si una
    // fase futura le diera al worker un repositorio de casos, este test
    // empezaría a ver un método ajeno a la lista y fallaría.
    const repository = seedOne({ maxAttempts: 1 });
    const touched: string[] = [];
    const spy = new Proxy(repository, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function" && typeof prop === "string") {
          return (...args: unknown[]) => {
            touched.push(prop);
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return value;
      },
    });

    const worker = new OutboxWorker({
      repository: spy,
      workerId: "worker-a",
      leaseMs: LEASE_MS,
      handlers: new Map([
        [
          "notify.customer.authorization_prepared",
          () => {
            throw new Error("boom");
          },
        ],
      ]),
    });
    await worker.runCycle(at(0));

    // Solo métodos del contrato de outbox, ninguno de negocio.
    const allowed = new Set([
      "claimBatch",
      "markSent",
      "markFailedWithRetry",
      "markDead",
      "health",
    ]);
    for (const method of touched) {
      expect(allowed.has(method)).toBe(true);
    }
    expect(touched).toContain("claimBatch");
    expect(touched).toContain("markDead");
  });
});

describe("outbox worker — backoff y next_attempt_at", () => {
  it("el backoff crece exponencialmente y respeta el techo", () => {
    expect(computeBackoffDelayMs(1, DEFAULT_BACKOFF)).toBe(30_000);
    expect(computeBackoffDelayMs(2, DEFAULT_BACKOFF)).toBe(60_000);
    expect(computeBackoffDelayMs(3, DEFAULT_BACKOFF)).toBe(120_000);
    // Techo de 15 min.
    expect(computeBackoffDelayMs(20, DEFAULT_BACKOFF)).toBe(15 * 60_000);
    expect(computeBackoffDelayMs(1000, DEFAULT_BACKOFF)).toBe(15 * 60_000);
  });

  it("un fallo escribe `next_attempt_at` en el futuro y libera el lease", async () => {
    const repository = seedOne({ maxAttempts: 5 });
    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      leaseMs: LEASE_MS,
      handlers: new Map([
        [
          "notify.customer.authorization_prepared",
          () => {
            throw new Error("transitorio");
          },
        ],
      ]),
    });

    await worker.runCycle(at(0));
    const row = repository.findById("msg-1");
    expect(row?.status).toBe("pending");
    expect(row?.lockedAt).toBeNull();
    expect(row?.lockedBy).toBeNull();
    expect(Date.parse(row?.nextAttemptAt ?? T0)).toBe(at(0).getTime() + 30_000);
  });
});

describe("outbox worker — heartbeat y health", () => {
  it("un worker sin ciclos declara `unknown`, nunca `healthy`", async () => {
    const repository = seedOne();
    const worker = new OutboxWorker({ repository, workerId: "worker-a" });

    const health = await worker.health(at(0));
    expect(health.status).toBe("unknown");
    expect(health.lastHeartbeatAt).toBeNull();
    expect(health.cyclesRun).toBe(0);
  });

  it("tras un ciclo late y reporta lag de outbox", async () => {
    const repository = new InMemoryOutboxRepository({
      messages: [
        buildOutboxMessage({ id: "m1", idempotencyKey: "k1" }),
        // Un mensaje que aún no toca procesar: es el lag pendiente.
        buildOutboxMessage({
          id: "m2",
          idempotencyKey: "k2",
          nextAttemptAt: new Date(Date.parse(T0) + 3_600_000).toISOString(),
        }),
      ],
      domainEvents: [buildDomainEvent()],
    });
    const worker = new OutboxWorker({ repository, workerId: "worker-a" });

    await worker.runCycle(at(60_000));
    const health = await worker.health(at(60_000));

    expect(health.status).toBe("healthy");
    expect(health.lastHeartbeatAt).toBe(at(60_000).toISOString());
    expect(health.cyclesRun).toBe(1);
    expect(health.outbox.countsByStatus.sent).toBe(1);
    expect(health.outbox.countsByStatus.pending).toBe(1);
    expect(health.outbox.oldestPendingAgeSeconds).toBe(60);
    expect(health.outbox.deadCount).toBe(0);
  });

  it("health no expone payload, lastError ni locked_by", async () => {
    const repository = seedOne();
    const worker = new OutboxWorker({ repository, workerId: "worker-a" });
    await worker.runCycle(at(0));
    const health = await worker.health(at(0));

    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain("cust-1");
    expect(serialized).not.toContain("lastError");
    expect(serialized).not.toContain("lockedBy");
    expect(serialized).not.toContain("payload");
  });
});

describe("outbox worker — correlation/causation y aislamiento por tenant", () => {
  it("propaga correlation/causation del domain event al efecto y al log", async () => {
    const repository = new InMemoryOutboxRepository({
      messages: [buildOutboxMessage({ domainEventId: "evt-9" })],
      domainEvents: [
        buildDomainEvent({ id: "evt-9", correlationId: "corr-9", causationId: "cause-9" }),
      ],
    });
    const logs: WorkerLogEntry[] = [];
    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      logger: (e) => logs.push(e),
    });

    await worker.runCycle(at(0));

    const notification = worker.notificationLog.all()[0];
    expect(notification?.correlationId).toBe("corr-9");
    expect(notification?.causationId).toBe("cause-9");

    const success = logs.find((l) => l.event === "outbox.message.succeeded");
    expect(success?.correlationId).toBe("corr-9");
    expect(success?.causationId).toBe("cause-9");
    expect(success?.app).toBe("worker");
    expect(success?.organizationId).toBe(ORG_A);
  });

  it("el log estructurado nunca incluye el payload del mensaje", async () => {
    const repository = new InMemoryOutboxRepository({
      messages: [
        buildOutboxMessage({
          payload: { audienceCustomerId: "cust-1", telefono: "50255551234" },
        }),
      ],
      domainEvents: [buildDomainEvent()],
    });
    const logs: WorkerLogEntry[] = [];
    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      logger: (e) => logs.push(e),
    });

    await worker.runCycle(at(0));
    expect(JSON.stringify(logs)).not.toContain("50255551234");
  });

  it("una actualización no cruza de organización aunque el id coincida", async () => {
    const repository = new InMemoryOutboxRepository({
      messages: [buildOutboxMessage({ id: "shared-id", organizationId: ORG_B })],
      domainEvents: [buildDomainEvent()],
    });

    // Intento de marcar `sent` con la organización equivocada: no aplica.
    await repository.markSent({ id: "shared-id", organizationId: ORG_A, now: at(0) });
    expect(repository.findById("shared-id")?.status).toBe("pending");

    // Con la organización correcta sí aplica.
    await repository.markSent({ id: "shared-id", organizationId: ORG_B, now: at(0) });
    expect(repository.findById("shared-id")?.status).toBe("sent");
  });
});

describe("outbox worker — handlers permitidos en R0", () => {
  it("solo hay tres tipos registrados y ninguno despacha nada real", () => {
    const handlers = buildDefaultHandlers();
    expect([...handlers.keys()].sort()).toEqual([
      "maintenance.uploads.cleanup_orphaned",
      "notify.customer.authorization_prepared",
      "notify.customer.authorization_reissued",
    ]);
  });

  it("el cleanup de uploads huérfanos registra los vencidos sin borrarlos", async () => {
    const uploadIntents = [
      { id: "up-1", organizationId: ORG_A, status: "pending", expiresAt: T0 },
      {
        id: "up-2",
        organizationId: ORG_A,
        status: "pending",
        expiresAt: new Date(Date.parse(T0) + 3_600_000).toISOString(),
      },
      { id: "up-3", organizationId: ORG_A, status: "confirmed", expiresAt: T0 },
      { id: "up-4", organizationId: ORG_B, status: "pending", expiresAt: T0 },
    ];
    const repository = seedOne({ messageType: MESSAGE_TYPE_CLEANUP_ORPHANED_UPLOADS });
    const worker = new OutboxWorker({
      repository,
      workerId: "worker-a",
      readOnlyUploadIntents: uploadIntents,
    });

    await worker.runCycle(at(1_000));

    const record = worker.cleanupLog.all()[0];
    // Solo el vencido, pendiente y de ESTA organización.
    expect(record?.uploadIntentIds).toEqual(["up-1"]);
    // La lista original no se tocó: el cleanup registra, no borra.
    expect(uploadIntents.length).toBe(4);
    expect(uploadIntents[0]?.status).toBe("pending");
  });

  it("el registro de notificación nunca guarda email ni teléfono", async () => {
    const repository = new InMemoryOutboxRepository({
      messages: [
        buildOutboxMessage({
          payload: {
            audienceCustomerId: "cust-1",
            email: "cliente@ejemplo.com",
            telefono: "50255551234",
          },
        }),
      ],
      domainEvents: [buildDomainEvent()],
    });
    const worker = new OutboxWorker({ repository, workerId: "worker-a" });
    await worker.runCycle(at(0));

    const serialized = JSON.stringify(worker.notificationLog.all());
    expect(serialized).not.toContain("cliente@ejemplo.com");
    expect(serialized).not.toContain("50255551234");
    // Solo la referencia opaca.
    expect(worker.notificationLog.all()[0]?.audienceRef).toBe("cust-1");
    expect(worker.notificationLog.all()[0]?.channel).toBe("simulado_local");
  });
});
