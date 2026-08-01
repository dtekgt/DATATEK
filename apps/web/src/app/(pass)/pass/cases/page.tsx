import { getPassCaseViewModel } from "@datatek/application";
import { DEMO_CASE_ID } from "@datatek/application";
import { Card, Badge, LinkButton } from "@datatek/ui";

export default function PassCasesPage() {
  const demoCase = getPassCaseViewModel(DEMO_CASE_ID);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Casos</h1>
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
  );
}
