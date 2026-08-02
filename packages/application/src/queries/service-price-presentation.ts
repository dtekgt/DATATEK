// `getServicePricePresentation` — DATATEK_R0_D sección 3.1 + sección 6/9,
// "siempre declara modalidad" (`assertPriceHasModality`,
// viewmodels/experience.ts).
//
// Reads `CrmVehicleState.serviceCatalogItems` — a minimal, SEEDED (never
// written by any command yet) real table, not the static
// `FIXTURE_PRICE_MODALITIES` fixture (fixtures/pricing.ts). See the comment
// on `ServiceCatalogItemRow` in commands/state.ts for why this table exists
// without a writer command in R0-D Fase 4a (same precedent as `resources`
// before `CreateResource` existed).
import type { ServiceCatalogItemRow, CrmVehicleState } from "../commands/state.ts";
import type { ServicePricePresentationViewModel } from "../viewmodels/experience.ts";
import type { PriceModality } from "../viewmodels/shared.ts";
import { minorToMoney } from "./shared.ts";
import type { QueryContext } from "./types.ts";

function buildPriceModality(item: ServiceCatalogItemRow): PriceModality {
  switch (item.priceMode) {
    case "fixed":
      return { mode: "fixed", amount: minorToMoney(item.fixedAmountMinor ?? 0, item.currency) };
    case "from":
      return { mode: "from", amountFrom: minorToMoney(item.fromAmountMinor ?? 0, item.currency) };
    case "range":
      return {
        mode: "range",
        amountFrom: minorToMoney(item.rangeMinAmountMinor ?? 0, item.currency),
        amountTo: minorToMoney(item.rangeMaxAmountMinor ?? 0, item.currency),
      };
    case "inspection_required":
    case "diagnosis_required":
      return { mode: item.priceMode, note: item.note ?? undefined };
  }
}

export function getServicePricePresentation(
  state: CrmVehicleState,
  // Accepted for signature uniformity with every other query contract
  // (sección 3.1: "resuelve actor y audiencia") but unused: catalog price
  // modality is never audience-restricted (sección 6: "sin precios
  // presentados como universales" is about not universalizing an AMOUNT,
  // not about hiding the modality from anyone) and R0 never implements
  // per-organization `service_catalog_overrides` that a future lookup would
  // need `ctx.organizationId` for.
  _ctx: QueryContext,
  serviceId: string,
): ServicePricePresentationViewModel | null {
  const item = state.serviceCatalogItems.find((i) => i.id === serviceId || i.key === serviceId);
  if (!item) return null;

  return {
    demo: false,
    serviceId: item.id,
    serviceName: item.name,
    modality: buildPriceModality(item),
  };
}
