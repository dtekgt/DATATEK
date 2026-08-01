import { getCaseListViewModel } from "@datatek/application";
import { Badge, DataTable, DateTimeText, LinkButton, StatusPill } from "@datatek/ui";

export default async function ProCasesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const vm = getCaseListViewModel(orgSlug);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Casos</h1>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      <DataTable
        caption="Lista de casos"
        rowKey={(row) => row.id}
        rows={vm.items}
        emptyLabel="Sin casos abiertos todavía."
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
          {
            key: "updated",
            header: "Actualizado",
            render: (row) => <DateTimeText value={row.updatedAt} mode="relative" />,
          },
        ]}
      />
    </div>
  );
}
