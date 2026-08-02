// Case status transitions — DATATEK_R0_A sección 5.1 (tabla literal).
//
// R0-D Fase 2 exposes a single generic `TransitionCase` command (not one
// command per row of the R0-A table), so this module models the table as an
// adjacency map keyed by the FROM status, checked by (from, to) rather than
// by named sub-command. `ReceiveVehicle`, `StartInspection` and
// `CompleteInspection` also call `resolveCaseTransition` internally (they
// are the R0-A-named commands for exactly one edge each), so the transition
// rule lives here once instead of being duplicated per caller.
import { CASE_STATUSES, type CaseStatus } from "../../generated/spec.constants.ts";

const TERMINAL_STATUSES: readonly CaseStatus[] = ["closed", "cancelled"];

/** Every non-cancel edge in the R0-A sección 5.1 table. `cancelled` is
 * handled separately below because it is reachable from ANY non-terminal
 * status, not from a fixed set of sources. */
const ALLOWED_EDGES: Partial<Record<CaseStatus, readonly CaseStatus[]>> = {
  new: ["triage"],
  triage: ["waiting_customer", "scheduled"],
  waiting_customer: ["triage"],
  scheduled: ["received"],
  received: ["inspection"],
  inspection: ["waiting_authorization"],
  waiting_authorization: ["ready", "closed"],
};

export function isTerminalCaseStatus(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface CaseTransitionCheck {
  ok: boolean;
  reason?: string;
}

/** Pure check: is `from -> to` a legal edge of the R0-A sección 5.1 graph?
 * This function does NOT check preconditions like "reserva válida" or
 * "inspección completa" — those depend on state this module never sees
 * (appointments, inspections) and are validated by the calling command
 * (`TransitionCase`, `ReceiveVehicle`, `StartInspection`,
 * `CompleteInspection`) before it calls this. */
export function resolveCaseTransition(from: CaseStatus, to: CaseStatus): CaseTransitionCheck {
  if (!CASE_STATUSES.includes(to)) {
    return { ok: false, reason: `Estado destino desconocido: ${to}.` };
  }
  if (to === "cancelled") {
    if (isTerminalCaseStatus(from)) {
      return { ok: false, reason: `No se puede cancelar un caso en estado terminal (${from}).` };
    }
    return { ok: true };
  }
  if (isTerminalCaseStatus(from)) {
    return {
      ok: false,
      reason: `El caso está en un estado terminal (${from}) y no se reabre; crea un caso relacionado.`,
    };
  }
  const edges = ALLOWED_EDGES[from] ?? [];
  if (!edges.includes(to)) {
    return {
      ok: false,
      reason: `No existe una transición válida de "${from}" a "${to}".`,
    };
  }
  return { ok: true };
}
