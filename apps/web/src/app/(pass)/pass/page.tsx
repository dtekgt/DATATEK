import {
  getPassHomeViewModel,
  getVehicleNowViewModel,
  getImmediateDecisionsViewModel,
  getNextServiceViewModel,
  getVehiclePassportViewModel,
} from "@datatek/application";
import {
  VehicleNowCard,
  ImmediateDecisionStack,
  NextServiceCard,
  VehicleTimeline,
  Badge,
  Card,
  LinkButton,
} from "@datatek/ui";

export default function PassHomePage() {
  const home = getPassHomeViewModel();
  const vehicleId = home.selectedVehicleId ?? home.vehicles[0]?.id ?? "";
  const now = getVehicleNowViewModel(vehicleId);
  const decisions = getImmediateDecisionsViewModel(vehicleId);
  const nextService = getNextServiceViewModel(vehicleId);
  const passport = getVehiclePassportViewModel(vehicleId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Hola, {home.customerFirstName}</h1>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>

      <section aria-label="Estado actual">
        <VehicleNowCard vm={now} />
      </section>

      <section aria-label="Decisiones inmediatas">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Decisiones que necesitan tu atención
        </h2>
        <ImmediateDecisionStack vm={decisions} />
      </section>

      <section aria-label="Próximo servicio">
        <NextServiceCard vm={nextService} />
      </section>

      <section aria-label="Historial">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Historial
        </h2>
        <VehicleTimeline entries={passport.timeline} />
      </section>

      <section aria-label="Documentos">
        <Card>
          <p className="text-sm font-medium">Documentos</p>
          <p className="mt-1 text-sm text-[var(--color-muted-400)]">
            {passport.documentsCount} documento(s) disponibles en el pasaporte del vehículo.
          </p>
        </Card>
      </section>

      <section aria-label="Beneficios">
        <LinkButton href="/pass/benefits" variant="secondary">
          Ver beneficios
        </LinkButton>
      </section>
    </div>
  );
}
