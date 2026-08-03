// Métricas R0 — DATATEK_R0_E sección 13 ("Métricas R0").
//
// La sección enumera cinco: duración/error por comando; jobs pendientes/
// fallidos; intentos de autorización; fallos de RLS; E2E/build. Y cierra
// con:
//
//   "No mostrar métricas de negocio inventadas al usuario."
//
// =========================================================================
// 1. ESTO ES INSTRUMENTACIÓN OPERATIVA, NO UN DASHBOARD PARA EL TALLER
// =========================================================================
//
// Ninguna de estas series se renderiza en Pro, Pass, Market ni en ninguna
// pantalla de cliente. No hay componente de UI que las consuma y no se
// agrega ninguno en esta fase. Un "casos atendidos este mes" o un "tiempo
// promedio de autorización" pintado en Pro sería exactamente la métrica de
// negocio inventada que la sección prohíbe: en R0 no existe ejecución real
// que respalde ese número. La ruta `pro.reports` sigue en `planned` por esa
// misma razón y esta fase NO la activa.
//
// El único consumidor previsto es un endpoint interno/operativo y las
// líneas de log estructuradas de `logger.ts`.
//
// =========================================================================
// 2. LÍMITE HONESTO: ESTE REGISTRO ES EN PROCESO
// =========================================================================
//
// Los contadores viven en un `Map` dentro de UN proceso Node — la misma
// limitación, y por la misma razón, que `InMemoryRateLimiter`
// (`apps/web/src/lib/rate-limit.ts`, R0-E Fase 2). Por lo tanto:
//
//   - se reinician con el proceso;
//   - N instancias producen N series parciales que nadie suma;
//   - no sobreviven a un despliegue.
//
// No es un backend de métricas y no debe declararse como tal. Producción
// necesita un colector externo (OpenTelemetry/Prometheus o equivalente)
// detrás de `MetricsSink`. Ese cambio no toca los nombres de serie: son
// datos.
//
// =========================================================================
// 3. LAS DOS MÉTRICAS QUE ESTE ENTORNO NO PUEDE MEDIR — Y NO SE FINGEN
// =========================================================================
//
// **"fallos de RLS"**: RLS es una política de Postgres. Sin Postgres
// alcanzable no ocurre ni un solo fallo de RLS real, así que un contador
// `rls.denials` en 0 sería una mentira por omisión: leería como "cero
// violaciones de aislamiento" cuando la verdad es "cero mediciones". Lo que
// SÍ existe y sí se cuenta es la denegación a nivel de APLICACIÓN
// (`requirePermission` en commands/context.ts: FORBIDDEN,
// MEMBERSHIP_INACTIVE, BRANCH_DENIED) — que es una defensa distinta y
// anterior, no un sustituto. Por eso la serie se llama `access.denied` y
// NO `rls.denials`, y `describeMetricCoverage()` lo declara.
//
// **"E2E/build"**: no son series de runtime; son resultados de CI. No se
// inventa un contador que nadie incrementa. El reporte de build real queda
// archivado como artefacto versionado (`docs/perf/build-report-r0e.md`,
// sección 12) y los E2E son alcance de la Fase 4.

/** Series estables. Cambiar un literal rompe la continuidad histórica, así
 * que viven en un solo lugar. */
export const METRIC_NAMES = {
  /** Duración de un comando, en ms, etiquetada por comando y resultado. */
  commandDuration: "command.duration_ms",
  /** Errores por comando, etiquetados por código estable. */
  commandErrors: "command.errors",
  /** Denegaciones de acceso a nivel de aplicación. NO es `rls.denials` —
   * ver la nota 3 de la cabecera. */
  accessDenied: "access.denied",
  /** Intentos de autorización por enlace, etiquetados por desenlace. */
  authorizationAttempts: "authorization.attempts",
  /** Jobs de outbox por estado. Lo publica el worker; la app no lo puede
   * observar (ver health.ts). */
  outboxJobs: "outbox.jobs",
} as const;

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];

