// `getCaseProofSummary` — DATATEK_R0_D sección 3.1. "Nunca presenta éxito
// falso; evidencia pending no cuenta como confirmada" (task brief) —
// `completedSuccessfully` is a type-level `false` literal
// (`CaseProofSummaryViewModel`, viewmodels/experience.ts) that this query
// can never override, and `evidenceCount` only counts assets that finished
// the upload/confirm cycle (`uploaded`/`verified`), never
// `pending_upload`/`rejected`/`invalidated`.
import { effectiveEvidenceVisibility, type AuthorizationStatus } from "@datatek/domain";
import type { CrmVehicleState } from "../commands/state.ts";
import type { CaseProofSummaryViewModel, ProofFact } from "../viewmodels/experience.ts";
import { isVisibleToAudience } from "./shared.ts";
import type { QueryContext } from "./types.ts";

const DECISION_LABELS: Record<AuthorizationStatus, string> = {
  accepted: "Autorizado",
  partially_accepted: "Autorizado parcialmente",
  rejected: "Rechazado",
  invalidated: "Invalidado",
};

export function getCaseProofSummary(
  state: CrmVehicleState,
  ctx: QueryContext,
  caseId: string,
): CaseProofSummaryViewModel | null {
  const kase = state.cases.find((c) => c.id === caseId && c.organizationId === ctx.organizationId);
  if (!kase) return null;
  // Same non-enumeration discipline as `getPassCase`: a customer/guest
  // audience only ever proves ITS OWN case.
  if (ctx.audience !== "pro" && kase.customerId !== ctx.actorId) return null;

  const facts: ProofFact[] = [];

  const latestCompletedInspection = state.inspections
    .filter((i) => i.caseId === kase.id && i.status === "completed" && i.completedAt != null)
    .sort(
      (a, b) =>
        new Date(b.completedAt as string).getTime() - new Date(a.completedAt as string).getTime(),
    )[0];
  if (latestCompletedInspection?.completedAt) {
    facts.push({
      id: `fact-inspection-${latestCompletedInspection.id}`,
      label: "Inspección completada",
      detail: new Date(latestCompletedInspection.completedAt).toLocaleDateString("es-GT"),
    });
  }

  const quote = state.quotes.find((q) => q.caseId === kase.id);
  const frozenVersion = quote
    ? state.quoteVersions.find((v) => v.quoteId === quote.id && v.status === "frozen")
    : undefined;
  if (frozenVersion?.snapshotHash) {
    facts.push({
      id: `fact-quote-${frozenVersion.id}`,
      label: `Cotización congelada v${frozenVersion.versionNumber}`,
      // Only a short, non-guessable prefix of the hash — enough for a
      // customer to visually match "the version I already saw", never the
      // full value (sección 10.2 spirit: no security identifiers exposed
      // wholesale to a customer-facing surface).
      detail: `hash ${frozenVersion.snapshotHash.slice(0, 8)}…`,
    });
  }

  const decisions = state.authorizations.filter((a) => a.caseId === kase.id);
  const latestDecision = [...decisions].sort(
    (a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime(),
  )[0];
  if (latestDecision) {
    facts.push({
      id: `fact-decision-${latestDecision.id}`,
      label: "Decisión registrada",
      detail: `${DECISION_LABELS[latestDecision.status]} — ${new Date(latestDecision.decidedAt).toLocaleDateString("es-GT")}`,
    });
  }

  // Evidence linked to the case itself, or to one of its inspection
  // results/findings — "evidencia pending no cuenta como confirmada" +
  // visibility filtered by audience via the asset's EFFECTIVE visibility
  // (asset ceiling AND link visibility both have to clear the bar — sección
  // 8.3: "un link incorrecto no puede volver pública una evidencia
  // interna").
  const inspectionIds = new Set(
    state.inspections.filter((i) => i.caseId === kase.id).map((i) => i.id),
  );
  const resultIds = new Set(
    state.inspectionResults.filter((r) => inspectionIds.has(r.inspectionId)).map((r) => r.id),
  );
  const findingIds = new Set(state.findings.filter((f) => f.caseId === kase.id).map((f) => f.id));

  const relevantLinks = state.evidenceLinks.filter(
    (l) =>
      (l.entityType === "case" && l.entityId === kase.id) ||
      (l.entityType === "inspection_result" && resultIds.has(l.entityId)) ||
      (l.entityType === "finding" && findingIds.has(l.entityId)),
  );

  let evidenceCount = 0;
  for (const link of relevantLinks) {
    const asset = state.evidenceAssets.find((a) => a.id === link.assetId);
    if (!asset) continue;
    // "pending no cuenta como confirmada" — only a completed upload counts.
    if (asset.status !== "uploaded" && asset.status !== "verified") continue;
    const effective = effectiveEvidenceVisibility(asset.visibilityMax, link.visibility);
    if (!isVisibleToAudience(effective, ctx.audience)) continue;
    evidenceCount += 1;
  }

  return {
    demo: false,
    caseId: kase.id,
    facts,
    evidenceCount,
    decisionsCount: decisions.length,
    // Never true — R0-D never completes repair/delivery (sección 0: "la
    // vertical termina en autorización. No inicia reparación...").
    completedSuccessfully: false,
  };
}
