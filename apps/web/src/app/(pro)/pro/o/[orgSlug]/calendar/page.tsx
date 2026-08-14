import { buildVehicleLabel } from "@datatek/application/commands";
import { friendlyCaseStatus } from "@datatek/application";
import { Badge, DataTable, DateTimeText, EmptyState, PageTitle, StatusPill } from "@datatek/ui";
import type { AppointmentStatus } from "@datatek/application/commands";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";
import { NewAppointmentForm } from "./new-appointment-form";
import { AppointmentActions } from "./appointment-actions";

const STATUS_TONE: Record<AppointmentStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  tentative: "warning",
  confirmed: "info",
  arrived: "success",
  completed: "success",
  cancelled: "danger",
  no_show: "danger",
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  tentative: "Tentativa",
  confirmed: "Confirmada",
  arrived: "Vehículo llegó",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No se presentó",
};

interface AppointmentRow {
  id: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  purpose: string | null;
  caseCode: string;
  caseId: string;
  vehicleLabel: string;
  resourceLabel: string;
}

export default async function ProCalendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getWebSession(orgSlug, "agenda.read");
  const canManage = session.permissions.includes("agenda.manage");

  let rows: AppointmentRow[] = [];
  let resourceOptions: { value: string; label: string }[] = [];
  let openCaseOptions: { value: string; label: string }[] = [];

  if (session.accessState.kind === "allowed" && session.organizationId) {
    const state = getCommandsEngine().getState();
    const orgId = session.organizationId;

    const resources = state.resources.filter((r) => r.organizationId === orgId && r.isActive);
    resourceOptions = resources.map((r) => ({ value: r.id, label: r.label }));

    openCaseOptions = state.cases
      .filter((c) => c.organizationId === orgId && c.status !== "closed" && c.status !== "cancelled")
      .map((c) => ({ value: c.id, label: `${c.folioCode} · ${friendlyCaseStatus(c.status)}` }));

    rows = state.appointments
      .filter((a) => a.organizationId === orgId)
      .map((a): AppointmentRow | null => {
        const kase = state.cases.find((c) => c.id === a.caseId);
        if (!kase) return null;
        const vehicle = state.vehicles.find((v) => v.id === kase.vehicleId);
        const resourceIds = state.appointmentResources
          .filter((ar) => ar.appointmentId === a.id)
          .map((ar) => ar.resourceId);
        const resourceLabel =
          resources
            .filter((r) => resourceIds.includes(r.id))
            .map((r) => r.label)
            .join(", ") || "Sin recurso";
        return {
          id: a.id,
          status: a.status,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          purpose: a.purpose,
          caseCode: kase.folioCode,
          caseId: kase.id,
          vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehículo",
          resourceLabel,
        };
      })
      .filter((row): row is AppointmentRow => row != null)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  const upcoming = rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">PRO · AGENDA</Badge>
            <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
          </div>
          <PageTitle className="mt-3">Agenda del taller</PageTitle>
          <p className="mt-2 text-sm text-[var(--color-muted-400)]">
            Citas por caso, contra recursos (bahías, técnicos) — sin colisión: dos citas nunca
            comparten el mismo recurso en el mismo rango de tiempo.
          </p>
        </div>
        {canManage && resourceOptions.length > 0 && openCaseOptions.length > 0 ? (
          <NewAppointmentForm orgSlug={orgSlug} resources={resourceOptions} cases={openCaseOptions} />
        ) : null}
      </header>

      {resourceOptions.length === 0 && session.accessState.kind === "allowed" ? (
        <EmptyState
          title="Sin recursos configurados"
          description="Este taller todavía no tiene bahías ni técnicos registrados para agendar contra ellos."
        />
      ) : upcoming.length === 0 ? (
        <EmptyState
          title="Sin citas programadas"
          description="Cuando agendes una cita para un caso abierto, aparecerá aquí."
        />
      ) : (
        <DataTable
          caption="Próximas citas"
          rowKey={(row) => row.id}
          rows={upcoming}
          columns={[
            {
              key: "when",
              header: "Cuándo",
              render: (row) => (
                <div className="flex flex-col">
                  <DateTimeText value={row.startsAt} mode="datetime" />
                  <span className="text-xs text-[var(--color-muted-400)]">
                    hasta <DateTimeText value={row.endsAt} mode="datetime" />
                  </span>
                </div>
              ),
            },
            { key: "case", header: "Caso", render: (row) => row.caseCode },
            { key: "vehicle", header: "Vehículo", render: (row) => row.vehicleLabel },
            { key: "resource", header: "Recurso", render: (row) => row.resourceLabel },
            {
              key: "status",
              header: "Estado",
              render: (row) => (
                <StatusPill label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
              ),
            },
            ...(canManage
              ? [
                  {
                    key: "actions",
                    header: "",
                    render: (row: AppointmentRow) =>
                      row.status === "tentative" || row.status === "confirmed" ? (
                        <AppointmentActions
                          orgSlug={orgSlug}
                          appointmentId={row.id}
                          canConfirm={row.status === "tentative"}
                        />
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
