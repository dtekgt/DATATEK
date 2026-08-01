import { getControlStatusViewModel } from "@datatek/application";
import { AuditTimeline, Badge } from "@datatek/ui";

export default function ControlStatusPage() {
  const vm = getControlStatusViewModel();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Estado de plataforma</h1>
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
