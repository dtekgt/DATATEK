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
  /** Fila = una relación de acceso (grant), no un vehículo — dos clientes
   * distintos con un grant activo sobre el mismo vehículo físico (mismo VIN/
   * placa, sección 5 "una coincidencia no confirma propietario") producen
   * dos filas, no una que oculte a la segunda. `grantId` es la llave de
   * React; `id` sigue siendo el del vehículo porque el detalle
   * (`/vehicles/[vehicleId]`) es por vehículo, no por grant. */
  grantId: string;
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
    // Una fila por grant activo, no por vehículo: el mismo vehículo físico
    // (mismo VIN/placa) puede tener un grant activo para más de un cliente
    // en esta organización a la vez — RegisterVehicle nunca fusiona al
    // coincidir (sección 5 "una coincidencia no confirma propietario"),
    // solo agrega un nuevo grant. Deduplicar por vehicleId ocultaba en
    // silencio a todos los clientes menos el del primer grant encontrado —
    // hallado a mano el 2026-08-04 al abrir un caso para un cliente nuevo
    // con una placa que ya tenía un grant de otro cliente.
    const activeGrants = state.vehicleAccessGrants.filter(
      (grant) => grant.organizationId === organizationId && grant.revokedAt === null,
    );

    rows = activeGrants
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
            grantId: grant.id,
            id: vehicle.id,
            label: buildVehicleLabel(vehicle),
            plate: vehicle.primaryPlate ?? "Sin placa",
            customerName: customer?.displayName ?? "Sin cliente relacionado",
            odometerKm: latestOdometer?.valueKm ?? null,
            odometerReadAt: latestOdometer?.recordedAt ?? null,
            // Acotado al cliente de ESTE grant, no a todo el vehículo: si
            // dos clientes comparten el vehículo, cada fila cuenta solo sus
            // propios casos, para no sumarle a uno los casos del otro.
            cases: state.cases.filter(
              (kase) =>
                kase.organizationId === organizationId &&
                kase.vehicleId === vehicle.id &&
                kase.customerId === grant.grantedToCustomerId,
            ).length,
            createdAt: vehicle.createdAt,
          },
        ];
      })
      .sort(
        (a, b) => a.label.localeCompare(b.label, "es") || a.customerName.localeCompare(b.customerName, "es"),
      );
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
          rowKey={(row) => row.grantId}
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
