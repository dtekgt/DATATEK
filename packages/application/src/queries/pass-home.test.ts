import { describe, it } from "node:test";
import { expect } from "expect";
import { buildReadyToQuoteCase } from "../commands/test-helpers.ts";
import { getPassHome } from "./pass-home.ts";
import { buildQueryContext } from "./query-test-helpers.ts";

describe("getPassHome — DATATEK_R0_D sección 3.1", () => {
  it("lists only the vehicle(s) the customer actually has access to, with a VehicleNow fact each", () => {
    const scenario = buildReadyToQuoteCase("pass-home-ok");
    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });

    const result = getPassHome(scenario.state, ctx);
    // Real engine data, never labeled DEMO DATA — see DemoMarker's comment
    // (viewmodels/shared.ts).
    expect(result.demo).toBe(false);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]?.id).toBe(scenario.vehicleId);
    expect(result.vehicles[0]?.now).toBeTruthy();
    expect(result.selectedVehicleId).toBe(scenario.vehicleId);
  });

  it("a customer with no vehicle access grant sees an empty garage, never someone else's vehicle", () => {
    const scenario = buildReadyToQuoteCase("pass-home-empty");
    const ctx = buildQueryContext({ audience: "pass", actorId: "customer-with-no-grants" });

    const result = getPassHome(scenario.state, ctx);
    expect(result.vehicles).toHaveLength(0);
    expect(result.selectedVehicleId).toBeNull();
  });

  it("customerFirstName is derived from the resolved customer's own display name", () => {
    const scenario = buildReadyToQuoteCase("pass-home-name");
    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getPassHome(scenario.state, ctx);
    expect(result.customerFirstName).toBe("Cliente");
  });
});
