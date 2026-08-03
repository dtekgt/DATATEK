// Health — DATATEK_R0_E sección 13 ("Health").
//
// La sección pide seis señales: web, control, worker, database, outbox lag,
// build/version. Y cierra con una regla dura:
//
//   "No exponer configuración o detalles internos en endpoint público."
//
// Y la sección 18 (NO-GO) agrega la que gobierna todo este archivo:
//
//   "`unknown` se presenta como saludable"  -> R0 NO se declara terminado.
//
// =========================================================================
// 1. `unknown` NO ES `healthy`, Y ESO SE IMPONE POR CONSTRUCCIÓN
// =========================================================================
//
// Este entorno no tiene Postgres alcanzable (sin Docker ni Supabase CLI) y
// el worker de outbox corre en OTRO proceso, sin canal compartido con la
// app. Un health endpoint honesto tiene entonces que decir "no sé" de tres
// señales de seis. La tentación clásica —y el NO-GO exacto de la sección
// 18— es que ese "no sé" se pinte de verde porque "no hubo error".
//
// `rollUpHealth` lo impide: una sola comprobación en `unknown` topa el
// resultado global en `degraded`. No existe combinación de entradas que
// devuelva `healthy` con un `unknown` presente. Un test lo fija.
//
// =========================================================================
// 2. QUÉ SE PUEDE DECIR EN UN ENDPOINT PÚBLICO
// =========================================================================
//
// `detail` NO es un campo de texto libre. Es un enum cerrado
// (`HealthDetailCode`) traducido a una frase fija. Esto no es cosmética: un
// `detail: err.message` habría filtrado, en este proyecto concreto, rutas
// del filesystem de Windows, el puerto y host de una cadena de conexión, o
// la versión de una dependencia — los tres ejemplos que el brief de la
// Fase 3 nombra como "hallazgo de seguridad, no feature".
//
// Lo que este módulo NUNCA emite, y un test verifica sobre el JSON
// serializado: versiones de dependencias (Node, Next, pnpm), rutas del
// filesystem, host/puerto/usuario de base de datos, nombres de variables de
// entorno o sus valores, nombres de tenants, conteos por organización.
//
// `version` es la versión del PRODUCTO (package.json del monorepo) más el
// release del roadmap. Eso es "build/version" en el sentido de la sección
// 13: identifica qué está desplegado. No es un inventario de dependencias.

/** Vocabulario de estados. El orden es documental (severidad creciente);
 * `rollUpHealth` NO lo indexa — decide con comprobaciones explícitas, para
 * que la regla "`unknown` jamás produce `healthy`" se lea en el código y no
 * dependa de la posición de un elemento en este arreglo. */
