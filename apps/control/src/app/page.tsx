import { getControlStatusViewModel } from "@datatek/application";
import { Badge, Card, DateTimeText, PageTitle } from "@datatek/ui";

export default function ControlHomePage() {
  const vm = getControlStatusViewModel();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <PageTitle>Estado general</PageTitle>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      <p className="text-sm text-[var(--color-muted-400)]">
        Generado <DateTimeText value={vm.generatedAt} mode="datetime" />
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {vm.checks.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center gap-2">
              <p className="font-medium">{c.label}</p>
              <Badge tone={c.status === "demo" ? "success" : "neutral"} className="ml-auto">
                {c.status === "demo" ? "Demostrado" : "Planificado"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted-400)]">{c.detail}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
