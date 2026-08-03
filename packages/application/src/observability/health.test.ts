// Health y métricas — DATATEK_R0_E sección 13, con la regla de la sección 18
// mandando sobre todo lo demás:
//
//   "`unknown` se presenta como saludable"  -> R0 NO se declara terminado.
//
// El primer bloque existe para que esa regla no dependa de que alguien la
// recuerde: no hay combinación de entradas con un `unknown` presente que
// devuelva `healthy`.
import { describe, it } from "node:test";
import { expect } from "expect";
import {
  buildHealthCheck,
  buildHealthReport,
  healthHttpStatus,
  rollUpHealth,
  HEALTH_STATUSES,
  type HealthCheck,
} from "./health.ts";
import { createMetricsRegistry, describeMetricCoverage, METRIC_NAMES } from "./metrics.ts";

const check = (status: HealthCheck["status"]): HealthCheck =>
  buildHealthCheck("database", status, "not_evaluated");

describe("rollUpHealth — `unknown` nunca es `healthy`", () => {
  it("ninguna combinación que contenga `unknown` devuelve healthy", () => {
    // Fuerza bruta sobre todas las parejas del vocabulario: si alguien
    // reescribe la función con un `Math.max` de índices, esto lo atrapa.
    for (const a of HEALTH_STATUSES) {
      for (const b of HEALTH_STATUSES) {
        const resultado = rollUpHealth([check(a), check(b)]);
        if (a === "unknown" || b === "unknown") {
          expect(resultado).not.toBe("healthy");
        }
      }
    }
  });

  it("un reporte sin comprobaciones es `unknown`, no `healthy`", () => {
    expect(rollUpHealth([])).toBe("unknown");
  });

  it("`unhealthy` gana sobre todo lo demás", () => {
    expect(rollUpHealth([check("healthy"), check("unknown"), check("unhealthy")])).toBe(
      "unhealthy",
    );
  });

  it("todo sano es sano", () => {
    expect(rollUpHealth([check("healthy"), check("healthy")])).toBe("healthy");
  });
});

describe("healthHttpStatus", () => {
  it("sigue recibiendo tráfico si responde, aunque tenga dependencias sin medir", () => {
    expect(healthHttpStatus("healthy")).toBe(200);
    expect(healthHttpStatus("degraded")).toBe(200);
  });

  it("deja de recibir tráfico si se declara caída o no sabe nada de sí misma", () => {
    expect(healthHttpStatus("unhealthy")).toBe(503);
    expect(healthHttpStatus("unknown")).toBe(503);
  });
});

