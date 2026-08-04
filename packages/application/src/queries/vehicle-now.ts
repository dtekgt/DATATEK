// `getVehicleNow` — DATATEK_R0_D sección 3.1 + sección 9 "Derivación de
// VehicleNow", literal:
//
//   "Prioridad: 1. decisión crítica vigente; 2. finding customer-visible
//   vigente; 3. inspección reciente sin alertas dentro de su alcance;
//   4. dato vencido; 5. unknown."
//
// `deriveVehicleNowFact` is exported separately from `getVehicleNow` so
// `getPassHome` (one fact per vehicle in the customer's garage) can reuse
// the exact same derivation instead of duplicating the priority ladder.
import type { CrmVehicleState } from "../commands/state.ts";
import type { VehicleNowFact } from "../viewmodels/shared.ts";
import type { VehicleNowViewModel } from "../viewmodels/experience.ts";
import { formatGuatemalaDate, isVisibleToAudience } from "./shared.ts";
import type { QueryContext } from "./types.ts";

/** A completed brake inspection older than this is "dato vencido" (priority
 * 4) instead of "sin alertas" (priority 3) — R0-D sección 9 names the
 * priority order but not a numeric threshold, so this is a documented,
 * reasonable interpretation (roughly two brake-service intervals for
 * typical city driving), not a value pulled from the normative doc. */
const STALE_AFTER_DAYS = 180;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function formatEsGt(iso: string): string {
  return formatGuatemalaDate(iso, { day: "numeric", month: "long" });
}

export function deriveVehicleNowFact(
  state: CrmVehicleState,
  ctx: QueryContext,
  vehicleId: string,
): VehicleNowFact {
  const cases = state.cases.filter(
    (c) => c.vehicleId === vehicleId && c.organizationId === ctx.organizationId,
  );
  const caseIds = new Set(cases.map((c) => c.id));

  const visibleFindings = state.findings
    .filter((f) => caseIds.has(f.caseId) && isVisibleToAudience(f.visibility, ctx.audience))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  // Priority 1: decisión crítica vigente.
  const critical = visibleFindings.find((f) => f.urgency === "safety_critical");
  if (critical) {
    return {
      status: "action_required",
      headline: critical.description,
      detail: "Hallazgo crítico de la revisión de frenos — requiere tu decisión.",
      source: "Hallazgo crítico de frenos",
      observedAt: critical.occurredAt,
    };
  }

  // Priority 2: finding customer-visible vigente.
  const attention = visibleFindings.find(
    (f) => f.urgency === "urgent" || f.urgency === "attention",
  );
  if (attention) {
    return {
      status: "attention",
      headline: attention.description,
      detail: null,
      source: "Hallazgo de la revisión de frenos",
      observedAt: attention.occurredAt,
    };
  }

  // Priority 3/4: revisión reciente sin alertas, o dato vencido — ambas
  // dependen de la MISMA inspección completada más reciente, así que se
  // resuelven juntas.
  const latestCompleted = state.inspections
    .filter((i) => caseIds.has(i.caseId) && i.status === "completed" && i.completedAt != null)
    .sort(
      (a, b) =>
        new Date(b.completedAt as string).getTime() - new Date(a.completedAt as string).getTime(),
    )[0];

  if (latestCompleted?.completedAt) {
    const completedAt = new Date(latestCompleted.completedAt);
    const ageDays = daysBetween(ctx.now, completedAt);
    if (ageDays <= STALE_AFTER_DAYS) {
      return {
        // Ley 32 / `noFindingsIsNotHealthy`: this NEVER claims the vehicle
        // is healthy — only that this one scoped check found no alerts.
        status: "no_current_alerts",
        headline: "Sin alertas en la revisión de frenos",
        detail: `Basado en la revisión de frenos del ${formatEsGt(latestCompleted.completedAt)}.`,
        source: "Revisión de frenos",
        observedAt: latestCompleted.completedAt,
      };
    }
    return {
      status: "stale",
      headline: "La última revisión de frenos ya no es reciente",
      detail: `Última revisión: ${formatEsGt(latestCompleted.completedAt)}. Se recomienda una nueva revisión.`,
      source: "Revisión de frenos",
      observedAt: latestCompleted.completedAt,
    };
  }

  // Priority 5: unknown — never invents a status from missing data.
  return {
    status: "unknown",
    headline: "Sin información suficiente de frenos",
    detail: "Todavía no hay una revisión de frenos registrada para este vehículo.",
    source: "Sin datos",
    observedAt: null,
  };
}

export function getVehicleNow(
  state: CrmVehicleState,
  ctx: QueryContext,
  vehicleId: string,
): VehicleNowViewModel {
  const fact = deriveVehicleNowFact(state, ctx, vehicleId);
  return {
    demo: false,
    vehicleId,
    status: fact.status,
    headline: fact.headline,
    detail: fact.detail,
    source: fact.source,
    observedAt: fact.observedAt,
    noFindingsIsNotHealthy: true,
    globalHealthScore: null,
  };
}
