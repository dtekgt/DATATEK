import { getMarketWorkshopListViewModel } from "@datatek/application";
import { Badge, Card, LinkButton } from "@datatek/ui";

export default function MarketWorkshopsPage() {
  const vm = getMarketWorkshopListViewModel();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Talleres</h1>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      {vm.workshops.map((w) => (
        <Card key={w.id}>
          <p className="font-medium">{w.name}</p>
          <p className="text-sm text-[var(--color-muted-400)]">{w.city}</p>
          <LinkButton href={`/market/workshops/${w.slug}`} size="sm" className="mt-2">
            Ver perfil
          </LinkButton>
        </Card>
      ))}
    </div>
  );
}
