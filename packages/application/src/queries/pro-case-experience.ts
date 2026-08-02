// `getProCaseExperience` — DATATEK_R0_D sección 3.1 + sección 15, literal:
//
//   "ProCaseExperienceViewModel expresa una sola siguiente acción: nuevo:
//   crear o triage; agendado: recibir; recibido: iniciar inspección;
//   inspección: completar faltantes; quote congelada y no enviada: preparar
//   o enviar; esperando autorización: esperar o reenviar; decidido:
//   siguiente etapa R1 Planificada."
//
// Reuses `CaseWorkspaceViewModel` (viewmodels/pro.ts) — R0-D never defines a
// separate `ProCaseExperienceViewModel` type; the brief names both
// interchangeably and only `CaseWorkspaceViewModel` exists in R0-B's
// contract.
import { brakesTemplateRequiredSlots } from "@datatek/domain";
import { CASE_STAGE_ORDER, friendlyCaseStatus } from "../fixtures/cases.ts";
import type {
  CaseAssignmentRow,
  CaseAssignmentRole,
  CaseRow,
  CrmVehicleState,
  InspectionRow,
} from "../commands/state.ts";
import type { CaseWorkspaceViewModel } from "../viewmodels/pro.ts";
import type { OperationalNextAction, StageRailStage } from "../viewmodels/shared.ts";
import { buildVehicleLabel, minorToMoney } from "./shared.ts";
import type { QueryContext } from "./types.ts";

const LIVE_REQUEST_STATUSES = new Set<string>(["prepared", "sent", "viewed"]);

/** Latest still-active (`unassignedAt == null`) assignment for a role.
 * Returns the raw `userId` as the assignee label — `CrmVehicleState` has no
 * `user_profiles` join available (that lives in the R0-C auth/tenancy
 * fixture, not the command engine), so a human display name is Fase 4b's
 * job once it wires a real profile lookup alongside this query. */
function latestActiveAssignment(
  state: CrmVehicleState,
  caseId: string,
  role: CaseAssignmentRole,
): CaseAssignmentRow | null {
  const rows = state.caseAssignments
    .filter((a) => a.caseId === caseId && a.role === role && a.unassignedAt == null)
    .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
  return rows[0] ?? null;
}

function assigneeFields(
  assignment: CaseAssignmentRow | null,
): Pick<OperationalNextAction, "assignee" | "assigneeReason"> {
  return assignment
    ? { assignee: assignment.userId, assigneeReason: null }
    : { assignee: null, assigneeReason: "Sin asignar" };
}

function inspectionCompleteness(state: CrmVehicleState, inspection: InspectionRow): number {
  const requiredSlots = brakesTemplateRequiredSlots();
  if (requiredSlots.length === 0) return 1;
  const results = state.inspectionResults.filter((r) => r.inspectionId === inspection.id);
  const filled = requiredSlots.filter((slot) =>
    results.some((r) => r.itemKey === slot.itemKey && r.axle === slot.axle && r.side === slot.side),
  ).length;
  return filled / requiredSlots.length;
}

