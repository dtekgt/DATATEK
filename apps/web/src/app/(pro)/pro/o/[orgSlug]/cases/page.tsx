import { buildVehicleLabel, getProCaseExperience } from "@datatek/application/commands";
import { getCaseListViewModel } from "@datatek/application";
import { Badge, DataTable, DateTimeText, LinkButton, PageTitle, StatusPill } from "@datatek/ui";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";
import { NewCaseForm } from "./new-case-form";

interface CaseRow {
  id: string;
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: string;
  nextAction: string;
  updatedAt: string;
}

export default async function ProCasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { orgSlug } = await params;
  const { new: newCase } = await searchParams;
  // Same server-side gate as the case workspace page — only ever reads real
  // engine data when this actor's membership actually grants "intake.read"
  // in THIS org, not merely when a session cookie exists (see the comment
  // on `cases/[caseId]/page.tsx`).
  const session = await getWebSession(orgSlug, "intake.read");

  let realCases: CaseRow[] = [];
  let customerOptions: { id: string; label: string }[] = [];
  let vehicleOptions: { id: string; customerId: string; label: string }[] = [];
  if (session.accessState.kind === "allowed" && session.organizationId && session.actorId) {
    const ctx = {
      organizationId: session.organizationId,
      audience: "pro" as const,
      actorId: session.actorId,
      now: new Date(),
    };
    const state = getCommandsEngine().getState();
    customerOptions = state.customers
      .filter((customer) => customer.organizationId === session.organizationId)
      .map((customer) => ({ id: customer.id, label: customer.displayName }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));

    const seenGrants = new Set<string>();
    vehicleOptions = state.vehicleAccessGrants
      .filter(
        (grant) =>
          grant.organizationId === session.organizationId &&
          grant.grantedToCustomerId != null &&
          grant.revokedAt === null,
      )
      .flatMap((grant) => {
        const key = `${grant.grantedToCustomerId}:${grant.vehicleId}`;
        if (seenGrants.has(key)) return [];
        seenGrants.add(key);
        const vehicle = state.vehicles.find((row) => row.id === grant.vehicleId);
        return vehicle
          ? [
              {
                id: vehicle.id,
                customerId: grant.grantedToCustomerId!,
                label: buildVehicleLabel(vehicle),
              },
            ]
          : [];
      });

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

  if (newCase === "1") {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">PRO · OPERACIÓN DEL TALLER</Badge>
            <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
          </div>
          <PageTitle className="mt-3">Abrir un caso</PageTitle>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-400)]">
            Este es el punto de entrada del trabajo interno. El conductor verá después únicamente la
            información aprobada para Datatek Pass.
          </p>
        </header>
        <NewCaseForm orgSlug={orgSlug} customers={customerOptions} vehicles={vehicleOptions} />
      </div>
    );
  }

  const demoVm = getCaseListViewModel(orgSlug);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">PRO · OPERACIÓN DEL TALLER</Badge>
            <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
          </div>
          <PageTitle className="mt-3">Casos del taller</PageTitle>
          <p className="mt-2 text-sm text-[var(--color-muted-400)]">
            Aquí el equipo recibe, organiza y mueve cada trabajo. Pass solo muestra la vista del
            cliente.
          </p>
        </div>
        <LinkButton href={`/pro/o/${orgSlug}/cases?new=1`} variant="primary">
          Abrir caso
        </LinkButton>
      </header>

      <div className="flex flex-col gap-2">
        <DataTable
          caption="Casos capturados en esta sesión"
          rowKey={(row) => row.id}
          rows={realCases}
          emptyLabel="Todavía no hay casos capturados en esta sesión. Usa “Abrir caso” para registrar el primero."
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
          <h2 className="text-lg font-semibold">Ejemplo guiado</h2>
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
