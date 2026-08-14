import { getMarketWorkshopListViewModel } from "@datatek/application";
import { PageTitle } from "@datatek/ui";
import { MarketRequestForm } from "./request-form";

export default function MarketRequestPage() {
  const vm = getMarketWorkshopListViewModel();
  const workshops = vm.workshops.map((w) => ({ value: w.slug, label: w.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Pide una cotización</PageTitle>
      <MarketRequestForm workshops={workshops} />
    </div>
  );
}
