import {
  Badge,
  DataTable,
  DateTimeText,
  EmptyState,
  LinkButton,
  PageTitle,
  StatusPill,
} from "@datatek/ui";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

interface CustomerRow {
  id: string;
  name: string;
  status: string;
  primaryContact: string;
  vehicles: number;
  cases: number;
  createdAt: string;
}

export default async function ProCustomersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getWebSession(orgSlug, "crm.read");
  const state = getCommandsEngine().getState();
  let rows: CustomerRow[] = [];

  if (session.accessState.kind === "allowed" && session.organizationId) {
    rows = state.customers
      .filter((customer) => customer.organizationId === session.organizationId)
      .map((customer) => {
        const contact = state.customerContacts.find(
          (row) => row.customerId === customer.id && row.isPrimary,
        );
        const vehicleIds = new Set(
          state.vehicleAccessGrants
            .filter(
              (grant) =>
                grant.organizationId === session.organizationId &&
                grant.grantedToCustomerId === customer.id &&
                grant.revokedAt === null,
            )
            .map((grant) => grant.vehicleId),
        );
        return {
          id: customer.id,
          name: customer.displayName,
          status: customer.status,
          primaryContact: contact?.rawValue ?? "Sin contacto",
          vehicles: vehicleIds.size,
          cases: state.cases.filter(
            (kase) =>
              kase.organizationId === session.organizationId && kase.customerId === customer.id,
          ).length,
          createdAt: customer.createdAt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">PRO · RELACIÓN DEL TALLER</Badge>
          <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
        </div>
        <PageTitle className="mt-3">Clientes</PageTitle>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-400)]">
          Registros locales de este taller. Tener un cliente aquí no le da acceso automático a Pass;
          la cuenta del conductor se vincula y verifica por separado.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Todavía no hay clientes"
          description="El primer registro se crea al abrir un caso, sin obligar al conductor a tener cuenta."
          action={
            <LinkButton href={`/pro/o/${orgSlug}/cases?new=1`} variant="secondary" size="sm">
              Abrir primer caso
            </LinkButton>
          }
        />
      ) : (
        <DataTable
          caption="Clientes de este taller"
          rowKey={(row) => row.id}
          rows={rows}
          columns={[
            {
              key: "name",
              header: "Cliente",
              render: (row) => (
                <LinkButton
                  href={`/pro/o/${orgSlug}/customers/${row.id}`}
                  variant="ghost"
                  size="sm"
                >
                  {row.name}
                </LinkButton>
              ),
            },
            { key: "contact", header: "Contacto", render: (row) => row.primaryContact },
            { key: "vehicles", header: "Vehículos", render: (row) => row.vehicles },
            { key: "cases", header: "Casos", render: (row) => row.cases },
            {
              key: "status",
              header: "Relación",
              render: (row) => (
                <StatusPill
                  label={row.status === "active" ? "Cuenta vinculada" : "Sin cuenta vinculada"}
                  tone={row.status === "active" ? "success" : "neutral"}
                />
              ),
            },
            {
              key: "created",
              header: "Desde",
              render: (row) => <DateTimeText value={row.createdAt} />,
            },
          ]}
        />
      )}
    </div>
  );
}
