import { getVehiclePassportViewModel, getVehicleNowViewModel } from "@datatek/application";
import {
  VehicleIdentityCard,
  VehicleNowCard,
  VehicleTimeline,
  MaintenanceRadar,
  InspectionChecklist,
  Badge,
  PageTitle,
} from "@datatek/ui";

export default async function VehiclePassportPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const passport = getVehiclePassportViewModel(vehicleId);
  const now = getVehicleNowViewModel(vehicleId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <PageTitle>Pasaporte del vehículo</PageTitle>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      <VehicleIdentityCard
        label={passport.label}
        plate={passport.plate}
        odometerKm={passport.odometerKm}
        odometerReadAt={passport.odometerReadAt}
      />
      <VehicleNowCard vm={now} />
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Mantenimiento
        </h2>
        <MaintenanceRadar items={passport.maintenance} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Frenos (última inspección)
        </h2>
        <InspectionChecklist items={passport.brakes} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Historial
        </h2>
        <VehicleTimeline entries={passport.timeline} />
      </section>
    </div>
  );
}
