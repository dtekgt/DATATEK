// Health de Pro/Pass — DATATEK_R0_E sección 13.
//
// Público y sin autenticación a propósito: un balanceador o un uptime check
// no tiene credenciales. Por eso todo lo que sale de aquí pasa por
// `buildHealthReport`, cuyo `detail` es un enum cerrado traducido a frases
// fijas — nunca un `error.message`, que en este proyecto habría filtrado
// rutas de Windows o el host de una cadena de conexión (sección 13: "No
// exponer configuración o detalles internos en endpoint público").
//
// Las tres señales de infraestructura salen en `unknown` porque en este
// entorno NO son medibles: no hay Postgres alcanzable y el worker corre en
// otro proceso sin canal de latido compartido. `rollUpHealth` garantiza que
// eso NUNCA se reporte como `healthy` (NO-GO de la sección 18). El endpoint
// devuelve 200 igualmente: la app sí está sirviendo, y sacarla del balanceo
// por no poder medir sus dependencias sería la reacción equivocada.
import { buildHealthReport, healthHttpStatus } from "@datatek/application";
import { buildNoStoreHeaders } from "@datatek/config/security-headers.mjs";
import { getWebEnv } from "../../../lib/env";

// El estado de salud es de este instante; una respuesta cacheada es una
// respuesta falsa.
export const dynamic = "force-dynamic";

/** Versión del PRODUCTO, no inventario de dependencias. Se fija aquí en vez
 * de leer package.json en runtime: leerlo obligaría a resolver una ruta del
 * filesystem dentro del bundle, que es justo lo que no queremos exponer. */
const PRODUCT_VERSION = "0.1.0";
const ROADMAP_RELEASE = "r0-e";

export function GET() {
  const report = buildHealthReport({
    self: "web",
    version: PRODUCT_VERSION,
    release: ROADMAP_RELEASE,
    // `NEXT_PUBLIC_APP_ENV` ya está validado contra un enum cerrado
    // (env.ts), así que no puede filtrar un valor arbitrario.
    environment: getWebEnv().NEXT_PUBLIC_APP_ENV,
    now: new Date(),
  });

  return Response.json(report, {
    status: healthHttpStatus(report.status),
    headers: Object.fromEntries(buildNoStoreHeaders().map((h) => [h.key, h.value])),
  });
}
