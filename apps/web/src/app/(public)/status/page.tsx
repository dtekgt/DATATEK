import { getControlStatusViewModel } from "@datatek/application";
import { Badge, Card, DateTimeText } from "@datatek/ui";
import { MarketingPage } from "../../../components/marketing-page";

export default function PublicStatusPage() {
  const vm = getControlStatusViewModel();
  return (
    <MarketingPage
      title="Estado del servicio"
      intro="Este panel muestra verificaciones demostrativas de esta release, no un porcentaje de disponibilidad inventado."
    >
      <div className="flex items-center gap-2">
        <Badge tone="neutral">DEMO DATA</Badge>
        <span className="text-xs text-[var(--color-muted-400)]">
          Generado <DateTimeText value={vm.generatedAt} mode="datetime" />
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {vm.checks.map((c) => (
          <li key={c.id}>
            <Card>
              <div className="flex items-center gap-2">
                <p className="font-medium">{c.label}</p>
                <Badge tone={c.status === "demo" ? "success" : "neutral"} className="ml-auto">
                  {c.status === "demo" ? "Demostrado" : "Planificado"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--color-muted-400)]">{c.detail}</p>
            </Card>
          </li>
        ))}
      </ul>
    </MarketingPage>
  );
}
