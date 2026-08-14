import { getMarketWorkshopListViewModel } from "@datatek/application";
import { PageTitle } from "@datatek/ui";
import { MarketRequestsLookupForm } from "./lookup-form";

export default function MarketRequestsPage() {
  const vm = getMarketWorkshopListViewModel();
  const workshops = vm.workshops.map((w) => ({ value: w.slug, label: w.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Mis solicitudes</PageTitle>
      <MarketRequestsLookupForm workshops={workshops} />
    </div>
  );
}