export const HEALTH_STATUSES = ["healthy", "degraded", "unknown", "unhealthy"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

/** Las seis señales de la sección 13. */
export type HealthComponent =
  "web" | "control" | "worker" | "database" | "outbox_lag" | "build_version";

/** Vocabulario CERRADO de explicaciones. Agregar un caso obliga a escribir
 * su frase aquí, a la vista de una revisión — no se puede colar un
 * `error.message` por accidente. */
export type HealthDetailCode =
  | "serving"
  | "no_postgres_in_environment"
  | "no_shared_heartbeat_channel"
  | "depends_on_database"
  | "build_metadata_present"
  | "not_evaluated";

const DETAIL_TEXT: Record<HealthDetailCode, string> = {
  serving: "El proceso respondió esta petición.",
  no_postgres_in_environment:
    "No hay una base de datos alcanzable en este entorno, así que no se puede afirmar nada sobre su estado.",
  no_shared_heartbeat_channel:
    "El worker corre en otro proceso y no publica su latido en un canal que esta app pueda leer.",
  depends_on_database:
    "Esta señal se calcula en la base de datos; sin base alcanzable no hay medición.",
  build_metadata_present: "La versión y el release del build están declarados.",
  not_evaluated: "No se evaluó en esta ejecución.",
};

export interface HealthCheck {
  component: HealthComponent;
  status: HealthStatus;
  detailCode: HealthDetailCode;
  /** Frase fija derivada de `detailCode`. Nunca texto de un error real. */
  detail: string;
}

export interface HealthReport {
  status: HealthStatus;
  /** Versión del producto — no de sus dependencias. */
  version: string;
  /** Release del roadmap al que corresponde este build. */
  release: string;
  environment: string;
  generatedAt: string;
  checks: HealthCheck[];
}

export function buildHealthCheck(
  component: HealthComponent,
  status: HealthStatus,
  detailCode: HealthDetailCode,
): HealthCheck {
  return { component, status, detailCode, detail: DETAIL_TEXT[detailCode] };
}

/**
 * Combina las comprobaciones en un estado global.
 *
 * Regla que existe por el NO-GO de la sección 18: **`unknown` nunca produce
 * `healthy`**. La severidad es healthy < degraded < unknown < unhealthy, y
 * el resultado es el máximo... salvo que `unknown` se REPORTA como
 * `degraded` a nivel global, no como `unknown`, porque a nivel global sí se
 * sabe algo: se sabe que hay señales sin medir. Decir "el sistema está en
 * estado desconocido" cuando la app sí está respondiendo sería tan
 * impreciso como decir que está sano.
 *
 * Sin comprobaciones -> `unknown`. Un reporte vacío no es un reporte sano.
 */
export function rollUpHealth(checks: HealthCheck[]): HealthStatus {
  if (checks.length === 0) return "unknown";
  if (checks.some((c) => c.status === "unhealthy")) return "unhealthy";
  if (checks.some((c) => c.status === "unknown" || c.status === "degraded")) return "degraded";
  return "healthy";
}

/** 200 para healthy/degraded, 503 para unhealthy/unknown. Un balanceador
 * debe seguir mandando tráfico a una app que responde con dependencias sin
 * medir; no debe mandarlo a una que se declara caída o que no sabe nada de
 * sí misma. */
export function healthHttpStatus(status: HealthStatus): 200 | 503 {
  return status === "healthy" || status === "degraded" ? 200 : 503;
}

export interface BuildHealthReportOptions {
  /** `"web"` o `"control"`: cuál de las dos apps responde. */
  self: Extract<HealthComponent, "web" | "control">;
  version: string;
  release: string;
  environment: string;
  now: Date;
  /**
   * Estado del acceso a base de datos. En R0 este entorno NO tiene Postgres
   * alcanzable, así que el único valor honesto es `unknown`. El parámetro
   * existe para que la fase con Docker pase una medición real sin reescribir
   * este módulo — no para que alguien pueda pasar `healthy` sin haber
   * medido.
   */
  database?: HealthStatus;
  /**
   * Estado del worker visto desde ESTA app. Sin canal de latido compartido
   * (el worker escribe su health en su propio stdout, no en una tabla que la
   * app lea), el valor honesto es `unknown`.
   */
  worker?: HealthStatus;
  /** Retraso del outbox. Se calcula en la base — sin base, `unknown`. */
  outboxLag?: HealthStatus;
}

/**
 * Construye el reporte de las seis señales de la sección 13.
 *
 * Las tres señales dependientes de infraestructura (`database`, `worker`,
 * `outbox_lag`) tienen `unknown` como valor por defecto A PROPÓSITO: en este
 * entorno no hay forma de medirlas, y un default optimista sería exactamente
 * el NO-GO. Quien las pueda medir de verdad las pasa explícitamente.
 */
export function buildHealthReport(options: BuildHealthReportOptions): HealthReport {
  const database = options.database ?? "unknown";
  const worker = options.worker ?? "unknown";
  const outboxLag = options.outboxLag ?? "unknown";

  const checks: HealthCheck[] = [
    // La app que responde: si esta línea se ejecuta, el proceso está sirviendo.
    buildHealthCheck(options.self, "healthy", "serving"),
    // La otra app se despliega y se opera por separado; esta no puede
    // hablar por ella. Se omite en vez de inventarle un estado.
    buildHealthCheck(
      "worker",
      worker,
      worker === "unknown" ? "no_shared_heartbeat_channel" : "serving",
    ),
    buildHealthCheck(
      "database",
      database,
      database === "unknown" ? "no_postgres_in_environment" : "serving",
    ),
    buildHealthCheck(
      "outbox_lag",
      outboxLag,
      outboxLag === "unknown" ? "depends_on_database" : "serving",
    ),
    buildHealthCheck("build_version", "healthy", "build_metadata_present"),
  ];

  return {
    status: rollUpHealth(checks),
    version: options.version,
    release: options.release,
    environment: options.environment,
    generatedAt: options.now.toISOString(),
    checks,
  };
}
