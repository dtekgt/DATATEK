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
import { getReadState } from "../../../../../../lib/commands-engine";

interface DashboardCaseRow {
  id: string;
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: CaseStatus;
  nextAction: string;
  updatedAt: string;
}

/** Estados que le importan a un rol que trabaja el vehículo (mecánico,
 * inspector) — a diferencia de owner/advisor, no incluye
 * `waiting_authorization`/`ready`, que son decisiones del asesor con el
 * cliente, no trabajo de piso. */
const WORK_FLOOR_STATUSES: readonly CaseStatus[] = [
  "received",
  "inspection",
  "in_progress",
  "blocked",
  "quality",
  "ready_for_delivery",
];

export default async function ProDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  // Gate universal (todo rol activo tiene `organization.read`) — el
  // contenido de abajo se adapta a lo que el permiso real del actor le deja
  // ver, en vez de bloquear el aterrizaje entero como antes (`intake.read`
  // dejaba fuera a mecánico/cajero/inspector desde el primer clic tras
  // iniciar sesión).
  const session = await getWebSession(orgSlug, "organization.read");

  const hasIntakeRead = session.permissions.includes("intake.read");
  const hasIntakeManage = session.permissions.includes("intake.manage");
  const hasWorkRead = session.permissions.includes("work.read");

  let rows: DashboardCaseRow[] = [];
  let organizationName = "Taller";
  if (
    session.accessState.kind === "allowed" &&
    session.organizationId &&
    session.actorId &&
    (hasIntakeRead || hasWorkRead)
  ) {
    const state = await getReadState(session.actorId, session.organizationId);
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
      .filter((kase) => hasIntakeRead || WORK_FLOOR_STATUSES.includes(kase.status))
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
          // `crm.read` es lo que gobierna ver el nombre del cliente
          // (mismo permiso que la página de Clientes) — un mecánico o
          // inspector sin ese permiso ve el vehículo, no a quién pertenece.
          customerName: hasIntakeRead ? customer?.displayName ?? "Cliente" : "—",
          vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehículo",
          status: kase.status,
          nextAction: experience.nextAction.primaryAction,
          updatedAt: latestEvent?.occurredAt ?? kase.openedAt,
        };
      })
      .filter((row): row is DashboardCaseRow => row != null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } else if (session.accessState.kind === "allowed" && session.organizationId) {
    organizationName =
      session.availableOrganizations.find((org) => org.id === session.organizationId)?.label ??
      "Taller";
  }

  const roleView: "operacion" | "piso" | "otro" = hasIntakeRead
    ? "operacion"
    : hasWorkRead
      ? "piso"
      : "otro";

  const openCases = rows.filter((row) => row.status !== "closed").length;
  const waiting = rows.filter((row) => row.status === "waiting_authorization").length;
  const ready = rows.filter((row) => row.status === "ready").length;
  const blocked = rows.filter((row) => row.status === "blocked").length;
  const inProgress = rows.filter((row) => row.status === "in_progress").length;
  const readyForDelivery = rows.filter((row) => row.status === "ready_for_delivery").length;

  const statCards =
    roleView === "operacion"
      ? [
          { label: "En operación", value: openCases },
          { label: "Esperando al cliente", value: waiting },
          { label: "Autorizados para seguir", value: ready },
        ]
      : roleView === "piso"
        ? [
            { label: "En trabajo", value: inProgress },
            { label: "Bloqueados", value: blocked },
            { label: "Listos para entrega", value: readyForDelivery },
          ]
        : [];

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
            {roleView === "operacion"
              ? "La vista de trabajo para recibir vehículos, mover casos y solicitar decisiones."
              : roleView === "piso"
                ? "Los vehículos que están en piso ahora mismo — sin datos de cliente ni de negocio."
                : "Todavía no hay una vista para tu rol en esta organización."}
          </p>
        </div>
        {hasIntakeManage ? (
          <LinkButton href={`/pro/o/${orgSlug}/cases?new=1`} variant="primary">
            Abrir caso
          </LinkButton>
        ) : null}
      </header>

      {statCards.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {statCards.map((stat) => (
            <Card key={stat.label}>
              <p className="text-xs uppercase text-[var(--color-muted-400)]">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-400)]">
          {roleView === "piso" ? "Vehículos en piso" : "Trabajo reciente"}
        </h2>
        {roleView === "otro" ? (
          <EmptyState
            title="Sin vista operativa para tu rol todavía"
            description="Tu membresía no tiene permisos sobre casos ni trabajo de taller. Si esto no es correcto, pide a tu administrador que revise tu rol en Configuración."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              roleView === "piso"
                ? "Sin vehículos en piso ahora mismo"
                : "Todavía no hay trabajo capturado"
            }
            description={
              roleView === "piso"
                ? "Cuando un caso pase a trabajo activo, aparecerá aquí."
                : "Abre el primer caso con los datos mínimos del cliente y el vehículo."
            }
            action={
              hasIntakeManage ? (
                <LinkButton href={`/pro/o/${orgSlug}/cases?new=1`} variant="secondary" size="sm">
                  Capturar primer caso
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption={roleView === "piso" ? "Vehículos en piso" : "Casos recientes del taller"}
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
              ...(roleView === "operacion"
                ? [{ key: "customer", header: "Cliente", render: (row: DashboardCaseRow) => row.customerName }]
                : []),
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
