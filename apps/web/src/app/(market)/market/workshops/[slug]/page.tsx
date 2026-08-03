import { getMarketWorkshopListViewModel } from "@datatek/application";
import { Badge, Card, EmptyState, PricingBasisBadge } from "@datatek/ui";

export default async function MarketWorkshopDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const vm = getMarketWorkshopListViewModel();
  const workshop = vm.workshops.find((w) => w.slug === slug);

  if (!workshop) {
    return <EmptyState title="Este taller no tiene servicios publicados todavía." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Las dos páginas hermanas que leen ESTE MISMO view model
          (market/page.tsx y market/workshops/page.tsx) sí rotulan DEMO DATA;
          el detalle no lo hacía, y es justo donde se ven nombre, ciudad y
          lista de servicios con su base de precio — lo más fácil de tomar
          por una publicación real. */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{workshop.name}</h1>
        {workshop.founderBadge ? <Badge tone="brand">Taller fundador</Badge> : null}
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      <p className="text-sm text-[var(--color-muted-400)]">{workshop.city}</p>
      <Card>
        <p className="text-sm font-medium">Servicios</p>
        <ul className="mt-2 flex flex-col gap-2">
          {workshop.services.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{s.name}</span>
              <PricingBasisBadge modality={s.modality} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
