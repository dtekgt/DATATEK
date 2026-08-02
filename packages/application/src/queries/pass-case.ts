// `getPassCase` — DATATEK_R0_D sección 3.1. Returns `null` (never throws,
// never falls back to a different case) when the case does not exist OR
// does not belong to the requesting customer — same non-enumeration
// discipline DATATEK_R0_A requires for vehicles/clients between
// organizations, applied here between CUSTOMERS within the same
// organization: a `pass`/`guest` audience must never be able to fetch
// another customer's case by guessing an id.
import { friendlyCaseStatus } from "../fixtures/cases.ts";
import type { CrmVehicleState } from "../commands/state.ts";
import type { PassCaseViewModel } from "../viewmodels/pass.ts";
import { buildVehicleLabel } from "./shared.ts";
import type { QueryContext } from "./types.ts";

export function getPassCase(
  state: CrmVehicleState,
  ctx: QueryContext,
  caseId: string,
): PassCaseViewModel | null {
  const kase = state.cases.find((c) => c.id === caseId && c.organizationId === ctx.organizationId);
  if (!kase) return null;

  if (ctx.audience !== "pro" && kase.customerId !== ctx.actorId) {
    return null;
  }

  const vehicle = state.vehicles.find((v) => v.id === kase.vehicleId);
  const latestEvent = state.caseStatusEvents
    .filter((e) => e.caseId === kase.id)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];

  return {
    demo: false,
    caseId: kase.id,
    code: kase.folioCode,
    vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehículo",
    status: kase.status,
    friendlyStatus: friendlyCaseStatus(kase.status),
    // `CaseProofSummaryViewModel` is keyed by the same case id — R0-D never
    // introduces a separate proof-summary identity.
    proofSummaryId: kase.id,
    updatedAt: latestEvent?.occurredAt ?? kase.openedAt,
  };
}
