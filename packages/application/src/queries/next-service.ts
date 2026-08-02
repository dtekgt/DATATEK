// `getNextService` — DATATEK_R0_D sección 3.1.
//
// Unlike the other seven queries, this one legitimately returns `null` for
// a vehicle that has zero `maintenance_recommendations` yet (e.g. before any
// inspection ran) — DATATEK_R0_A sección 4.15 literal: "unknown no inventa
// vencimiento". Fabricating a placeholder recommendation to satisfy a
// non-nullable return type would be exactly that invented vencimiento; `null`
// is the honest answer to "what's next" when nothing has been recommended
// yet.
import type { MaintenanceBasisKind, MaintenanceStatus } from "@datatek/domain";
import type { CrmVehicleState, MaintenanceRecommendationRow } from "../commands/state.ts";
import type { NextServiceViewModel } from "../viewmodels/experience.ts";
import type { QueryContext } from "./types.ts";

// Lower rank = more urgent = surfaces first.
const STATUS_RANK: Record<MaintenanceStatus, number> = {
  overdue: 0,
  due: 1,
  due_soon: 2,
  upcoming: 3,
  unknown: 4,
};

const BASIS_LABELS: Record<MaintenanceBasisKind, string> = {
  manufacturer: "Recomendación del fabricante",
  inspection: "Hallazgo de inspección",
  service_history: "Historial de servicio",
  technician: "Criterio del técnico",
};

function dueTimestamp(rec: MaintenanceRecommendationRow): number | null {
  if (rec.dueAt) return new Date(rec.dueAt).getTime();
  // No date component (pure `odometer` trigger) sorts after any dated
  // recommendation at the same urgency rank — a km-only due point cannot
  // be compared to a calendar date without assuming a driving rate this
  // query has no evidence for.
  return null;
}

function describeRecommendation(state: CrmVehicleState, rec: MaintenanceRecommendationRow): string {
  if (rec.findingId) {
    const finding = state.findings.find((f) => f.id === rec.findingId);
    if (finding) return finding.description;
  }
  return "Próximo servicio recomendado";
}

export function getNextService(
  state: CrmVehicleState,
  ctx: QueryContext,
  vehicleId: string,
): NextServiceViewModel | null {
  const candidates = state.maintenanceRecommendations.filter(
    (r) => r.vehicleId === vehicleId && r.organizationId === ctx.organizationId,
  );
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    const aDue = dueTimestamp(a);
    const bDue = dueTimestamp(b);
    if (aDue == null && bDue == null) return 0;
    if (aDue == null) return 1;
    if (bDue == null) return -1;
    return aDue - bDue;
  });
  const next = sorted[0]!;

  return {
    demo: false,
    vehicleId,
    label: describeRecommendation(state, next),
    triggerKind: next.triggerKind,
    dueDate: next.dueAt,
    dueOdometerKm: next.dueOdometerKm,
    condition: next.triggerKind === "condition" ? next.customerExplanation : null,
    basis: BASIS_LABELS[next.basisKind],
  };
}
