import { getPassCaseViewModel, DEMO_CASE_ID } from "@datatek/application";
import { getPassCase } from "@datatek/application/commands";
import { Card, Badge, LinkButton } from "@datatek/ui";
import { getCommandsEngine } from "../../../../lib/commands-engine";
import { resolvePassActor } from "../../../../lib/pass-actor";

export default async function PassCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; actor?: string }>;
}) {
  const sp = await searchParams;
  const actor = resolvePassActor(sp);

  let realCases: { id: string; code: string; vehicleLabel: string; friendlyStatus: string }[] = [];
  if (actor) {
    const state = getCommandsEngine().getState();
    const ctx = {
      organizationId: actor.organizationId,
      audience: "pass" as const,
      actorId: actor.actorId,
      now: new Date(),
    };
    const cases = state.cases.filter(
      (c) => c.organizationId === actor.organizationId && c.customerId === actor.actorId,
    );
    realCases = cases
      .map((c) => {
        const vm = getPassCase(state, ctx, c.id);
        if (!vm) return null;
        return {
          id: vm.caseId,
          code: vm.code,
          vehicleLabel: vm.vehicleLabel,
          friendlyStatus: vm.friendlyStatus,
        };
      })
      .filter(
        (r): r is { id: string; code: string; vehicleLabel: string; friendlyStatus: string } =>
          r != null,
      );
  }

  const demoCase = getPassCaseViewModel(DEMO_CASE_ID);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Tus casos</h1>
          <Badge tone="success">Motor de comandos</Badge>
        </div>
        {realCases.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-400)]">
            Todavía no hay casos reales para este cliente en el motor de comandos.
          </p>
        ) : (
          realCases.map((c) => (
            <Card key={c.id}>
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
                {c.code}
              </p>
              <p className="mt-1 font-medium">{c.vehicleLabel}</p>
              <Badge tone="info" className="mt-2">
                {c.friendlyStatus}
              </Badge>
              <LinkButton href={`/pass/cases/${c.id}`} size="sm" className="mt-3">
                Ver caso
              </LinkButton>
            </Card>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Caso de ejemplo</h2>
          <Badge tone="neutral">DEMO DATA</Badge>
        </div>
        <Card>
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
            {demoCase.code}
          </p>
          <p className="mt-1 font-medium">{demoCase.vehicleLabel}</p>
          <Badge tone="info" className="mt-2">
            {demoCase.friendlyStatus}
          </Badge>
          <LinkButton href={`/pass/cases/${demoCase.caseId}`} size="sm" className="mt-3">
            Ver caso
          </LinkButton>
        </Card>
      </div>
    </div>
  );
}
