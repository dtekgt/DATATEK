import { getCaseWorkspaceViewModel, friendlyCaseStatus } from "@datatek/application";
import {
  Badge,
  CaseHeader,
  CaseStageRail,
  CaseNextActionCard,
  CaseBlockersList,
  CaseQuoteTotal,
  Card,
  Tabs,
} from "@datatek/ui";

export default async function ProCaseWorkspacePage({
  params,
}: {
  params: Promise<{ orgSlug: string; caseId: string }>;
}) {
  const { orgSlug, caseId } = await params;
  const vm = getCaseWorkspaceViewModel(orgSlug, caseId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Badge tone="neutral">DEMO DATA — no permite transicionar</Badge>
      </div>
      <CaseHeader
        code={vm.code}
        customerName={vm.customerName}
        vehicleLabel={vm.vehicleLabel}
        status={vm.status}
        friendlyStatus={friendlyCaseStatus(vm.status)}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
            Etapas
          </p>
          <CaseStageRail stages={vm.stages} />
        </Card>
        <div className="flex flex-col gap-4">
          <CaseNextActionCard action={vm.nextAction} />
          <Tabs
            ariaLabel="Detalle del caso"
            items={[
              {
                id: "blockers",
                label: "Bloqueos",
                content: <CaseBlockersList blockers={vm.blockers} />,
              },
              {
                id: "quote",
                label: "Cotización",
                content: <CaseQuoteTotal total={vm.quoteTotal} />,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