function deriveInspectionStageAction(
  state: CrmVehicleState,
  kase: CaseRow,
  inspectorAssignment: CaseAssignmentRow | null,
  advisorAssignment: CaseAssignmentRow | null,
): OperationalNextAction {
  const inspection = state.inspections
    .filter((i) => i.caseId === kase.id)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

  if (!inspection || inspection.status !== "completed") {
    return {
      primaryAction: "Completar inspección de frenos",
      ...assigneeFields(inspectorAssignment),
      dueAt: null,
      waitingSince: inspection?.startedAt ?? kase.openedAt,
      blocker: null,
      evidenceCompleteness: inspection ? inspectionCompleteness(state, inspection) : 0,
    };
  }

  // Inspection IS completed but the case is still `inspection` — by design
  // (see `completeInspection`'s own doc comment in
  // commands/inspection-commands.ts): the transition to
  // `waiting_authorization` only happens inside `PrepareAuthorizationRequest`,
  // once a quote is actually frozen and a request exists behind it. What's
  // next depends on how far the quote has gotten.
  const quote = state.quotes.find((q) => q.caseId === kase.id);
  if (!quote) {
    return {
      primaryAction: "Crear cotización",
      ...assigneeFields(advisorAssignment),
      dueAt: null,
      waitingSince: inspection.completedAt,
      blocker: null,
      evidenceCompleteness: 1,
    };
  }

  const versions = state.quoteVersions.filter((v) => v.quoteId === quote.id);
  const frozen = versions.find((v) => v.status === "frozen");
  if (!frozen) {
    return {
      primaryAction: "Completar y congelar la cotización",
      ...assigneeFields(advisorAssignment),
      dueAt: null,
      waitingSince: inspection.completedAt,
      blocker: null,
      evidenceCompleteness: 1,
    };
  }

  return {
    primaryAction: "Preparar solicitud de autorización",
    ...assigneeFields(advisorAssignment),
    dueAt: null,
    waitingSince: frozen.frozenAt,
    blocker: null,
    evidenceCompleteness: 1,
  };
}

function deriveWaitingAuthorizationAction(
  state: CrmVehicleState,
  kase: CaseRow,
  advisorAssignment: CaseAssignmentRow | null,
): OperationalNextAction {
  const live = state.authorizationRequests
    .filter((r) => r.caseId === kase.id && LIVE_REQUEST_STATUSES.has(r.status))
    .sort((a, b) => new Date(b.preparedAt).getTime() - new Date(a.preparedAt).getTime())[0];

  if (!live) {
    // Defensive only — `PrepareAuthorizationRequest` always creates a
    // request in the same transaction that moves the case here, so this
    // should be unreachable in practice. A query never assumes an
    // invariant it cannot verify from the state it was actually handed.
    return {
      primaryAction: "Preparar solicitud de autorización",
      ...assigneeFields(advisorAssignment),
      dueAt: null,
      waitingSince: null,
      blocker: null,
      evidenceCompleteness: 1,
    };
  }

  if (live.status === "prepared") {
    return {
      primaryAction: "Enviar solicitud de autorización",
      ...assigneeFields(advisorAssignment),
      dueAt: live.expiresAt,
      waitingSince: live.preparedAt,
      blocker: null,
      evidenceCompleteness: 1,
    };
  }

  // sent / viewed — sección 15: "esperando autorización: esperar o
  // reenviar" (reenviar = RevokeAndReprepareAuthorizationRequest, Fase 4a).
  return {
    primaryAction: "Esperar la decisión del cliente (o reenviar el enlace)",
    ...assigneeFields(advisorAssignment),
    dueAt: live.expiresAt,
    waitingSince: live.sentAt ?? live.preparedAt,
    blocker: null,
    evidenceCompleteness: 1,
  };
}

