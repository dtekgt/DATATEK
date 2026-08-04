import { buildVehicleLabel, getProCaseExperience } from "@datatek/application/commands";
import { getCaseListViewModel } from "@datatek/application";
import { Badge, DataTable, DateTimeText, LinkButton, PageTitle, StatusPill } from "@datatek/ui";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

interface CaseRow {
  id: string;
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: string;
  nextAction: string;
  updatedAt: string;
}

export default async function ProCasesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  // Same server-side gate as the case workspace page — only ever reads real
  // engine data when this actor's membership actually grants "intake.read"
  // in THIS org, not merely when a session cookie exists (see the comment
  // on `cases/[caseId]/page.tsx`).
  const session = await getWebSession(orgSlug, "intake.read");

  let realCases: CaseRow[] = [];
  if (session.accessState.kind === "allowed" && session.organizationId && session.actorId) {
    const ctx = {
      organizationId: session.organizationId,
      audience: "pro" as const,
      actorId: session.actorId,
      now: new Date(),
    };
    const state = getCommandsEngine().getState();
    const cases = state.cases.filter((c) => c.organizationId === session.organizationId);
    realCases = cases
      .map((c): CaseRow | null => {
        const experience = getProCaseExperience(state, ctx, c.id);
        if (!experience) return null;
        const customer = state.customers.find((cu) => cu.id === c.customerId);
        const vehicle = state.vehicles.find((v) => v.id === c.vehicleId);
        const latestEvent = state.caseStatusEvents
          .filter((e) => e.caseId === c.id)
          .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
        return {
          id: c.id,
          code: c.folioCode,
          customerName: customer?.displayName ?? "Cliente",
          vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehículo",
          status: c.status,
          nextAction: experience.nextAction.primaryAction,
          updatedAt: latestEvent?.occurredAt ?? c.openedAt,
        };
      })
      .filter((row): row is CaseRow => row != null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  const demoVm = getCaseListViewModel(orgSlug);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <PageTitle>Casos reales</PageTitle>
          <Badge tone="success">Motor de comandos</Badge>
        </div>
        <DataTable
          caption="Casos reales de esta organización"
          rowKey={(row) => row.id}
          rows={realCases}
          emptyLabel="Todavía no hay casos reales en el motor de comandos para esta organización. Créalos vía /api/dev/commands."
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
            { key: "nextAction", header: "Siguiente acción", render: (row) => row.nextAction },
            {
              key: "updated",
              header: "Actualizado",
              render: (row) => <DateTimeText value={row.updatedAt} mode="relative" />,
            },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Casos de ejemplo</h2>
          <Badge tone="neutral">DEMO DATA</Badge>
        </div>
        <DataTable
          caption="Lista de casos de ejemplo"
          rowKey={(row) => row.id}
          rows={demoVm.items}
          emptyLabel="Sin casos de ejemplo."
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
    </div>
  );
}
