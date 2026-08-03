import { AccessBoundary, Badge, Card, DateTimeText } from "@datatek/ui";
import { FIXTURE_ORGANIZATIONS } from "@datatek/application";
import { getControlTenantAccess } from "../../../lib/fixture-session";

// R0-C: opening a tenant from Control always requires an active support
// access session scoped to that organization (sección 2.5, sección 5.4).
// There is no case/customer data to show yet (R0-D) — this page proves the
// elevation gate itself, which is the load-bearing behavior for R0-C.
export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const org = FIXTURE_ORGANIZATIONS.find((o) => o.id === organizationId);
  const { accessState, activeSupportSession } = await getControlTenantAccess(organizationId);

  if (!org) {
    // Sección 7: never confirms existence to an unauthorized/unknown id.
    return (
      <AccessBoundary state={{ kind: "capability_denied", permission: "platform.support.manage" }}>
        <p />
      </AccessBoundary>
    );
  }

  return (
    <AccessBoundary state={accessState}>
      <div className="flex flex-col gap-4">
        {/* `sesión elevada activa` es un estado de acceso, no una
            procedencia: la organización, el ticket, la razón y el
            vencimiento de abajo son fixtures. Un registro de acceso
            elevado sin rotular es precisamente lo que una auditoría
            no debe poder confundir con la bitácora real. */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{org.label}</h1>
          <Badge tone="warning">sesión elevada activa</Badge>
          <Badge tone="neutral">DEMO DATA</Badge>
        </div>
        <Card>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted-400)]">Slug</dt>
              <dd>/{org.slug}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted-400)]">Ticket</dt>
              <dd>{activeSupportSession?.ticket}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--color-muted-400)]">Razón</dt>
              <dd>{activeSupportSession?.reason}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted-400)]">Vence</dt>
              <dd>
                {activeSupportSession ? (
                  <DateTimeText value={activeSupportSession.expiresAt} mode="datetime" />
                ) : null}
              </dd>
            </div>
          </dl>
        </Card>
        <p className="text-sm text-[var(--color-muted-400)]">
          Aún no existen clientes, vehículos ni casos que abrir — R0-D introduce esas entidades.
        </p>
      </div>
    </AccessBoundary>
  );
}
