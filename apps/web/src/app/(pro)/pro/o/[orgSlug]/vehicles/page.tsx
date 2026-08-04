import { buildVehicleLabel } from "@datatek/application/commands";
import {
  Badge,
  DataTable,
  DateTimeText,
  EmptyState,
  LinkButton,
  OdometerText,
  PageTitle,
} from "@datatek/ui";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

interface VehicleRow {
  id: string;
  label: string;
  plate: string;
  customerName: string;
  odometerKm: number | null;
  odometerReadAt: string | null;
  cases: number;
  createdAt: string;
}

export default async function ProVehiclesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getWebSession(orgSlug, "vehicle.read");
  const state = getCommandsEngine().getState();
  let rows: VehicleRow[] = [];

  if (session.accessState.kind === "allowed" && session.organizationId) {
    const organizationId = session.organizationId;
    const grantByVehicle = new Map<string, (typeof state.vehicleAccessGrants)[number]>();
    for (const grant of state.vehicleAccessGrants) {
      if (
        grant.organizationId === organizationId &&
        grant.revokedAt === null &&
        !grantByVehicle.has(grant.vehicleId)
      ) {
        grantByVehicle.set(grant.vehicleId, grant);
      }
    }

    rows = [...grantByVehicle.values()]
      .flatMap((grant) => {
        const vehicle = state.vehicles.find((row) => row.id === grant.vehicleId);
        if (!vehicle) return [];
        const customer = grant.grantedToCustomerId
          ? state.customers.find(
              (row) =>
                row.id === grant.grantedToCustomerId && row.organizationId === organizationId,
            )
          : null;
        const latestOdometer = state.vehicleOdometerEvents
          .filter(
            (event) => event.organizationId === organizationId && event.vehicleId === vehicle.id,
          )
          .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];
        return [
          {
            id: vehicle.id,
            label: buildVehicleLabel(vehicle),
            plate: vehicle.primaryPlate ?? "Sin placa",
            customerName: customer?.displayName ?? "Sin cliente relacionado",
            odometerKm: latestOdometer?.valueKm ?? null,
            odometerReadAt: latestOdometer?.recordedAt ?? null,
            cases: state.cases.filter(
              (kase) => kase.organizationId === organizationId && kase.vehicleId === vehicle.id,
            ).length,
            createdAt: vehicle.createdAt,
          },
        ];
      })
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">PRO · VEHÍCULOS DEL TALLER</Badge>
          <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
        </div>
        <PageTitle className="mt-3">Vehículos</PageTitle>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-400)]">
          Pro ve únicamente vehículos con una relación o acceso explícito para este taller. No es un
          buscador global de conductores.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Todavía no hay vehículos"
          description="Registra el primero al abrir un caso. La relación queda ligada al cliente y al taller."
          action={
            <LinkButton href={`/pro/o/${orgSlug}/cases?new=1`} variant="secondary" size="sm">
              Abrir primer caso
            </LinkButton>
          }
        />
      ) : (
        <DataTable
          caption="Vehículos accesibles para este taller"
          rowKey={(row) => row.id}
          rows={rows}
          columns={[
            {
              key: "vehicle",
              header: "Vehículo",
              render: (row) => (
                <LinkButton href={`/pro/o/${orgSlug}/vehicles/${row.id}`} variant="ghost" size="sm">
                  {row.label}
                </LinkButton>
              ),
            },
            { key: "plate", header: "Placa", render: (row) => row.plate },
            { key: "customer", header: "Cliente", render: (row) => row.customerName },
            {
              key: "odometer",
              header: "Último odómetro",
              render: (row) => (
                <OdometerText km={row.odometerKm} readAt={row.odometerReadAt ?? undefined} />
              ),
            },
            { key: "cases", header: "Casos", render: (row) => row.cases },
            {
              key: "created",
              header: "Registrado",
              render: (row) => <DateTimeText value={row.createdAt} />,
            },
          ]}
        />
      )}
    </div>
  );
}
