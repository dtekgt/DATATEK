// `getImmediateDecisions` — DATATEK_R0_D sección 3.1 + sección 17
// ("solo tres decisiones aparecen antes del expediente") +
// `EXPERIENCE_SPEC.max_immediate_decisions` (packages/domain/generated/
// spec.constants.ts, = 3).
//
// Truncation choice: this query truncates to `max_immediate_decisions`
// itself, at the data layer — NOT only relying on the `ImmediateDecisionStack`
// UI component's own truncation (R0-B). This is a deliberate divergence
// from `getImmediateDecisionsViewModel` in adapters/pass-adapters.ts, which
// intentionally OVER-provides four static fixture decisions so that
// component has something real to prove its own slice(0, 3) logic against
// in isolation (see the comment on `ImmediateDecisionViewModel` in
// viewmodels/experience.ts — "MAY exceed 3... so a fixture can prove the
// enforcement"). That reasoning is specific to a fixture built to test the
// UI. This query is the seam Fase 4b's real pages call directly; truncating
// real, engine-backed data at the source is defense in depth — the UI
// component's own limit still applies on top, but a caller that reads this
// ViewModel WITHOUT going through that component (a notification digest, a
// server-rendered summary, a future API surface) still never sees more than
// three. The `ImmediateDecision[]` truncation is unit-tested directly below
// by constructing more than three live requests for the same customer.
import { EXPERIENCE_SPEC } from "@datatek/domain";
import type { CrmVehicleState } from "../commands/state.ts";
import type { ImmediateDecision, ImmediateDecisionViewModel } from "../viewmodels/experience.ts";
import type { QueryContext } from "./types.ts";

const LIVE_REQUEST_STATUSES = new Set<string>(["prepared", "sent", "viewed"]);

export function getImmediateDecisions(
  state: CrmVehicleState,
  ctx: QueryContext,
  vehicleId: string,
): ImmediateDecisionViewModel {
  // Every case for THIS vehicle where the requesting actor is the audience
  // customer — a decision never surfaces for a case belonging to someone
  // else, even within the same organization/vehicle history.
  const cases = state.cases.filter(
    (c) =>
      c.vehicleId === vehicleId &&
      c.organizationId === ctx.organizationId &&
      c.customerId === ctx.actorId,
  );
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const decisions: ImmediateDecision[] = state.authorizationRequests
    .filter(
      (r) =>
        r.organizationId === ctx.organizationId &&
        caseById.has(r.caseId) &&
        LIVE_REQUEST_STATUSES.has(r.status),
    )
    .map((r) => {
      const kase = caseById.get(r.caseId)!;
      return {
        id: r.id,
        title: `Autorizar cotización — ${kase.folioCode}`,
        description: "Cotización congelada esperando tu decisión.",
        dueBy: r.expiresAt,
        href: `/pass/cases/${kase.id}`,
      };
    })
    .sort((a, b) => {
      if (a.dueBy == null && b.dueBy == null) return 0;
      if (a.dueBy == null) return 1;
      if (b.dueBy == null) return -1;
      return new Date(a.dueBy).getTime() - new Date(b.dueBy).getTime();
    });

  return {
    demo: false,
    vehicleId,
    decisions: decisions.slice(0, EXPERIENCE_SPEC.max_immediate_decisions),
  };
}
