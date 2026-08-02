import { getCaseWorkspaceViewModel, friendlyCaseStatus } from "@datatek/application";
import {
  getProCaseExperience,
  getCaseProofSummary,
  type CrmVehicleState,
} from "@datatek/application/commands";
import {
  Badge,
  CaseHeader,
  CaseStageRail,
  CaseNextActionCard,
  CaseBlockersList,
  CaseQuoteTotal,
  CaseProofSummary,
  Card,
  DateTimeText,
  Tabs,
} from "@datatek/ui";
import { getWebSession } from "../../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../../lib/commands-engine";
import { PrepareAuthorizationRequestForm } from "./prepare-authorization-form";

const LIVE_REQUEST_STATUSES = new Set(["prepared", "sent", "viewed"]);

/** Real-engine timeline entry — case status transitions and authorization
 * events for this case, merged and sorted. Only ever built for a case that
 * came from the real command engine (never for the fixture fallback, which
 * has no underlying event log to read). */
function buildRealTimeline(state: CrmVehicleState, caseId: string) {
  const statusEvents = state.caseStatusEvents
    .filter((e) => e.caseId === caseId)
    .map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      label: e.toStatus ? `Caso -> ${friendlyCaseStatus(e.toStatus)}` : "Cambio de estado",
      detail: e.reason,
    }));
  const authEvents = state.authorizationEvents
    .filter((e) => e.caseId === caseId)
    .map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      label: `Autorización: ${e.eventType}`,
      detail: null as string | null,
    }));
  return [...statusEvents, ...authEvents].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}

export default async function ProCaseWorkspacePage({
  params,
}: {
  params: Promise<{ orgSlug: string; caseId: string }>;
}) {
  const { orgSlug, caseId } = await params;
  // `getWebSession` here re-checks the SAME "intake.read" permission the
  // case-reading domain concept requires (sección "AccessBoundary/permisos
  // se siguen resolviendo server-side, no solo ocultando en el cliente") —
  // `ProShellLayout` above this page only redirects on `unauthenticated`,
  // never on `membership_missing`/`capability_denied`, so `AccessBoundary`
  // (a Client Component further down) is the only thing that would hide a
  // denied render from the BROWSER — but this Server Component's own data
  // fetch already ran by the time that happens, and its RSC payload is what
  // gets sent, gated or not. Only ever building `vm`/`proof` from the real
  // engine when `accessState.kind === "allowed"` keeps the actual case data
  // for a org this actor cannot read out of that payload entirely, not just
  // out of the rendered DOM.
  const session = await getWebSession(orgSlug, "intake.read");

  const engine = getCommandsEngine();
  const state = engine.getState();

  let vm = null as ReturnType<typeof getProCaseExperience>;
  let proof = null as ReturnType<typeof getCaseProofSummary>;
  let canPrepareRequest = false;
  let frozenVersionId: string | null = null;
  let audienceCustomerId: string | null = null;
  let liveRequestStatus: string | null = null;

  if (session.accessState.kind === "allowed" && session.organizationId && session.actorId) {
    const ctx = {
      organizationId: session.organizationId,
      audience: "pro" as const,
      actorId: session.actorId,
      now: new Date(),
    };
    vm = getProCaseExperience(state, ctx, caseId);
    if (vm) {
      proof = getCaseProofSummary(state, ctx, caseId);

      const kase = state.cases.find(
        (c) => c.id === caseId && c.organizationId === session.organizationId,
      );
      const quote = kase ? state.quotes.find((q) => q.caseId === kase.id) : undefined;
      const versions = quote ? state.quoteVersions.filter((v) => v.quoteId === quote.id) : [];
      const frozenVersion = versions.find((v) => v.status === "frozen");
      const liveRequest = state.authorizationRequests.find(
        (r) =>
          r.caseId === caseId &&
          r.organizationId === session.organizationId &&
          LIVE_REQUEST_STATUSES.has(r.status),
      );
      liveRequestStatus = liveRequest?.status ?? null;
      // `PrepareAuthorizationRequest` only ever succeeds from case status
      // `inspection` (it transitions inspection -> waiting_authorization
      // internally) — checking ONLY "no live request" is not enough once a
      // request has been decided: `LIVE_REQUEST_STATUSES` no longer
      // includes `decided`, so a decided-and-`ready` case would otherwise
      // look exactly like a fresh, never-requested one and the button would
      // wrongly reappear after a real decision already moved the case past
      // `inspection`.
      canPrepareRequest = Boolean(kase?.status === "inspection" && frozenVersion && !liveRequest);
      frozenVersionId = frozenVersion?.id ?? null;
      audienceCustomerId = kase?.customerId ?? null;
    }
  }

  const isReal = vm != null;
  if (!vm) {
    vm = getCaseWorkspaceViewModel(orgSlug, caseId);
  }

  const timeline = isReal ? buildRealTimeline(state, caseId) : [];

  const tabs = [
    {
      id: "blockers",
      label: "Bloqueos",
      content: <CaseBlockersList blockers={vm.blockers} />,
    },
    {
      id: "quote",
      label: "Cotización",
      content: <CaseQuoteTotal total={vm.quoteTotal} />,
    },
  ];
  if (proof) {
    tabs.push({ id: "proof", label: "Respaldo", content: <CaseProofSummary vm={proof} /> });
  }
  if (isReal) {
    tabs.push({
      id: "timeline",
      label: "Eventos",
      content:
        timeline.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-400)]">Sin eventos registrados todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {timeline.map((e) => (
              <li
                key={e.id}
                className="rounded-[var(--radius-control)] border border-white/10 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{e.label}</span>
                  <DateTimeText
                    value={e.occurredAt}
                    mode="datetime"
                    className="text-xs text-[var(--color-muted-400)]"
                  />
                </div>
                {e.detail ? (
                  <p className="mt-1 text-xs text-[var(--color-muted-400)]">{e.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        {isReal ? (
          <Badge tone="success">Caso real — motor de comandos</Badge>
        ) : (
          <Badge tone="neutral">DEMO DATA — no permite transicionar</Badge>
        )}
      </div>
      <CaseHeader
        code={vm.code}
        customerName={vm.customerName}
        vehicleLabel={vm.vehicleLabel}
        status={vm.status}
        friendlyStatus={friendlyCaseStatus(vm.status)}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
            Etapas
          </p>
          <CaseStageRail stages={vm.stages} />
        </Card>
        <div className="flex flex-col gap-4">
          <CaseNextActionCard action={vm.nextAction} />
          {isReal && frozenVersionId && audienceCustomerId ? (
            // Always rendered once a frozen version exists — never gated on
            // `canPrepareRequest` alone. `PrepareAuthorizationRequestForm`
            // itself decides prepare-vs-already-live from that same prop,
            // but the ELEMENT must stay in the tree across the
            // `revalidatePath` refresh a successful submit triggers:
            // `canPrepareRequest` flips to `false` the moment the request
            // exists, and conditionally unmounting this Client Component on
            // that flip would destroy its local `useActionState` — the ONE
            // place the plaintext token/link is ever shown — before a human
            // gets to copy it.
            <PrepareAuthorizationRequestForm
              orgSlug={orgSlug}
              caseId={caseId}
              quoteVersionId={frozenVersionId}
              audienceCustomerId={audienceCustomerId}
              canPrepareRequest={canPrepareRequest}
              liveRequestStatus={liveRequestStatus}
            />
          ) : null}
          <Tabs ariaLabel="Detalle del caso" items={tabs} />
        </div>
      </div>
    </div>
  );
}
