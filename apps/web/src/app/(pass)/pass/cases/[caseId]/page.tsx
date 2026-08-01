import { getPassCaseViewModel } from "@datatek/application";
import { Badge, CaseProofSummary } from "@datatek/ui";
import type { CaseProofSummaryViewModel } from "@datatek/application";

export default async function PassCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
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
        <h1 className="text-xl font-semibold">{caseVm.code}</h1>
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
