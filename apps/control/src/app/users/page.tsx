import { AccessBoundary, Badge, DataTable, PageTitle } from "@datatek/ui";
import { FIXTURE_PLATFORM_ACTOR_OPTIONS } from "../../lib/fixture-session";
import { getControlSession } from "../../lib/fixture-session";

// R0-C: platform roles/users, entirely separate from any organization
// membership (sección 2.4, sección 10 dominio "platform roles separados").
export default async function UsersPage() {
  const session = await getControlSession("platform.control.enter");

  return (
    <AccessBoundary state={session.accessState}>
      <div className="flex flex-col gap-4">
        {/* La tabla lista actores sembrados, no usuarios reales de
            plataforma. Sin rótulo, una lista de "quién tiene acceso a
            Control" es exactamente el tipo de dato que nadie debería
            confundir con el real. */}
        <div className="flex flex-wrap items-center gap-2">
          <PageTitle>Usuarios de plataforma</PageTitle>
          <Badge tone="neutral">independiente de membership de organización</Badge>
          <Badge tone="neutral">DEMO DATA</Badge>
        </div>
        <DataTable
          caption="Usuarios de plataforma"
          rowKey={(row) => row.id}
          rows={FIXTURE_PLATFORM_ACTOR_OPTIONS}
          columns={[
            { key: "label", header: "Actor", render: (row) => row.label },
            { key: "id", header: "ID", render: (row) => row.id },
          ]}
        />
      </div>
    </AccessBoundary>
  );
}
