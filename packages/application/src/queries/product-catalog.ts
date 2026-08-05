// `getProductCatalogForOrg` — lista los productos/repuestos de UNA
// organización, para la futura pantalla /pro/parts.
//
// Lee `CrmVehicleState.productCatalogItems` — mismo precedente que
// `getServicePricePresentation` (tabla real y sembrada, sin comando de
// escritura todavía; ver el comentario sobre `ProductCatalogItemRow` en
// commands/state.ts). A diferencia del catálogo de servicios, SÍ filtra por
// `ctx.organizationId`: un repuesto es inventario de una organización, así
// que esta consulta nunca devuelve la fila de otro taller — el filtro no es
// una guarda extra, es lo único que hace la función.
import type { ProductCatalogItemRow, CrmVehicleState } from "../commands/state.ts";
import type { PriceModality } from "../viewmodels/shared.ts";
import { minorToMoney } from "./shared.ts";
import type { QueryContext } from "./types.ts";

export interface ProductCatalogRowViewModel {
  productId: string;
  sku: string | null;
  category: string;
  name: string;
  brand: string | null;
  unit: string;
  modality: PriceModality;
  quantityOnHand: number;
  inStock: boolean;
}

export interface ProductCatalogViewModel {
  demo: false;
  organizationId: string;
  products: ProductCatalogRowViewModel[];
}

function buildPriceModality(item: ProductCatalogItemRow): PriceModality {
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
      return { mode: item.priceMode };
  }
}

export function getProductCatalogForOrg(
  state: CrmVehicleState,
  ctx: QueryContext,
): ProductCatalogViewModel {
  const products = state.productCatalogItems
    .filter((item) => item.organizationId === ctx.organizationId)
    .map((item) => ({
      productId: item.id,
      sku: item.sku,
      category: item.category,
      name: item.name,
      brand: item.brand,
      unit: item.unit,
      modality: buildPriceModality(item),
      quantityOnHand: item.quantityOnHand,
      // 0 en existencia sigue siendo un producto legible, no un secreto
      // (mismo criterio que product_catalog_versions en 0094: "agotado" es
      // un estado del catálogo, no una fila que haya que esconder).
      inStock: item.quantityOnHand > 0,
    }));

  return { demo: false, organizationId: ctx.organizationId, products };
}
