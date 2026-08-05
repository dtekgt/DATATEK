import { describe, it } from "node:test";
import { expect } from "expect";
import { buildFixtureCrmVehicleState } from "../commands/fixtures.ts";
import { getProductCatalogForOrg } from "./product-catalog.ts";
import { buildQueryContext } from "./query-test-helpers.ts";
import { FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";

const dtekCtx = buildQueryContext({
  audience: "pro",
  actorId: "advisor-dtek",
  organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
});
const demoCtx = buildQueryContext({
  audience: "pro",
  actorId: "owner-demo",
  organizationId: FIXTURE_ORGANIZATION_IDS.demo,
});

describe("getProductCatalogForOrg — a diferencia de servicios, SÍ filtra por organización", () => {
  it("DTEK ve solo sus 2 productos, nunca el de Taller Demo", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getProductCatalogForOrg(state, dtekCtx);
    expect(result.products).toHaveLength(2);
    expect(result.products.every((p) => p.name !== "Pastillas de freno traseras")).toBe(true);
  });

  it("Taller Demo ve solo su propio producto", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getProductCatalogForOrg(state, demoCtx);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.name).toBe("Pastillas de freno traseras");
  });

  it("un producto con quantityOnHand=0 sigue en la lista — agotado no es invisible", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getProductCatalogForOrg(state, dtekCtx);
    const oil = result.products.find((p) => p.sku === "DTEK-OIL-005");
    expect(oil).toBeDefined();
    expect(oil?.quantityOnHand).toBe(0);
    expect(oil?.inStock).toBe(false);
  });

  it("declara modalidad de precio igual que un servicio (fixed con Money)", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getProductCatalogForOrg(state, dtekCtx);
    const pads = result.products.find((p) => p.sku === "DTEK-PAD-001");
    expect(pads?.modality.mode).toBe("fixed");
    expect(pads?.modality.amount).toEqual({ amount: 450, currency: "GTQ" });
  });

  it("nunca lleva demo:true — es el motor real, aunque no esté en Postgres todavía", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getProductCatalogForOrg(state, dtekCtx);
    expect(result.demo).toBe(false);
  });
});
