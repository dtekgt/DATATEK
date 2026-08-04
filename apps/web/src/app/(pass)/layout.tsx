import { getPassHome, getVehicleNow } from "@datatek/application/commands";
import { PassShellLayout, type PassVehicleRail } from "../../components/pass-shell-layout";
import { getCommandsEngine } from "../../lib/commands-engine";
import { resolvePassActor } from "../../lib/pass-actor";

export default function PassLayout({ children }: { children: React.ReactNode }) {
  const actor = resolvePassActor();
  let vehicleRail: PassVehicleRail | undefined;

  if (actor) {
    const state = getCommandsEngine().getState();
    const ctx = {
      organizationId: actor.organizationId,
      audience: "pass" as const,
      actorId: actor.actorId,
      now: new Date(),
    };
    const home = getPassHome(state, ctx);
    const vehicleId = home.selectedVehicleId ?? home.vehicles[0]?.id;
    const selected = vehicleId ? home.vehicles.find((vehicle) => vehicle.id === vehicleId) : null;

    if (vehicleId && selected) {
      const now = getVehicleNow(state, ctx, vehicleId);
      vehicleRail = {
        vehicleLabel: selected.label,
        statusHeadline: now.headline,
        statusSource: now.source,
        statusObservedAt: now.observedAt,
      };
    }
  }

  return <PassShellLayout vehicleRail={vehicleRail}>{children}</PassShellLayout>;
}