function deriveNextAction(state: CrmVehicleState, kase: CaseRow): OperationalNextAction {
  const advisorAssignment = latestActiveAssignment(state, kase.id, "advisor");
  const inspectorAssignment = latestActiveAssignment(state, kase.id, "inspector");

  switch (kase.status) {
    case "new":
    case "triage":
      return {
        primaryAction: "Hacer triage del caso",
        ...assigneeFields(advisorAssignment),
        dueAt: null,
        waitingSince: kase.openedAt,
        blocker: null,
        evidenceCompleteness: 0,
      };
    case "waiting_customer":
      return {
        primaryAction: "Esperar respuesta del cliente",
        ...assigneeFields(advisorAssignment),
        dueAt: null,
        waitingSince: kase.openedAt,
        blocker: null,
        evidenceCompleteness: 0,
      };
    case "scheduled":
      return {
        primaryAction: "Recibir vehículo",
        ...assigneeFields(advisorAssignment),
        dueAt: null,
        waitingSince: kase.openedAt,
        blocker: null,
        evidenceCompleteness: 0,
      };
    case "received":
      return {
        primaryAction: "Iniciar inspección",
        ...assigneeFields(inspectorAssignment),
        dueAt: null,
        waitingSince: kase.openedAt,
        blocker: null,
        evidenceCompleteness: 0,
      };
    case "inspection":
      return deriveInspectionStageAction(state, kase, inspectorAssignment, advisorAssignment);
    case "waiting_authorization":
      return deriveWaitingAuthorizationAction(state, kase, advisorAssignment);
    case "ready":
      return {
        primaryAction: "Siguiente etapa: Planificada (reparación) — R1",
        ...assigneeFields(advisorAssignment),
        dueAt: null,
        waitingSince: null,
        blocker: null,
        evidenceCompleteness: 1,
      };
    case "closed":
      return {
        primaryAction: "Caso cerrado — cliente no autorizó",
        assignee: null,
        assigneeReason: null,
        dueAt: null,
        waitingSince: null,
        blocker: null,
        evidenceCompleteness: 1,
      };
    default:
      // in_progress/blocked/quality/ready_for_delivery/delivered/cancelled
      // are R1+ statuses, outside the R0-D brake vertical (sección 0: "la
      // vertical termina en autorización") — an honest placeholder instead
      // of inventing R1 next-action logic here.
      return {
        primaryAction: "Fuera del alcance de la vertical de frenos (R0-D)",
        assignee: null,
        assigneeReason: null,
        dueAt: null,
        waitingSince: null,
        blocker: null,
        evidenceCompleteness: 1,
      };
  }
}

/** Real derivation of the stage rail from actual `case_status_events`
 * (`occurredAt` per transition), unlike the fixture's `buildDemoStageRail`
 * (fixtures/cases.ts), which paints in a fixed fake timestamp array. Reuses
 * `CASE_STAGE_ORDER`/`friendlyCaseStatus` from that same module — those two
 * are generic label/order helpers, not fixture DATA, so reusing them keeps
 * real and demo rails labeled identically. Statuses outside
 * `CASE_STAGE_ORDER` (e.g. `closed`) render every stage as `planned` — the
 * same limitation `buildDemoStageRail` already has, not a new one. */
function buildStageRail(state: CrmVehicleState, kase: CaseRow): StageRailStage[] {
  const events = state.caseStatusEvents.filter((e) => e.caseId === kase.id);
  const currentIndex = CASE_STAGE_ORDER.indexOf(kase.status);
  return CASE_STAGE_ORDER.map((id, index) => {
    const event = events.find((e) => e.toStatus === id);
    return {
      id,
      label: friendlyCaseStatus(id),
      completedAt: index < currentIndex ? (event?.occurredAt ?? null) : null,
      current: index === currentIndex,
      planned: index > currentIndex,
    };
  });
}

export function getProCaseExperience(
  state: CrmVehicleState,
  ctx: QueryContext,
  caseId: string,
): CaseWorkspaceViewModel | null {
  const kase = state.cases.find((c) => c.id === caseId && c.organizationId === ctx.organizationId);
  if (!kase) return null;

  const customer = state.customers.find(
    (c) => c.id === kase.customerId && c.organizationId === ctx.organizationId,
  );
  const vehicle = state.vehicles.find((v) => v.id === kase.vehicleId);

  const quote = state.quotes.find((q) => q.caseId === kase.id);
  const versions = quote ? state.quoteVersions.filter((v) => v.quoteId === quote.id) : [];
  const authoritative =
    versions.find((v) => v.status === "frozen") ??
    [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];

  return {
    demo: false,
    caseId: kase.id,
    code: kase.folioCode,
    customerName: customer?.displayName ?? "Cliente",
    vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehículo",
    status: kase.status,
    stages: buildStageRail(state, kase),
    nextAction: deriveNextAction(state, kase),
    // `case_blockers` has no writer command in R0 yet
    // (docs/domain/unwritten-tables.md) — always empty for a real,
    // engine-backed case, unlike the fixture adapter's static
    // `DEMO_BLOCKERS`.
    blockers: [],
    quoteTotal: authoritative
      ? minorToMoney(authoritative.totalMinor, authoritative.currency)
      : null,
    createdAt: kase.createdAt,
  };
}
