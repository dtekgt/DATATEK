import { AccessBoundary, Badge, Card, DateTimeText } from "@datatek/ui";
import { FIXTURE_ORGANIZATIONS, FIXTURE_SUPPORT_ACCESS_SESSIONS } from "@datatek/application";
import { getControlSession } from "../../lib/fixture-session";

// R0-C: read-only view of seeded support access sessions — activation and
// approval are commands with reason/ticket (sección 2.5), not a generic
// admin editor. This page shows the one seeded elevated session (DTEK,
// TCK-1042) so "solicitud/activación de acceso elevado ficticio" and
// "expiración visible" (sección 9) are reachable in the UI.
export default async function SupportPage() {
  const session = await getControlSession("platform.access.use");

  return (
    <AccessBoundary state={session.accessState}>
      <div className="flex flex-col gap-4">
        {/* Los únicos badges de esta pantalla mostraban el `status` crudo
            de cada sesión, lo que la hacía leerse como la bitácora real de
            accesos elevados. Ticket, razón y vencimiento son sembrados. */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">Soporte — sesiones elevadas</h1>
          <Badge tone="neutral">DEMO DATA</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIXTURE_SUPPORT_ACCESS_SESSIONS.map((s) => {
            const org = FIXTURE_ORGANIZATIONS.find((o) => o.id === s.organizationId);
            return (
              <Card key={s.id}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{org?.label ?? s.organizationId}</p>
                  <Badge tone={s.status === "active" ? "warning" : "neutral"}>{s.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted-400)]">Ticket {s.ticket}</p>
                <p className="mt-1 text-sm">{s.reason}</p>
                <p className="mt-2 text-xs text-[var(--color-muted-400)]">
                  Vence <DateTimeText value={s.expiresAt} mode="datetime" />
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </AccessBoundary>
  );
}
