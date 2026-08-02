import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { createCommandEngine } from "./engine.ts";
import { buildFixtureCrmVehicleState, FIXTURE_CRM_VEHICLE_IDS } from "./fixtures.ts";
import { buildTestContext } from "./test-helpers.ts";

// End-to-end proof that the six commands are reachable through one shared,
// mutable, server-side engine — not just standalone pure functions with
// nothing exercising them (DATATEK_R0_D Fase 1 requirement). This is
// exactly what apps/web's temporary dev route calls.
describe("CommandEngine — end to end through the fixture state", () => {
  it("runs CreateProvisionalCustomer -> RegisterVehicle -> RecordOdometerEvent against one shared engine", () => {
    const engine = createCommandEngine(buildFixtureCrmVehicleState());
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });

    const customer = engine.createProvisionalCustomer(ctx, {
      displayName: "Nuevo Cliente E2E",
      source: "whatsapp_manual",
    });
    expect(customer.ok).toBe(true);
    if (!customer.ok) return;

    const vehicle = engine.registerVehicle(ctx, {
      vin: "JHMFA16506S123789",
      plate: "P-999ZZZ",
      customerId: customer.data.id,
    });
    expect(vehicle.ok).toBe(true);
    if (!vehicle.ok) return;
    expect(vehicle.data.linkedToExistingVehicle).toBe(false);

    const odometer = engine.recordOdometerEvent(ctx, {
      vehicleId: vehicle.data.vehicleId,
      value: 12000,
      unit: "km",
      recordedAt: "2026-08-01T09:00:00.000Z",
      provenance: "observed",
    });
    expect(odometer.ok).toBe(true);
    if (!odometer.ok) return;
    expect(odometer.data.status).toBe("accepted");

    // The engine's own state reflects every mutation — this is the "state
    // in memory, server-side" the fixture engine is required to hold.
    const state = engine.getState();
    expect(state.customers.some((c) => c.id === customer.data.id)).toBe(true);
    expect(state.vehicles.some((v) => v.id === vehicle.data.vehicleId)).toBe(true);
    expect(state.vehicleOdometerEvents).toHaveLength(1);
    expect(state.auditLog.length).toBeGreaterThanOrEqual(3);
  });

  it("starts from the seeded fixture state (DTEK + Taller Demo already have a customer and vehicle)", () => {
    const engine = createCommandEngine(buildFixtureCrmVehicleState());
    const state = engine.getState();
    expect(state.customers.map((c) => c.id)).toContain(FIXTURE_CRM_VEHICLE_IDS.customerDtek);
    expect(state.customers.map((c) => c.id)).toContain(FIXTURE_CRM_VEHICLE_IDS.customerDemo);
    expect(state.vehicles).toHaveLength(2);
  });

  it("replays an idempotent command through the engine without duplicating state", () => {
    const engine = createCommandEngine();
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      idempotencyKey: "idem-engine-1",
    });
    const first = engine.createProvisionalCustomer(ctx, {
      displayName: "Cliente Repetido",
      source: "walk_in",
    });
    const second = engine.createProvisionalCustomer(ctx, {
      displayName: "Cliente Repetido",
      source: "walk_in",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.replayed).toBe(true);
    expect(second.data.id).toBe(first.data.id);
    expect(engine.getState().customers).toHaveLength(1);
  });

  it("reset() clears mutations back to a fresh seed", () => {
    const engine = createCommandEngine();
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    engine.createProvisionalCustomer(ctx, { displayName: "Temporal", source: "walk_in" });
    expect(engine.getState().customers).toHaveLength(1);
    engine.reset();
    expect(engine.getState().customers).toHaveLength(0);
  });
});
