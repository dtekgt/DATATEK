import type { CaseStatus } from "@datatek/domain";
import type { CaseBlocker, OperationalNextAction, StageRailStage } from "../viewmodels/shared";

export const DEMO_CASE_ID = "case-demo-brakes";
export const DEMO_CASE_CODE = "DTEK-2026-0142";

export const CASE_STAGE_ORDER: CaseStatus[] = [
  "new",
  "triage",
  "scheduled",
  "received",
  "inspection",
  "waiting_authorization",
  "in_progress",
  "quality",
  "ready_for_delivery",
  "delivered",
];

const STAGE_LABELS: Record<CaseStatus, string> = {
  new: "Nuevo",
  triage: "Triage",
  waiting_customer: "Esperando al cliente",
  scheduled: "Programado",
  received: "Recibido",
  inspection: "Inspección",
  waiting_authorization: "Esperando autorización",
  ready: "Listo",
  in_progress: "En proceso",
  blocked: "Bloqueado",
  quality: "Control de calidad",
  ready_for_delivery: "Listo para entrega",
  delivered: "Entregado",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export function friendlyCaseStatus(status: CaseStatus): string {
  return STAGE_LABELS[status];
}

const DEMO_COMPLETED_TIMESTAMPS = [
  "2026-07-20T09:00:00-06:00",
  "2026-07-21T10:00:00-06:00",
  "2026-07-24T11:00:00-06:00",
  "2026-07-27T12:00:00-06:00",
  "2026-07-29T13:00:00-06:00",
  "2026-07-30T14:00:00-06:00",
  "2026-07-31T15:00:00-06:00",
  "2026-08-01T16:00:00-06:00",
  "2026-08-02T17:00:00-06:00",
  "2026-08-03T18:00:00-06:00",
];

export function buildDemoStageRail(currentStatus: CaseStatus): StageRailStage[] {
  const currentIndex = CASE_STAGE_ORDER.indexOf(currentStatus);
  return CASE_STAGE_ORDER.map((id, index) => ({
    id,
    label: STAGE_LABELS[id],
    completedAt: index < currentIndex ? (DEMO_COMPLETED_TIMESTAMPS[index] ?? null) : null,
    current: index === currentIndex,
    planned: index > currentIndex,
  }));
}

export const DEMO_NEXT_ACTION: OperationalNextAction = {
  primaryAction: "Enviar solicitud de autorización al cliente",
  assignee: "Ana López (asesora de servicio)",
  assigneeReason: null,
  dueAt: "2026-08-01T17:00:00-06:00",
  waitingSince: "2026-07-30T14:20:00-06:00",
  blocker: null,
  evidenceCompleteness: 0.75,
};

export const DEMO_BLOCKERS: CaseBlocker[] = [
  {
    id: "blk-1",
    description: "Falta confirmación del cliente sobre el horario de recogida.",
    resolvableBy: "Cliente",
    raisedAt: "2026-07-30T09:00:00-06:00",
  },
];
