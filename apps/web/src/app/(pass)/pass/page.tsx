import {
  getPassHomeViewModel,
  getVehicleNowViewModel,
  getImmediateDecisionsViewModel,
  getNextServiceViewModel,
  getVehiclePassportViewModel,
} from "@datatek/application";
import {
  getPassHome,
  getVehicleNow,
  getImmediateDecisions,
  getNextService,
} from "@datatek/application/commands";
import {
  VehicleNowCard,
  ImmediateDecisionStack,
  NextServiceCard,
  VehicleTimeline,
  Badge,
  Card,
  LinkButton,
  PageTitle,
} from "@datatek/ui";
import { getCommandsEngine } from "../../../lib/commands-engine";
import { resolvePassActor } from "../../../lib/pass-actor";

export default async function PassHomePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; actor?: string }>;
}) {
  const sp = await searchParams;
  const actor = resolvePassActor(sp);

  if (actor) {
    const state = getCommandsEngine().getState();
    const ctx = {
      organizationId: actor.organizationId,
      audience: "pass" as const,
      actorId: actor.actorId,
      now: new Date(),
    };
    const home = getPassHome(state, ctx);
    if (home.vehicles.length > 0) {
      const vehicleId = home.selectedVehicleId ?? home.vehicles[0]!.id;
      const now = getVehicleNow(state, ctx, vehicleId);
      const decisions = getImmediateDecisions(state, ctx, vehicleId);
      const nextService = getNextService(state, ctx, vehicleId);

      return (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <PageTitle>Hola, {home.customerFirstName}</PageTitle>
            <Badge tone="success">Motor de comandos</Badge>
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
            {nextService ? (
              <NextServiceCard vm={nextService} />
            ) : (
              <p className="text-sm text-[var(--color-muted-400)]">
                Todavía no hay una recomendación de próximo servicio para este vehículo.
              </p>
            )}
          </section>

          <section aria-label="Beneficios">
            <LinkButton href="/pass/benefits" variant="secondary">
              Ver beneficios
            </LinkButton>
          </section>
        </div>
      );
    }
  }

  const home = getPassHomeViewModel();
  const vehicleId = home.selectedVehicleId ?? home.vehicles[0]?.id ?? "";
  const now = getVehicleNowViewModel(vehicleId);
  const decisions = getImmediateDecisionsViewModel(vehicleId);
  const nextService = getNextServiceViewModel(vehicleId);
  const passport = getVehiclePassportViewModel(vehicleId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <PageTitle>Hola, {home.customerFirstName}</PageTitle>
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
