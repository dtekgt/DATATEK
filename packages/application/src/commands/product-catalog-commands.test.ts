import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { createEmptyState } from "./state.ts";
import { registerProduct, adjustProductStock } from "./product-catalog-commands.ts";
import { buildTestContext } from "./test-helpers.ts";

const ownerCtx = () =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.ownerDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
  });
const advisorCtx = () =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
  });

const validFixedInput = {
  sku: "DTEK-TEST-001",
  category: "frenos",
  name: "Discos de freno",
  brand: "Bosch",
  unit: "juego",
  priceMode: "fixed" as const,
  fixedAmountMinor: 60000,
  currency: "GTQ",
  quantityOnHand: 4,
};

describe("RegisterProduct", () => {
  it("owner (parts.manage) crea un producto con price_mode fixed", () => {
    const outcome = registerProduct(createEmptyState(), ownerCtx(), validFixedInput);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.name).toBe("Discos de freno");
    expect(outcome.data.organizationId).toBe(FIXTURE_ORGANIZATION_IDS.dtek);
    expect(outcome.nextState.productCatalogItems).toHaveLength(1);
  });

  it("advisor (solo parts.read) no puede crear productos", () => {
    const outcome = registerProduct(createEmptyState(), advisorCtx(), validFixedInput);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("FORBIDDEN");
  });

  it("rechaza price_mode 'fixed' sin fixedAmountMinor", () => {
    const outcome = registerProduct(createEmptyState(), ownerCtx(), {
      ...validFixedInput,
      fixedAmountMinor: null,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("rechaza price_mode 'fixed' que además trae fromAmountMinor", () => {
    const outcome = registerProduct(createEmptyState(), ownerCtx(), {
      ...validFixedInput,
      fromAmountMinor: 100,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("rechaza range con max < min", () => {
    const outcome = registerProduct(createEmptyState(), ownerCtx(), {
      ...validFixedInput,
      priceMode: "range",
      fixedAmountMinor: null,
      rangeMinAmountMinor: 500,
      rangeMaxAmountMinor: 100,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("rechaza un sku duplicado dentro de la misma organización", () => {
    const first = registerProduct(createEmptyState(), ownerCtx(), validFixedInput);
    if (!first.ok) throw new Error("setup failed");
    const second = registerProduct(first.nextState, ownerCtx(), validFixedInput);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.field).toBe("sku");
  });

  it("permite el mismo sku en organizaciones distintas", () => {
    const first = registerProduct(createEmptyState(), ownerCtx(), validFixedInput);
    if (!first.ok) throw new Error("setup failed");
    const demoCtx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.ownerDemo,
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    });
    const second = registerProduct(first.nextState, demoCtx, validFixedInput);
    expect(second.ok).toBe(true);
  });
});

describe("AdjustProductStock", () => {
  it("suma un delta positivo a quantityOnHand", () => {
    const created = registerProduct(createEmptyState(), ownerCtx(), validFixedInput);
    if (!created.ok) throw new Error("setup failed");
    const outcome = adjustProductStock(created.nextState, ownerCtx(), {
      productId: created.data.id,
      quantityDelta: 3,
      reason: "Reabastecimiento",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.quantityOnHand).toBe(7);
  });

  it("rechaza un ajuste que dejaría quantityOnHand en negativo", () => {
    const created = registerProduct(createEmptyState(), ownerCtx(), validFixedInput);
    if (!created.ok) throw new Error("setup failed");
    const outcome = adjustProductStock(created.nextState, ownerCtx(), {
      productId: created.data.id,
      quantityDelta: -10,
      reason: "Venta",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("un producto de otra organización se trata como no encontrado", () => {
    const created = registerProduct(createEmptyState(), ownerCtx(), validFixedInput);
    if (!created.ok) throw new Error("setup failed");
    const demoCtx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.ownerDemo,
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    });
    const outcome = adjustProductStock(created.nextState, demoCtx, {
      productId: created.data.id,
      quantityDelta: 1,
      reason: "Reabastecimiento",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NOT_FOUND");
  });
});
