// Instrumentación del motor de comandos — DATATEK_R0_E sección 13.
//
// Dos propiedades cargan con el peso de este archivo:
//
//   1. TODO comando queda instrumentado, incluidos los que aún no existen.
//      El decorador recorre las claves del motor en runtime justamente para
//      que agregar un comando no exija acordarse de instrumentarlo; el test
//      de conteo convierte esa intención en algo que se rompe si deja de ser
//      cierto.
//
//   2. El `input` del comando NUNCA llega al log. Ese objeto lleva, según el
//      comando, el nombre de un cliente, su teléfono o el secreto de un
//      enlace de autorización. Es la vía más corta para que un log se
//      convierta en una fuga.
import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { buildTestContext } from "../commands/test-helpers.ts";
import { createCommandEngine } from "../commands/engine.ts";
import type { CommandEngine } from "../commands/engine.ts";
import { createLogger, memorySink } from "./logger.ts";
import { createMetricsRegistry, METRIC_NAMES } from "./metrics.ts";
import { instrumentCommandEngine } from "./command-observability.ts";

const NO_COMANDOS = ["getState", "reset"];

function armar(opciones: { durations?: number[] } = {}) {
  const sink = memorySink();
  const metrics = createMetricsRegistry();
  const logger = createLogger({ app: "web", environment: "test", sink });
  const cronometro = opciones.durations ? [...opciones.durations] : null;
  const engine = createCommandEngine();
  const instrumentado = instrumentCommandEngine(engine, {
    logger,
    metrics,
    monotonicNowMs: cronometro ? () => cronometro.shift() ?? 0 : undefined,
  });
  return { sink, metrics, engine, instrumentado };
}

