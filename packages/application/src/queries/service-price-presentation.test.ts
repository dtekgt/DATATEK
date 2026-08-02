import { describe, it } from "node:test";
import { expect } from "expect";
import { buildFixtureCrmVehicleState } from "../commands/fixtures.ts";
import { getServicePricePresentation } from "./service-price-presentation.ts";
import { buildQueryContext } from "./query-test-helpers.ts";

const ctx = buildQueryContext({ audience: "pass", actorId: "cust-dtek-demo" });

describe("getServicePricePresentation — DATATEK_R0_D sección 3.1 (siempre declara modalidad)", () => {
  it("returns null for a service id that does not exist", () => {
    const state = buildFixtureCrmVehicleState();
    expect(getServicePricePresentation(state, ctx, "does-not-exist")).toBeNull();
  });

  it("fixed: declares a single fixed amount", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getServicePricePresentation(state, ctx, "brake_inspection");
    expect(result?.modality.mode).toBe("fixed");
    expect(result?.modality.amount).toEqual({ amount: 150, currency: "GTQ" });
  });

  it("from: declares a starting amount, never a fixed total", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getServicePricePresentation(state, ctx, "axle_brake_service");
    expect(result?.modality.mode).toBe("from");
    expect(result?.modality.amountFrom).toEqual({ amount: 450, currency: "GTQ" });
    expect(result?.modality.amount).toBeUndefined();
  });

  it("range: declares a min and a max", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getServicePricePresentation(state, ctx, "full_brake_overhaul");
    expect(result?.modality.mode).toBe("range");
    expect(result?.modality.amountFrom).toEqual({ amount: 800, currency: "GTQ" });
    expect(result?.modality.amountTo).toEqual({ amount: 1450, currency: "GTQ" });
  });

  it("inspection_required: no amount at all, just a note — never a universal price", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getServicePricePresentation(state, ctx, "brake_fluid_flush");
    expect(result?.modality.mode).toBe("inspection_required");
    expect(result?.modality.amount).toBeUndefined();
    expect(result?.modality.note).toBeTruthy();
  });

  it("diagnosis_required: no amount, just a note", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getServicePricePresentation(state, ctx, "vibration_diagnosis");
    expect(result?.modality.mode).toBe("diagnosis_required");
    expect(result?.modality.note).toBeTruthy();
  });

  it("can also be looked up by its row id, not just its key", () => {
    const state = buildFixtureCrmVehicleState();
    const result = getServicePricePresentation(state, ctx, "svc-brake-inspection");
    expect(result?.serviceName).toBe("Diagnóstico / inspección de frenos");
  });
});