describe("buildHealthReport", () => {
  const base = {
    self: "web" as const,
    version: "0.1.0",
    release: "r0-e",
    environment: "test",
    now: new Date("2026-08-03T00:00:00.000Z"),
  };

  it("por defecto declara `unknown` las tres señales de infraestructura", () => {
    const reporte = buildHealthReport(base);
    const porComponente = Object.fromEntries(reporte.checks.map((c) => [c.component, c.status]));

    expect(porComponente["database"]).toBe("unknown");
    expect(porComponente["worker"]).toBe("unknown");
    expect(porComponente["outbox_lag"]).toBe("unknown");
    // Y por lo tanto el global NO puede ser healthy.
    expect(reporte.status).toBe("degraded");
  });

  it("cubre las seis señales de la sección 13", () => {
    const reporte = buildHealthReport(base);
    expect(reporte.checks.map((c) => c.component).sort()).toEqual([
      "build_version",
      "database",
      "outbox_lag",
      "web",
      "worker",
    ]);
    expect(reporte.version).toBe("0.1.0");
    expect(reporte.release).toBe("r0-e");
  });

  it("acepta mediciones reales cuando quien llama sí puede medir", () => {
    const reporte = buildHealthReport({ ...base, database: "healthy", worker: "healthy" });
    const porComponente = Object.fromEntries(reporte.checks.map((c) => [c.component, c.status]));
    expect(porComponente["database"]).toBe("healthy");
    // outbox_lag sigue sin medirse -> el global sigue sin ser healthy.
    expect(reporte.status).toBe("degraded");
  });

  it("no filtra detalles internos en el JSON serializado", () => {
    // Sección 13: "No exponer configuración o detalles internos en endpoint
    // público." Se comprueba sobre el JSON, que es lo que de verdad sale.
    const serializado = JSON.stringify(buildHealthReport(base));

    expect(serializado).not.toMatch(/[A-Za-z]:\\\\/); // rutas de Windows
    expect(serializado).not.toContain("/home/");
    expect(serializado).not.toContain("node_modules");
    // Cadena de conexión, no la palabra: `no_postgres_in_environment` es un
    // código de detalle honesto y CONTIENE "postgres". Lo que no puede
    // aparecer es un DSN, un host o un puerto.
    expect(serializado).not.toMatch(/postgres(ql)?:\/\//);
    expect(serializado).not.toMatch(/@[\w.-]+:\d{2,5}/); // host:puerto
    expect(serializado).not.toContain("5432");
    expect(serializado).not.toContain("DATABASE_URL");
    expect(serializado).not.toContain("SUPABASE");
    expect(serializado).not.toContain(process.version); // versión de Node
  });
});

describe("métricas R0 — cobertura declarada", () => {
  it("no existe una serie `rls.denials`: sin Postgres no hay fallo de RLS que contar", () => {
    const series: string[] = Object.values(METRIC_NAMES);
    expect(series).not.toContain("rls.denials");
    expect(series).toContain("access.denied");
  });

  it("declara explícitamente qué requisito de la sección 13 no se mide aquí", () => {
    const cobertura = describeMetricCoverage();
    expect(cobertura).toHaveLength(5);

    const rls = cobertura.find((c) => c.requirement === "fallos de RLS");
    expect(rls?.state).toBe("not_measurable_here");

    const jobs = cobertura.find((c) => c.requirement === "jobs pendientes/fallidos");
    expect(jobs?.state).toBe("not_measurable_here");

    // Ninguna se declara medida sin serie que la respalde.
    for (const c of cobertura) {
      if (c.state === "measured_in_process") expect(c.series).not.toBeNull();
    }
  });
});

describe("createMetricsRegistry", () => {
  it("acumula contadores por combinación de etiquetas", () => {
    const m = createMetricsRegistry();
    m.increment(METRIC_NAMES.commandErrors, { command: "a", error_code: "CONFLICT" });
    m.increment(METRIC_NAMES.commandErrors, { command: "a", error_code: "CONFLICT" }, 2);
    m.increment(METRIC_NAMES.commandErrors, { command: "b", error_code: "CONFLICT" });

    const counters = m.snapshot().counters;
    expect(counters).toHaveLength(2);
    expect(counters.find((c) => c.labels["command"] === "a")?.value).toBe(3);
    expect(counters.find((c) => c.labels["command"] === "b")?.value).toBe(1);
  });

  it("el orden en que se escriben las etiquetas no crea una serie distinta", () => {
    const m = createMetricsRegistry();
    m.increment(METRIC_NAMES.accessDenied, { command: "x", error_code: "FORBIDDEN" });
    m.increment(METRIC_NAMES.accessDenied, { error_code: "FORBIDDEN", command: "x" });
    expect(m.snapshot().counters).toHaveLength(1);
    expect(m.snapshot().counters[0]?.value).toBe(2);
  });

  it("resume duraciones con conteo, total, mínimo y máximo", () => {
    const m = createMetricsRegistry();
    for (const ms of [10, 30, 20]) {
      m.observeDuration(METRIC_NAMES.commandDuration, ms, { command: "c", result: "succeeded" });
    }
    const d = m.snapshot().durations[0];
    expect(d?.count).toBe(3);
    expect(d?.totalMs).toBe(60);
    expect(d?.minMs).toBe(10);
    expect(d?.maxMs).toBe(30);
  });

  it("el snapshot es una copia: mutarlo no altera el registro", () => {
    const m = createMetricsRegistry();
    m.increment(METRIC_NAMES.commandErrors, { command: "a" });
    const primero = m.snapshot();
    primero.counters[0]!.value = 999;
    primero.counters[0]!.labels["command"] = "mutado";

    expect(m.snapshot().counters[0]?.value).toBe(1);
    expect(m.snapshot().counters[0]?.labels["command"]).toBe("a");
  });

  it("reset vacía el registro", () => {
    const m = createMetricsRegistry();
    m.increment(METRIC_NAMES.commandErrors, { command: "a" });
    m.observeDuration(METRIC_NAMES.commandDuration, 5, { command: "a" });
    m.reset();
    expect(m.snapshot().counters).toHaveLength(0);
    expect(m.snapshot().durations).toHaveLength(0);
  });
});
