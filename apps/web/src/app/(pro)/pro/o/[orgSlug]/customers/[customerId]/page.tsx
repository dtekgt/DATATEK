import { notFound } from "next/navigation";
import { buildVehicleLabel } from "@datatek/application/commands";
import { friendlyCaseStatus } from "@datatek/application";
import {
  Badge,
  Card,
  DataTable,
  DateTimeText,
  LinkButton,
  PageTitle,
  StatusPill,
} from "@datatek/ui";
import { getWebSession } from "../../../../../../../lib/fixture-session";
import { getReadState } from "../../../../../../../lib/commands-engine";

export default async function ProCustomerDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; customerId: string }>;
}) {
  const { orgSlug, customerId } = await params;
  const session = await getWebSession(orgSlug, "crm.read");

  if (session.accessState.kind !== "allowed" || !session.organizationId || !session.actorId)
    notFound();
  const organizationId = session.organizationId;
  const state = await getReadState(session.actorId, organizationId);
  const customer = state.customers.find(
    (row) => row.id === customerId && row.organizationId === organizationId,
  );
  if (!customer) notFound();

  const contacts = state.customerContacts.filter((row) => row.customerId === customer.id);
  const vehicleIds = [
    ...new Set(
      state.vehicleAccessGrants
        .filter(
          (grant) =>
            grant.organizationId === organizationId &&
            grant.grantedToCustomerId === customer.id &&
            grant.revokedAt === null,
        )
        .map((grant) => grant.vehicleId),
    ),
  ];
  const vehicles = vehicleIds.flatMap((id) => {
    const vehicle = state.vehicles.find((row) => row.id === id);
    return vehicle ? [{ id: vehicle.id, label: buildVehicleLabel(vehicle) }] : [];
  });
  const cases = state.cases
    .filter((kase) => kase.organizationId === organizationId && kase.customerId === customer.id)
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">PRO · FICHA DEL TALLER</Badge>
          <Badge tone={customer.status === "active" ? "success" : "neutral"}>
            {customer.status === "active" ? "Cuenta Pass vinculada" : "Sin cuenta Pass"}
          </Badge>
        </div>
        <PageTitle className="mt-3">{customer.displayName}</PageTitle>
        <p className="mt-2 text-sm text-[var(--color-muted-400)]">
          Esta ficha es interna del taller. Pass nunca recibe notas, costos internos ni permisos de
          operación.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Contacto</p>
          <p className="mt-2 font-medium">{contacts[0]?.rawValue ?? "Sin contacto registrado"}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-400)]">
            {contacts[0]?.verified ? "Verificado" : "No verificado"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Vehículos</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{vehicles.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Casos</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{cases.length}</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Vehículos relacionados
        </h2>
        {vehicles.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-400)]">Sin vehículos relacionados.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <Card className="p-4">
                  <LinkButton
                    href={`/pro/o/${orgSlug}/vehicles/${vehicle.id}`}
                    variant="ghost"
                    size="sm"
                  >
                    {vehicle.label}
                  </LinkButton>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Historial con este taller
        </h2>
        <DataTable
          caption="Casos del cliente"
          rowKey={(row) => row.id}
          rows={cases}
          emptyLabel="Este cliente todavía no tiene casos."
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
