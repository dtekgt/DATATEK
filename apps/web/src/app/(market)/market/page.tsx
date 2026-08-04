import { getMarketWorkshopListViewModel } from "@datatek/application";
import { Badge, Card, LinkButton, PageTitle, PricingBasisBadge } from "@datatek/ui";

export default function MarketHomePage() {
  const vm = getMarketWorkshopListViewModel();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Encuentra un taller</PageTitle>
        <p className="mt-1 text-sm text-[var(--color-muted-400)]">{vm.seedDisclaimer}</p>
      </div>
      <Badge tone="neutral" className="self-start">
        DEMO DATA
      </Badge>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {vm.workshops.map((w) => (
          <Card key={w.id}>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{w.name}</p>
              {w.founderBadge ? <Badge tone="brand">Taller fundador</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted-400)]">{w.city}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {w.services.slice(0, 2).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{s.name}</span>
                  <PricingBasisBadge modality={s.modality} />
                </li>
              ))}
            </ul>
            <LinkButton href={`/market/workshops/${w.slug}`} size="sm" className="mt-3">
              Ver perfil
            </LinkButton>
          </Card>
        ))}
      </div>
    </div>
  );
}