/** Etiquetas: primitivas y de cardinalidad acotada. Nunca un id de fila, un
 * actor ni un tenant — una serie por organización convertiría el endpoint
 * de métricas en un índice de qué tenants existen y cuánto trabajan, que es
 * justo el "detalle interno" que la sección 13 prohíbe exponer. */
export type MetricLabels = Record<string, string>;

export interface CounterSample {
  name: MetricName;
  labels: MetricLabels;
  value: number;
}

export interface DurationSample {
  name: MetricName;
  labels: MetricLabels;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

export interface MetricsSnapshot {
  counters: CounterSample[];
  durations: DurationSample[];
}

function labelKey(name: string, labels: MetricLabels): string {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`);
  return `${name}|${parts.join(",")}`;
}

export interface MetricsRegistry {
  increment(name: MetricName, labels?: MetricLabels, by?: number): void;
  observeDuration(name: MetricName, durationMs: number, labels?: MetricLabels): void;
  snapshot(): MetricsSnapshot;
  reset(): void;
}

export function createMetricsRegistry(): MetricsRegistry {
  const counters = new Map<string, CounterSample>();
  const durations = new Map<string, DurationSample>();

  return {
    increment(name, labels = {}, by = 1) {
      const key = labelKey(name, labels);
      const existing = counters.get(key);
      if (existing) existing.value += by;
      else counters.set(key, { name, labels, value: by });
    },
    observeDuration(name, durationMs, labels = {}) {
      const key = labelKey(name, labels);
      const existing = durations.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalMs += durationMs;
        existing.minMs = Math.min(existing.minMs, durationMs);
        existing.maxMs = Math.max(existing.maxMs, durationMs);
        return;
      }
      durations.set(key, {
        name,
        labels,
        count: 1,
        totalMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
      });
    },
    snapshot() {
      return {
        counters: [...counters.values()].map((c) => ({ ...c, labels: { ...c.labels } })),
        durations: [...durations.values()].map((d) => ({ ...d, labels: { ...d.labels } })),
      };
    },
    reset() {
      counters.clear();
      durations.clear();
    },
  };
}

/** Estado de cobertura por métrica de la sección 13. Se expone para que un
 * reporte —o un endpoint operativo— pueda decir qué se mide de verdad y qué
 * no, en vez de mostrar cinco series de las cuales dos son ficción. */
export type MetricCoverageState = "measured_in_process" | "not_measurable_here" | "ci_artifact";

export interface MetricCoverage {
  requirement: string;
  state: MetricCoverageState;
  series: MetricName | null;
  note: string;
}

export function describeMetricCoverage(): MetricCoverage[] {
  return [
    {
      requirement: "duración/error por comando",
      state: "measured_in_process",
      series: METRIC_NAMES.commandDuration,
      note: "Instrumentado en el motor de comandos; duración y código de error por comando.",
    },
    {
      requirement: "jobs pendientes/fallidos",
      state: "not_measurable_here",
      series: METRIC_NAMES.outboxJobs,
      note: "El worker corre en otro proceso y su outbox es en memoria; la app no puede observarlo. La función SQL datatek_platform.outbox_health (0090) es la fuente real, aún no ejecutada.",
    },
    {
      requirement: "intentos de autorización",
      state: "measured_in_process",
      series: METRIC_NAMES.authorizationAttempts,
      note: "Contado por desenlace del comando de autorización, sin token ni id de caso en las etiquetas.",
    },
    {
      requirement: "fallos de RLS",
      state: "not_measurable_here",
      series: METRIC_NAMES.accessDenied,
      note: "Sin Postgres no ocurre ningún fallo de RLS real. Se cuenta la denegación de permiso a nivel de aplicación, que es una defensa distinta y anterior, nunca un sustituto.",
    },
    {
      requirement: "E2E/build",
      state: "ci_artifact",
      series: null,
      note: "No son series de runtime. El reporte de build queda archivado en docs/perf/build-report-r0e.md; los E2E son alcance de la Fase 4.",
    },
  ];
}
