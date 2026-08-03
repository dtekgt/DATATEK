// Health de Control — DATATEK_R0_E sección 13.
//
// Gemelo del de Pro/Pass (apps/web/src/app/api/health/route.ts); ver ahí el
// razonamiento completo. Control se despliega y se opera por separado, así
// que responde por sí mismo: ninguna de las dos apps inventa un estado para
// la otra.
//
// Nota de superficie: este endpoint es público y sin sesión, igual que el de
// web. No revela nada que Control no revele ya por existir — no dice qué
// organizaciones hay, ni cuántas, ni quién tiene acceso.
import { buildHealthReport, healthHttpStatus } from "@datatek/application";
import { buildNoStoreHeaders } from "@datatek/config/security-headers.mjs";
import { getControlEnv } from "../../../lib/env";

export const dynamic = "force-dynamic";

const PRODUCT_VERSION = "0.1.0";
const ROADMAP_RELEASE = "r0-e";

export function GET() {
  const report = buildHealthReport({
    self: "control",
    version: PRODUCT_VERSION,
    release: ROADMAP_RELEASE,
    environment: getControlEnv().NEXT_PUBLIC_CONTROL_APP_ENV,
    now: new Date(),
  });

  return Response.json(report, {
    status: healthHttpStatus(report.status),
    headers: Object.fromEntries(buildNoStoreHeaders().map((h) => [h.key, h.value])),
  });
}
