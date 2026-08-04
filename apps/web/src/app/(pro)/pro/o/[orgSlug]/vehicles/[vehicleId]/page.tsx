import { notFound } from "next/navigation";
import { friendlyCaseStatus } from "@datatek/application";
import { buildVehicleLabel } from "@datatek/application/commands";
import {
  Badge,
  Card,
  DataTable,
  DateTimeText,
  OdometerText,
  LinkButton,
  PageTitle,
  StatusPill,
} from "@datatek/ui";
import { getWebSession } from "../../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../../lib/commands-engine";

export default async function ProVehicleDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; vehicleId: string }>;
}) {
  const { orgSlug, vehicleId } = await params;
  const session = await getWebSession(orgSlug, "vehicle.read");
  const state = getCommandsEngine().getState();
  if (session.accessState.kind !== "allowed" || !session.organizationId) notFound();
  const organizationId = session.organizationId;

  const grants = state.vehicleAccessGrants.filter(
    (grant) =>
      grant.organizationId === organizationId &&
      grant.vehicleId === vehicleId &&
      grant.revokedAt === null,
  );
  const vehicle = grants.length > 0 ? state.vehicles.find((row) => row.id === vehicleId) : null;
  if (!vehicle) notFound();

  const customerIds = [
    ...new Set(grants.map((grant) => grant.grantedToCustomerId).filter(Boolean)),
  ] as string[];
  const customers = state.customers.filter(
    (row) => row.organizationId === organizationId && customerIds.includes(row.id),
  );
  const odometerEvents = state.vehicleOdometerEvents
    .filter((event) => event.organizationId === organizationId && event.vehicleId === vehicle.id)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const latestOdometer = odometerEvents[0];
  const cases = state.cases
    .filter((kase) => kase.organizationId === organizationId && kase.vehicleId === vehicle.id)
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">PRO · PASAPORTE TÉCNICO INTERNO</Badge>
          <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
        </div>
        <PageTitle className="mt-3">{buildVehicleLabel(vehicle)}</PageTitle>
        <p className="mt-2 text-sm text-[var(--color-muted-400)]">
          El taller ve el expediente operativo. Pass proyecta después una versión limitada y
          explicada para el conductor.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Identificación</p>
          <p className="mt-2 font-medium">Placa {vehicle.primaryPlate ?? "sin registrar"}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-400)]">
            VIN {vehicle.primaryVin ?? "sin registrar"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Último odómetro</p>
          <p className="mt-2 font-medium">
            <OdometerText
              km={latestOdometer?.valueKm ?? null}
              readAt={latestOdometer?.recordedAt}
            />
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Cliente relacionado</p>
          <div className="mt-2 flex flex-col gap-1">
            {customers.length > 0 ? (
              customers.map((customer) => (
                <LinkButton
                  key={customer.id}
                  href={`/pro/o/${orgSlug}/customers/${customer.id}`}
                  variant="ghost"
                  size="sm"
                >
                  {customer.displayName}
                </LinkButton>
              ))
            ) : (
              <span className="text-sm text-[var(--color-muted-400)]">Sin relación local</span>
            )}
          </div>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Historial del taller
        </h2>
        <DataTable
          caption="Casos del vehículo en este taller"
          rowKey={(row) => row.id}
          rows={cases}
          emptyLabel="Este vehículo todavía no tiene casos en este taller."
          columns={[
            {
              key: "case",
              header: "Caso",
              render: (row) => (
                <LinkButton href={`/pro/o/${orgSlug}/cases/${row.id}`} variant="ghost" size="sm">
                  {row.folioCode}
                </LinkButton>
              ),
            },
            {
              key: "status",
              header: "Estado",
              render: (row) => <StatusPill label={friendlyCaseStatus(row.status)} tone="info" />,
            },
            {
              key: "opened",
              header: "Apertura",
              render: (row) => <DateTimeText value={row.openedAt} mode="datetime" />,
            },
          ]}
        />
      </section>
    </div>
  );
}
