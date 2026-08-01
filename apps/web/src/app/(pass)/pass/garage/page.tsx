import { getPassHomeViewModel } from "@datatek/application";
import { Card, Badge, LinkButton, EmptyState } from "@datatek/ui";

export default function GaragePage() {
  const home = getPassHomeViewModel();
  if (home.vehicles.length === 0) {
    return <EmptyState title="Todavía no tienes vehículos vinculados." />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Garage</h1>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      {home.vehicles.map((v) => (
        <Card key={v.id}>
          <p className="font-medium">{v.label}</p>
          <p className="text-sm text-[var(--color-muted-400)]">Placa {v.plate}</p>
          <p className="mt-1 text-sm text-[var(--color-muted-400)]">{v.now.headline}</p>
          <LinkButton href={`/pass/garage/${v.id}`} size="sm" className="mt-3">
            Ver pasaporte
          </LinkButton>
        </Card>
      ))}
    </div>
  );
}
