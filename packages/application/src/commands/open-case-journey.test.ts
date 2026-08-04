import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { buildFixtureCrmVehicleState, FIXTURE_CRM_VEHICLE_IDS } from "./fixtures.ts";
import { buildTestContext } from "./test-helpers.ts";
import { openCaseFromRequest } from "./open-case-journey.ts";

function advisorContext(key: string) {
  return buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    idempotencyKey: key,
  });
}

describe("OpenCaseFromRequest", () => {
  it("opens one complete case from a new customer and vehicle", () => {
    const state = buildFixtureCrmVehicleState();
    const result = openCaseFromRequest(state, advisorContext("open-case-new"), {
      customer: {
        kind: "new",
        displayName: "María López",
        contact: { channel: "whatsapp", value: "+502 5555 0101" },
      },
      vehicle: {
        kind: "new",
        plate: "P999XYZ",
        make: "Mazda",
        model: "CX-5",
        year: 2019,
      },
      channel: "whatsapp_manual",
      reportedText: "Siente vibración al frenar en carretera.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.case.folioCode).toBe("2026-00001");
    expect(result.data.createdCustomer).toBe(true);
    expect(result.data.createdVehicleAccess).toBe(true);
    expect(result.data.contact?.channel).toBe("whatsapp");
    expect(result.nextState.intakeThreads.at(-1)?.status).toBe("converted");
    expect(result.nextState.reportedSymptoms.at(-1)?.description).toContain("vibración");
  });

  it("reuses an existing customer and their explicitly granted vehicle", () => {
    const state = buildFixtureCrmVehicleState();
    const result = openCaseFromRequest(state, advisorContext("open-case-existing"), {
      customer: { kind: "existing", customerId: FIXTURE_CRM_VEHICLE_IDS.customerDtek },
      vehicle: { kind: "existing", vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDtek },
      channel: "walk_in",
      reportedText: "Solicita revisión general de frenos.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.createdCustomer).toBe(false);
    expect(result.data.createdVehicleAccess).toBe(false);
    expect(result.nextState.customers).toHaveLength(state.customers.length);
    expect(result.data.case.customerId).toBe(FIXTURE_CRM_VEHICLE_IDS.customerDtek);
  });

  it("rolls back every intermediate row when vehicle validation fails", () => {
    const state = buildFixtureCrmVehicleState();
    const result = openCaseFromRequest(state, advisorContext("open-case-rollback"), {
      customer: { kind: "new", displayName: "Cliente no persistido" },
      vehicle: { kind: "new", vin: "VIN-CON-I" },
      channel: "phone_manual",
      reportedText: "Ruido al frenar.",
    });

    expect(result.ok).toBe(false);
    expect(state.customers.some((row) => row.displayName === "Cliente no persistido")).toBe(false);
    expect(state.cases).toHaveLength(0);
  });

  it("does not attach a vehicle granted to a different customer", () => {
    const state = buildFixtureCrmVehicleState();
    const result = openCaseFromRequest(state, advisorContext("open-case-private"), {
      customer: { kind: "new", displayName: "Otro cliente" },
      vehicle: { kind: "existing", vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDtek },
      channel: "walk_in",
      reportedText: "Quiere abrir un caso sobre un vehículo ajeno.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});
