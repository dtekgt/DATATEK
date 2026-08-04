import { getPassHomeViewModel } from "@datatek/application";
import { getPassHome } from "@datatek/application/commands";
import { Badge, Card, EmptyState, LinkButton, PageTitle } from "@datatek/ui";
import { getCommandsEngine } from "../../../../lib/commands-engine";
import { resolvePassActor } from "../../../../lib/pass-actor";

export default async function GaragePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; actor?: string }>;
}) {
  const sp = await searchParams;
  const actor = resolvePassActor(sp);

  if (actor) {
    const state = getCommandsEngine().getState();
    const home = getPassHome(state, {
      organizationId: actor.organizationId,
      audience: "pass",
      actorId: actor.actorId,
      now: new Date(),
    });
    if (home.vehicles.length > 0) {
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <PageTitle>Garage</PageTitle>
            <Badge tone="success">Motor de comandos</Badge>
          </div>
          {home.vehicles.map((v) => (
            <Card key={v.id}>
              <p className="font-medium">{v.label}</p>
              <p className="text-sm text-[var(--color-muted-400)]">Placa {v.plate}</p>
              <p className="mt-1 text-sm text-[var(--color-muted-400)]">{v.now.headline}</p>
              <LinkButton href={`/pass/garage/${v.id}`} size="sm" className="mt-3">
                Ver pasaporte
              </LinkButton>
            </Card>
          ))}
        </div>
      );
    }
  }

  const home = getPassHomeViewModel();
  if (home.vehicles.length === 0) {
    return <EmptyState title="Todavía no tienes vehículos vinculados." />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <PageTitle>Garage</PageTitle>
        <Badge tone="neutral">DEMO DATA</Badge>
      </div>
      {home.vehicles.map((v) => (
        <Card key={v.id}>
          <p className="font-medium">{v.label}</p>
          <p className="text-sm text-[var(--color-muted-400)]">Placa {v.plate}</p>
          <p className="mt-1 text-sm text-[var(--color-muted-400)]">{v.now.headline}</p>
          <LinkButton href={`/pass/garage/${v.id}`} size="sm" className="mt-3">
            Ver pasaporte
          </LinkButton>
        </Card>
      ))}
    </div>
  );
}
