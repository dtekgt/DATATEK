import type { MarketWorkshopListViewModel } from "../viewmodels/market";
import { FIXTURE_PRICE_MODALITIES } from "../fixtures/pricing.ts";

export function getMarketWorkshopListViewModel(): MarketWorkshopListViewModel {
  return {
    demo: true,
    seedDisclaimer: "Resultados de búsqueda demostrativa. DTEK es el taller fundador.",
    workshops: [
      {
        id: "wk-dtek",
        slug: "dtek-servicios",
        name: "DTEK Servicios",
        founderBadge: true,
        city: "Ciudad de Guatemala",
        services: [
          {
            id: "svc-1",
            name: "Cambio de pastillas de freno",
            modality: FIXTURE_PRICE_MODALITIES.fixed!,
          },
          { id: "svc-2", name: "Alineación y balanceo", modality: FIXTURE_PRICE_MODALITIES.from! },
          {
            id: "svc-3",
            name: "Reparación de suspensión",
            modality: FIXTURE_PRICE_MODALITIES.range!,
          },
          {
            id: "svc-4",
            name: "Revisión de aire acondicionado",
            modality: FIXTURE_PRICE_MODALITIES.inspection_required!,
          },
          {
            id: "svc-5",
            name: "Diagnóstico de motor",
            modality: FIXTURE_PRICE_MODALITIES.diagnosis_required!,
          },
        ],
      },
      {
        id: "wk-demo-2",
        slug: "taller-demo",
        name: "Taller Demo",
        founderBadge: false,
        city: "Mixco",
        services: [
          { id: "svc-6", name: "Cambio de aceite", modality: FIXTURE_PRICE_MODALITIES.fixed! },
        ],
      },
    ],
  };
}
