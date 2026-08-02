import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { createEmptyState } from "./state.ts";
import { createProvisionalCustomer } from "./crm-commands.ts";
import {
  registerVehicle,
  createVehicleOwnershipClaim,
  recordOdometerEvent,
} from "./vehicle-commands.ts";
import { buildTestContext } from "./test-helpers.ts";

const dtekCtx = () =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
  });

describe("RegisterVehicle", () => {
  it("creates a new vehicle, grants access, and creates a provisional claim when a customer is given", () => {
    const ctx = dtekCtx();
    const customer = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });
    if (!customer.ok) throw new Error("setup failed");

    const outcome = registerVehicle(customer.nextState, ctx, {
      vin: "1HGCM82633A004352",
      plate: "P-123ABC",
      make: "Toyota",
      model: "Corolla",
      year: 2018,
      customerId: customer.data.id,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.linkedToExistingVehicle).toBe(false);
    expect(outcome.data.ownershipClaimId).not.toBeNull();
    expect(outcome.nextState.vehicles).toHaveLength(1);
    expect(outcome.nextState.vehicleIdentifiers).toHaveLength(2);
    expect(outcome.nextState.vehicleAccessGrants).toHaveLength(1);
    expect(outcome.nextState.vehicleOwnershipClaims).toHaveLength(1);
    expect(outcome.nextState.vehicleOwnershipClaims[0]?.status).toBe("provisional");
  });

  it("requires at least a VIN or a plate", () => {
    const outcome = registerVehicle(createEmptyState(), dtekCtx(), {});
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("normalizes VIN/plate before searching, so casing/spacing does not create duplicates", () => {
    const ctx = dtekCtx();
    const first = registerVehicle(createEmptyState(), ctx, { vin: "1hgcm82633a004352" });
    if (!first.ok) throw new Error("setup failed");

    const secondCtx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const second = registerVehicle(first.nextState, secondCtx, { vin: " 1HGCM82633A004352 " });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.linkedToExistingVehicle).toBe(true);
    expect(second.data.vehicleId).toBe(first.data.vehicleId);
    expect(second.nextState.vehicles).toHaveLength(1);
  });

  it("links to an existing vehicle without duplicating it when another organization already registered the same VIN, and never exposes that other organization", () => {
    const demoCtx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.ownerDemo,
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    });
    const demoRegistration = registerVehicle(createEmptyState(), demoCtx, {
      vin: "KNADH4A31F6123456",
    });
    if (!demoRegistration.ok) throw new Error("setup failed");

    const dtekRegistration = registerVehicle(demoRegistration.nextState, dtekCtx(), {
      vin: "KNADH4A31F6123456",
    });
    expect(dtekRegistration.ok).toBe(true);
    if (!dtekRegistration.ok) return;
    expect(dtekRegistration.data.linkedToExistingVehicle).toBe(true);
    expect(dtekRegistration.data.vehicleId).toBe(demoRegistration.data.vehicleId);
    // Exactly one global vehicle row exists — never duplicated by the match.
    expect(dtekRegistration.nextState.vehicles).toHaveLength(1);
    // Each org gets its own access grant; DTEK's registration never reveals
    // Taller Demo's grant/customer/actor in its return value.
    expect(dtekRegistration.nextState.vehicleAccessGrants).toHaveLength(2);
    expect(Object.keys(dtekRegistration.data)).not.toContain("registeredByOrganizationId");
  });
});

describe("CreateVehicleOwnershipClaim", () => {
  it("creates a provisional claim (never verified ownership) when the org already has access", () => {
    const ctx = dtekCtx();
    const customer = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });
    if (!customer.ok) throw new Error("setup failed");
    const vehicle = registerVehicle(customer.nextState, ctx, { vin: "1HGCM82633A004352" });
    if (!vehicle.ok) throw new Error("setup failed");

    const outcome = createVehicleOwnershipClaim(vehicle.nextState, ctx, {
      customerId: customer.data.id,
      vehicleId: vehicle.data.vehicleId,
      claimKind: "self_reported",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("provisional");
  });

  it("returns a neutral not-found for a vehicle id this organization has no access grant for", () => {
    const demoCtx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.ownerDemo,
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    });
    const demoCustomer = createProvisionalCustomer(createEmptyState(), demoCtx, {
      displayName: "Cliente Demo",
      source: "walk_in",
    });
    if (!demoCustomer.ok) throw new Error("setup failed");

    const dtekVehicle = registerVehicle(demoCustomer.nextState, dtekCtx(), {
      vin: "1HGCM82633A004352",
    });
    if (!dtekVehicle.ok) throw new Error("setup failed");

    // Demo actor guesses DTEK's exact vehicle id — still no access.
    const outcome = createVehicleOwnershipClaim(dtekVehicle.nextState, demoCtx, {
      customerId: demoCustomer.data.id,
      vehicleId: dtekVehicle.data.vehicleId,
      claimKind: "self_reported",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NOT_FOUND");
  });
});

describe("RecordOdometerEvent", () => {
  function registerVehicleWithAccess() {
    const ctx = dtekCtx();
    const vehicle = registerVehicle(createEmptyState(), ctx, { vin: "1HGCM82633A004352" });
    if (!vehicle.ok) throw new Error("setup failed");
    return { ctx, vehicle };
  }

  it("accepts the first reading for a vehicle", () => {
    const { ctx, vehicle } = registerVehicleWithAccess();
    const outcome = recordOdometerEvent(vehicle.nextState, ctx, {
      vehicleId: vehicle.data.vehicleId,
      value: 84210,
      unit: "km",
      recordedAt: "2026-07-20T15:00:00.000Z",
      provenance: "observed",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("accepted");
    expect(outcome.data.valueKm).toBe(84210);
  });

  it("flags a lower/atypical reading as a conflict instead of overwriting the previous one", () => {
    const { vehicle } = registerVehicleWithAccess();
    const firstCtx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });
    const first = recordOdometerEvent(vehicle.nextState, firstCtx, {
      vehicleId: vehicle.data.vehicleId,
      value: 80000,
      unit: "km",
      recordedAt: "2026-07-01T10:00:00.000Z",
      provenance: "observed",
    });
    if (!first.ok) throw new Error("setup failed");

    const secondCtx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      now: new Date("2026-07-15T00:00:00.000Z"),
    });
    const second = recordOdometerEvent(first.nextState, secondCtx, {
      vehicleId: vehicle.data.vehicleId,
      value: 70000,
      unit: "km",
      recordedAt: "2026-07-15T10:00:00.000Z",
      provenance: "reported",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.status).toBe("conflict");
    expect(second.data.conflictReason).toBe("regression");
    // Both readings are kept — nothing was overwritten.
    expect(second.nextState.vehicleOdometerEvents).toHaveLength(2);
    expect(second.nextState.vehicleOdometerEvents[0]?.valueKm).toBe(80000);
  });

  it("rejects a non-integer/negative value before touching state", () => {
    const { ctx, vehicle } = registerVehicleWithAccess();
    const outcome = recordOdometerEvent(vehicle.nextState, ctx, {
      vehicleId: vehicle.data.vehicleId,
      value: -1,
      unit: "km",
      recordedAt: "2026-07-01T10:00:00.000Z",
      provenance: "observed",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });
});
