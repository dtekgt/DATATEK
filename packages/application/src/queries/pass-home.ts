// `getPassHome` — DATATEK_R0_D sección 3.1. Vehicles a Pass customer sees
// come ONLY from `vehicle_access_grants` (never a VIN/plate lookup —
// DATATEK_R0_A sección 5: "VIN/placa no otorgan lectura"), scoped to the
// resolved customer and organization in `ctx`.
import type { CrmVehicleState, VehicleRow } from "../commands/state.ts";
import type { PassHomeViewModel, PassVehicleSummary } from "../viewmodels/pass.ts";
import { deriveVehicleNowFact } from "./vehicle-now.ts";
import { buildVehicleLabel, firstNameOf } from "./shared.ts";
import type { QueryContext } from "./types.ts";

export function getPassHome(state: CrmVehicleState, ctx: QueryContext): PassHomeViewModel {
  const customer = state.customers.find(
    (c) => c.id === ctx.actorId && c.organizationId === ctx.organizationId,
  );

  const activeGrants = state.vehicleAccessGrants.filter(
    (g) =>
      g.organizationId === ctx.organizationId &&
      g.grantedToCustomerId === ctx.actorId &&
      g.revokedAt == null,
  );

  const vehicles: PassVehicleSummary[] = activeGrants
    .map((g) => state.vehicles.find((v) => v.id === g.vehicleId))
    .filter((v): v is VehicleRow => v != null)
    .map((v) => ({
      id: v.id,
      label: buildVehicleLabel(v),
      plate: v.primaryPlate ?? "",
      now: deriveVehicleNowFact(state, ctx, v.id),
    }));

  return {
    demo: false,
    customerFirstName: firstNameOf(customer?.displayName),
    vehicles,
    selectedVehicleId: vehicles[0]?.id ?? null,
  };
}
