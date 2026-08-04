import { buildVehicleLabel, getProCaseExperience } from "@datatek/application/commands";
import { friendlyCaseStatus } from "@datatek/application";
import type { CaseStatus } from "@datatek/domain";
import {
  Badge,
  Card,
  DataTable,
  DateTimeText,
  EmptyState,
  LinkButton,
  PageTitle,
  StatusPill,
} from "@datatek/ui";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

interface DashboardCaseRow {
  id: string;
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: CaseStatus;
  nextAction: string;
  updatedAt: string;
}

export default async function ProDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getWebSession(orgSlug, "intake.read");
  const state = getCommandsEngine().getState();

  let rows: DashboardCaseRow[] = [];
  let organizationName = "Taller";
  if (session.accessState.kind === "allowed" && session.organizationId && session.actorId) {
    organizationName =
      session.availableOrganizations.find((org) => org.id === session.organizationId)?.label ??
      "Taller";
    const ctx = {
      organizationId: session.organizationId,
      audience: "pro" as const,
      actorId: session.actorId,
      now: new Date(),
    };

    rows = state.cases
      .filter((kase) => kase.organizationId === session.organizationId)
      .map((kase): DashboardCaseRow | null => {
        const experience = getProCaseExperience(state, ctx, kase.id);
        if (!experience) return null;
        const customer = state.customers.find((row) => row.id === kase.customerId);
        const vehicle = state.vehicles.find((row) => row.id === kase.vehicleId);
        const latestEvent = state.caseStatusEvents
          .filter((event) => event.caseId === kase.id)
          .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
        return {
          id: kase.id,
          code: kase.folioCode,
          customerName: customer?.displayName ?? "Cliente",
          vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehículo",
          status: kase.status,
          nextAction: experience.nextAction.primaryAction,
          updatedAt: latestEvent?.occurredAt ?? kase.openedAt,
        };
      })
      .filter((row): row is DashboardCaseRow => row != null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  const openCases = rows.filter((row) => row.status !== "closed").length;
  const waiting = rows.filter((row) => row.status === "waiting_authorization").length;
  const ready = rows.filter((row) => row.status === "ready").length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">PRO · OPERACIÓN DEL TALLER</Badge>
            <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
          </div>
          <PageTitle className="mt-3">Hoy en {organizationName}</PageTitle>
          <p className="mt-2 text-sm text-[var(--color-muted-400)]">
            La vista de trabajo para recibir vehículos, mover casos y solicitar decisiones.
          </p>
        </div>
        <LinkButton href={`/pro/o/${orgSlug}/cases?new=1`} variant="primary">
          Abrir caso
        </LinkButton>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">En operación</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{openCases}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Esperando al cliente</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{waiting}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-[var(--color-muted-400)]">Autorizados para seguir</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{ready}</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          Trabajo reciente
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            title="Todavía no hay trabajo capturado"
            description="Abre el primer caso con los datos mínimos del cliente y el vehículo."
            action={
              <LinkButton href={`/pro/o/${orgSlug}/cases?new=1`} variant="secondary" size="sm">
                Capturar primer caso
              </LinkButton>
            }
          />
        ) : (
          <DataTable
            caption="Casos recientes del taller"
            rowKey={(row) => row.id}
            rows={rows.slice(0, 8)}
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
                render: (row) => <StatusPill label={friendlyCaseStatus(row.status)} tone="info" />,
              },
              { key: "next", header: "Siguiente acción", render: (row) => row.nextAction },
              {
                key: "updated",
                header: "Actualizado",
                render: (row) => <DateTimeText value={row.updatedAt} mode="relative" />,
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