const ctxDtek = (overrides = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

describe("instrumentCommandEngine — cobertura", () => {
  it("envuelve todos los métodos del motor salvo los que no son comandos", () => {
    const { engine, instrumentado } = armar();

    const clavesMotor = Object.keys(engine);
    const comandos = clavesMotor.filter(
      (k) =>
        !NO_COMANDOS.includes(k) &&
        typeof (engine as unknown as Record<string, unknown>)[k] === "function",
    );

    // La propiedad de verdad: cada comando del motor quedó SUSTITUIDO por
    // otra función. Si alguien agrega un comando nuevo, entra aquí solo.
    expect(comandos.length).toBeGreaterThan(20);
    for (const clave of comandos) {
      const original = (engine as unknown as Record<string, unknown>)[clave];
      const envuelto = (instrumentado as unknown as Record<string, unknown>)[clave];
      expect(typeof envuelto).toBe("function");
      expect(envuelto).not.toBe(original);
    }

    // Y la superficie no cambia: ni un método de más, ni uno de menos.
    expect(Object.keys(instrumentado).sort()).toEqual(clavesMotor.sort());
  });

  it("deja pasar `getState` y `reset` sin envolver", () => {
    const { engine, instrumentado } = armar();
    for (const clave of NO_COMANDOS) {
      expect((instrumentado as unknown as Record<string, unknown>)[clave]).toBe(
        (engine as unknown as Record<string, unknown>)[clave],
      );
    }
  });
});

describe("instrumentCommandEngine — la línea de log", () => {
  it("registra comando, resultado y duración de un comando exitoso", () => {
    const { sink, instrumentado } = armar({ durations: [1000, 1042] });

    const r = instrumentado.createProvisionalCustomer(ctxDtek(), {
      displayName: "Cliente Uno",
      source: "walk_in",
    });

    expect(r.ok).toBe(true);
    expect(sink.records).toHaveLength(1);
    const linea = sink.records[0]!;
    expect(linea.event).toBe("command.executed");
    expect(linea.command).toBe("createProvisionalCustomer");
    expect(linea.result).toBe("succeeded");
    expect(linea.durationMs).toBe(42);
    expect(linea.level).toBe("info");
  });

  it("lleva actor, organización y correlación — las referencias que permiten cruzar", () => {
    const { sink, instrumentado } = armar();
    instrumentado.createProvisionalCustomer(ctxDtek({ correlationId: "corr-abc" }), {
      displayName: "Cliente Dos",
      source: "walk_in",
    });

    const linea = sink.records[0]!;
    expect(linea.actorId).toBe(FIXTURE_ACTOR_IDS.advisorDtek);
    expect(linea.organizationId).toBe(FIXTURE_ORGANIZATION_IDS.dtek);
    expect(linea.correlationId).toBe("corr-abc");
  });

  it("NUNCA escribe el input: el nombre del cliente no aparece en el log", () => {
    const { sink, instrumentado } = armar();
    const NOMBRE = "Juan Perez Marroquin";

    instrumentado.createProvisionalCustomer(ctxDtek(), {
      displayName: NOMBRE,
      source: "walk_in",
    });

    const serializado = JSON.stringify(sink.records);
    expect(serializado).not.toContain(NOMBRE);
    expect(serializado).not.toContain("Juan");
    expect(serializado).not.toContain("displayName");
  });

  it("registra el código de error estable, no su texto", () => {
    const { sink, instrumentado } = armar();

    // Actor de OTRA organización: el motor debe denegar.
    const r = instrumentado.createProvisionalCustomer(
      buildTestContext({
        actorId: FIXTURE_ACTOR_IDS.advisorDtek,
        organizationId: FIXTURE_ORGANIZATION_IDS.demo,
      }),
      { displayName: "Cliente Tres", source: "walk_in" },
    );

    expect(r.ok).toBe(false);
    const linea = sink.records[0]!;
    expect(linea.result).toBe("denied");
    expect(typeof linea.errorCode).toBe("string");
    // El vocabulario cerrado de LogFields no tiene dónde poner un mensaje.
    expect(Object.keys(linea)).not.toContain("message");
  });
});

describe("instrumentCommandEngine — métricas", () => {
  it("observa la duración por comando y resultado", () => {
    const { metrics, instrumentado } = armar({ durations: [0, 12] });
    instrumentado.createProvisionalCustomer(ctxDtek(), {
      displayName: "Cliente Cuatro",
      source: "walk_in",
    });

    const d = metrics.snapshot().durations[0]!;
    expect(d.name).toBe(METRIC_NAMES.commandDuration);
    expect(d.labels["command"]).toBe("createProvisionalCustomer");
    expect(d.labels["result"]).toBe("succeeded");
    expect(d.totalMs).toBe(12);
  });

  it("cuenta la denegación de permiso como `access.denied`, no como fallo de RLS", () => {
    const { metrics, instrumentado } = armar();
    instrumentado.createProvisionalCustomer(
      buildTestContext({
        actorId: FIXTURE_ACTOR_IDS.advisorDtek,
        organizationId: FIXTURE_ORGANIZATION_IDS.demo,
      }),
      { displayName: "Cliente Cinco", source: "walk_in" },
    );

    const counters = metrics.snapshot().counters;
    expect(counters.some((c) => c.name === METRIC_NAMES.accessDenied)).toBe(true);
    expect(counters.some((c) => c.name === METRIC_NAMES.commandErrors)).toBe(true);
  });

  it("no etiqueta las series con el tenant ni con el actor", () => {
    // Una serie por organización convierte el endpoint de métricas en un
    // índice de qué tenants existen y cuánto trabajan.
    const { metrics, instrumentado } = armar();
    instrumentado.createProvisionalCustomer(ctxDtek(), {
      displayName: "Cliente Seis",
      source: "walk_in",
    });

    const serializado = JSON.stringify(metrics.snapshot());
    expect(serializado).not.toContain(FIXTURE_ORGANIZATION_IDS.dtek);
    expect(serializado).not.toContain(FIXTURE_ACTOR_IDS.advisorDtek);
  });

  it("no cuenta un comando cualquiera como intento de autorización", () => {
    const { metrics, instrumentado } = armar();
    instrumentado.createProvisionalCustomer(ctxDtek(), {
      displayName: "Cliente Siete",
      source: "walk_in",
    });
    expect(
      metrics.snapshot().counters.some((c) => c.name === METRIC_NAMES.authorizationAttempts),
    ).toBe(false);
  });
});

describe("instrumentCommandEngine — fallo no manejado", () => {
  it("vuelve a lanzar la excepción en vez de tragársela, y la registra como UNHANDLED", () => {
    const sink = memorySink();
    const metrics = createMetricsRegistry();
    const explota = {
      getState: () => ({}),
      reset: () => {},
      comandoQueExplota: () => {
        throw new Error("secreto-en-el-stack");
      },
    } as unknown as CommandEngine;

    const instrumentado = instrumentCommandEngine(explota, {
      logger: createLogger({ app: "web", environment: "test", sink }),
      metrics,
    }) as unknown as Record<string, (c: unknown, i: unknown) => unknown>;

    expect(() => instrumentado["comandoQueExplota"]!(ctxDtek(), {})).toThrow("secreto-en-el-stack");

    const linea = sink.records[0]!;
    expect(linea.event).toBe("command.unhandled");
    expect(linea.level).toBe("error");
    expect(linea.errorCode).toBe("UNHANDLED");
    // El texto del error y su stack no se serializan.
    expect(JSON.stringify(sink.records)).not.toContain("secreto-en-el-stack");
  });
});
