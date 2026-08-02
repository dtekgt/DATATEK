// Non-enumeration test — DATATEK_R0_D sección 5 ("VIN/placa no otorgan
// lectura; una coincidencia no confirma propietario") and sección 19
// acceptance gate ("VIN/placa no permiten enumeración"). Reuses the exact
// DTEK Servicios / Taller Demo isolation fixtures already proven in R0-C
// (`packages/application/src/fixtures/tenancy.test.ts`), plus the CRM/
// vehicle seed built on top of them in `fixtures.ts`.
import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { buildFixtureCrmVehicleState, FIXTURE_CRM_VEHICLE_IDS } from "./fixtures.ts";
import { registerVehicle, createVehicleOwnershipClaim } from "./vehicle-commands.ts";
import { buildTestContext } from "./test-helpers.ts";

const demoCtx = () =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.ownerDemo,
    organizationId: FIXTURE_ORGANIZATION_IDS.demo,
  });

describe("Non-enumeration — DTEK Servicios vs Taller Demo", () => {
  it("Taller Demo staff cannot claim DTEK's known vehicle id — same neutral NOT_FOUND as a made-up id", () => {
    const state = buildFixtureCrmVehicleState();

    const realDtekVehicleId = FIXTURE_CRM_VEHICLE_IDS.vehicleDtek;
    const madeUpVehicleId = "veh-does-not-exist";

    const outcomeReal = createVehicleOwnershipClaim(state, demoCtx(), {
      customerId: FIXTURE_CRM_VEHICLE_IDS.customerDemo,
      vehicleId: realDtekVehicleId,
      claimKind: "self_reported",
    });
    const outcomeFake = createVehicleOwnershipClaim(state, demoCtx(), {
      customerId: FIXTURE_CRM_VEHICLE_IDS.customerDemo,
      vehicleId: madeUpVehicleId,
      claimKind: "self_reported",
    });

    expect(outcomeReal.ok).toBe(false);
    expect(outcomeFake.ok).toBe(false);
    if (outcomeReal.ok || outcomeFake.ok) return;
    // A real-but-inaccessible id and a fabricated id must be
    // indistinguishable to the caller.
    expect(outcomeReal.error).toEqual(outcomeFake.error);
    expect(outcomeReal.error.code).toBe("NOT_FOUND");
  });

  it("registering DTEK's exact VIN from Taller Demo links privately without exposing DTEK's customer/actor/org", () => {
    const state = buildFixtureCrmVehicleState();
    const dtekVin = "1HGCM82633A004352"; // seeded on FIXTURE_CRM_VEHICLE_IDS.vehicleDtek

    const outcome = registerVehicle(state, demoCtx(), { vin: dtekVin });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // The system DOES route to the same physical vehicle (that is the
    // documented behavior — "crea vehículo o solicitud de vínculo") but the
    // returned shape never contains DTEK's identity, customer, or actor.
    expect(outcome.data.vehicleId).toBe(FIXTURE_CRM_VEHICLE_IDS.vehicleDtek);
    const serialized = JSON.stringify(outcome.data);
    expect(serialized).not.toContain(FIXTURE_ORGANIZATION_IDS.dtek);
    expect(serialized).not.toContain(FIXTURE_ACTOR_IDS.advisorDtek);
    expect(serialized).not.toContain(FIXTURE_CRM_VEHICLE_IDS.customerDtek);

    // Taller Demo's own access grant is newly minted and scoped to Taller
    // Demo only — DTEK's original grant is untouched and still the only
    // grant belonging to DTEK.
    const demoGrants = outcome.nextState.vehicleAccessGrants.filter(
      (g) =>
        g.organizationId === FIXTURE_ORGANIZATION_IDS.demo &&
        g.vehicleId === outcome.data.vehicleId,
    );
    const dtekGrants = outcome.nextState.vehicleAccessGrants.filter(
      (g) =>
        g.organizationId === FIXTURE_ORGANIZATION_IDS.dtek &&
        g.vehicleId === outcome.data.vehicleId,
    );
    expect(demoGrants).toHaveLength(1);
    expect(dtekGrants).toHaveLength(1);
  });

  it("an actor with no membership anywhere gets FORBIDDEN, never a hint about DTEK's data", () => {
    const state = buildFixtureCrmVehicleState();
    const ctx = buildTestContext({
      actorId: "u-no-membership-anywhere",
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = registerVehicle(state, ctx, { vin: "1HGCM82633A004352" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("MEMBERSHIP_INACTIVE");
  });
});
