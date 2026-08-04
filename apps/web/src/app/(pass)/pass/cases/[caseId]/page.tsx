import { getCaseProofSummary, getPassCase } from "@datatek/application/commands";
import { getPassCaseViewModel } from "@datatek/application";
import { Badge, CaseProofSummary, PageTitle } from "@datatek/ui";
import type { CaseProofSummaryViewModel } from "@datatek/application";
import { getCommandsEngine } from "../../../../../lib/commands-engine";

export default async function PassCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  // No real Pass authentication exists in R0 yet (see
  // `apps/web/src/lib/pass-actor.ts`'s header comment) — this page resolves
  // "who is asking" FROM the case itself: whoever's `customerId` the case
  // belongs to. `getPassCase`'s own non-enumeration check
  // (`kase.customerId !== ctx.actorId`) then trivially passes because the
  // actor WAS derived from that same case, exactly mirroring what the
  // fixture adapter this replaces already did (no identity check either —
  // any caseId resolves to a static demo case, real auth is out of this
  // phase's scope).
  const state = getCommandsEngine().getState();
  const kase = state.cases.find((c) => c.id === caseId);

  if (kase) {
    const ctx = {
      organizationId: kase.organizationId,
      audience: "pass" as const,
      actorId: kase.customerId,
      now: new Date(),
    };
    const caseVm = getPassCase(state, ctx, caseId);
    if (caseVm) {
      const proof = getCaseProofSummary(state, ctx, caseId);
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <PageTitle>{caseVm.code}</PageTitle>
            <Badge tone="success">Motor de comandos</Badge>
          </div>
          <p className="text-sm text-[var(--color-muted-400)]">{caseVm.vehicleLabel}</p>
          <Badge tone="info" className="self-start">
            {caseVm.friendlyStatus}
          </Badge>
          {proof ? (
            <CaseProofSummary vm={proof} />
          ) : (
            <p className="text-sm text-[var(--color-muted-400)]">
              Todavía no hay respaldo registrado para este caso.
            </p>
          )}
        </div>
      );
    }
  }

  const caseVm = getPassCaseViewModel(caseId);
  const proof: CaseProofSummaryViewModel = {
    demo: true,
    caseId,
    facts: [
      {
        id: "f1",
        label: "Inspección",
        detail: "Frenos delanteros con desgaste por debajo del límite seguro.",
      },
      { id: "f2", label: "Evidencia", detail: "3 elementos visibles para el cliente." },
    ],
    evidenceCount: 3,
    decisionsCount: 1,
    completedSuccessfully: false,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <PageTitle>{caseVm.code}</PageTitle>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      <p className="text-sm text-[var(--color-muted-400)]">{caseVm.vehicleLabel}</p>
      <Badge tone="info" className="self-start">
        {caseVm.friendlyStatus}
      </Badge>
      <CaseProofSummary vm={proof} />
    </div>
  );
}
