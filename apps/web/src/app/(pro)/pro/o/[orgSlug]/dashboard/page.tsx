import { getDashboardViewModel } from "@datatek/application";
import {
  Badge,
  Card,
  DataTable,
  DateTimeText,
  LinkButton,
  PageTitle,
  StatusPill,
} from "@datatek/ui";

export default async function ProDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const vm = getDashboardViewModel(orgSlug);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <PageTitle>{vm.organizationName}</PageTitle>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Casos abiertos</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{vm.openCasesCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Esperando autorización</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{vm.casesWaitingAuthorization}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Listos para entrega</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{vm.casesReadyForDelivery}</p>
        </Card>
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Casos recientes
        </h2>
        <DataTable
          caption="Casos recientes"
          rowKey={(row) => row.id}
          rows={vm.recentCases}
          columns={[
            {
              key: "code",
              header: "Caso",
              render: (row) => (
                <LinkButton href={`/pro/o/${orgSlug}/cases/${row.id}`} variant="ghost" size="sm">
                  {row.code}
                </LinkButton>
              ),
            },
            { key: "customer", header: "Cliente", render: (row) => row.customerName },
            { key: "vehicle", header: "Vehículo", render: (row) => row.vehicleLabel },
            {
              key: "status",
              header: "Estado",
              render: (row) => <StatusPill label={row.status} tone="info" />,
            },
            { key: "next", header: "Siguiente acción", render: (row) => row.nextAction },
            {
              key: "updated",
              header: "Actualizado",
              render: (row) => <DateTimeText value={row.updatedAt} mode="relative" />,
            },
          ]}
        />
      </section>
    </div>
  );
}
