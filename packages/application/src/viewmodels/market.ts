import type { DemoMarker, PriceModality } from "./shared";

export interface MarketWorkshopService {
  id: string;
  name: string;
  modality: PriceModality;
}

export interface MarketWorkshopSummary {
  id: string;
  slug: string;
  name: string;
  founderBadge: boolean;
  city: string;
  services: MarketWorkshopService[];
}

export interface MarketWorkshopListViewModel extends DemoMarker {
  workshops: MarketWorkshopSummary[];
  seedDisclaimer: string;
}
