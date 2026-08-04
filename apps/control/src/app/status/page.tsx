import { getControlStatusViewModel } from "@datatek/application";
import { AuditTimeline, Badge, PageTitle } from "@datatek/ui";

export default function ControlStatusPage() {
  const vm = getControlStatusViewModel();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <PageTitle>Estado de plataforma</PageTitle>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      <AuditTimeline
        events={vm.checks.map((c) => ({
          id: c.id,
          label: c.label,
          actor: "sistema",
          at: vm.generatedAt,
        }))}
      />
    </div>
  );
}
