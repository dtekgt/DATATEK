// Shared test-only scenario builders for the query contract test suite
// (queries/*.test.ts). Every builder runs the REAL command engine (never
// hand-rolled ViewModel-shaped fixtures) so a query test exercises the same
// state a Fase 4b server loader would actually see — same discipline
// `commands/test-helpers.ts` already established for command tests.
import {
  buildTestContext,
  buildReadyToQuoteCase,
  type ReadyToQuoteCase,
} from "../commands/test-helpers.ts";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { createQuote, createQuoteVersion, addQuoteItem } from "../commands/quote-commands.ts";
import { freezeQuoteVersion } from "../commands/quote-commands.ts";
import {
  prepareAuthorizationRequest,
  markAuthorizationRequestSent,
  recordAuthorization,
} from "../commands/authorization-commands.ts";
import { createProvisionalCustomer } from "../commands/crm-commands.ts";
import { registerVehicle } from "../commands/vehicle-commands.ts";
import { createManualIntake, createCaseFromIntake } from "../commands/intake-commands.ts";
import type { CommandContext } from "../commands/context.ts";
import { createEmptyState, type CrmVehicleState } from "../commands/state.ts";
import type { ProjectionAudience, QueryContext } from "./types.ts";

export function advisorCtx(idempotencyKey: string): CommandContext {
  return buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    idempotencyKey,
  });
}

export function inspectorCtx(idempotencyKey: string): CommandContext {
  return buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.inspectorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    idempotencyKey,
  });
}

/** Not present anywhere in the R0-C fixture tenancy graph — resolves to
 * `membershipStatus: "missing"`, exactly like a real guest customer
 * deciding via secure_link. */
export function guestCtx(idempotencyKey: string): CommandContext {
  return buildTestContext({
    actorId: "guest-no-account",
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    idempotencyKey,
  });
}

export function buildQueryContext(params: {
  audience: ProjectionAudience;
  actorId: string;
  organizationId?: string;
  now?: Date;
}): QueryContext {
  return {
    organizationId: params.organizationId ?? FIXTURE_ORGANIZATION_IDS.dtek,
    audience: params.audience,
    actorId: params.actorId,
    now: params.now ?? new Date("2026-08-01T12:00:00.000Z"),
  };
}

export interface FrozenQuoteScenario extends ReadyToQuoteCase {
  quoteId: string;
  versionId: string;
  padsItemId: string;
  laborItemId: string;
  hash: string;
}

/** Case with a completed inspection, one frozen quote version (pads GTQ
 * 450.00 + labor GTQ 120.00 = GTQ 570.00 total), NOT yet requested. Case
 * stays `inspection` (same finding Fase 3 already documented — freeze never
 * transitions the case). */
export function buildFrozenQuoteScenario(prefix: string): FrozenQuoteScenario {
  const kase = buildReadyToQuoteCase(prefix);

  const quote = createQuote(kase.state, advisorCtx(`${prefix}-quote`), { caseId: kase.caseId });
  if (!quote.ok) throw new Error(`setup failed: quote (${quote.error.message})`);

  const version = createQuoteVersion(quote.nextState, advisorCtx(`${prefix}-version`), {
    quoteId: quote.data.id,
    currency: "GTQ",
  });
  if (!version.ok) throw new Error(`setup failed: version (${version.error.message})`);

  const pads = addQuoteItem(version.nextState, advisorCtx(`${prefix}-pads`), {
    quoteVersionId: version.data.version.id,
    lineType: "part",
    description: "Pastillas de freno delanteras",
    quantity: 1,
    unitPriceMinor: 45000,
    currency: "GTQ",
    displayOrder: 1,
  });
  if (!pads.ok) throw new Error(`setup failed: pads (${pads.error.message})`);

  const labor = addQuoteItem(pads.nextState, advisorCtx(`${prefix}-labor`), {
    quoteVersionId: version.data.version.id,
    lineType: "labor",
    description: "Mano de obra",
    quantity: 1,
    unitPriceMinor: 12000,
    currency: "GTQ",
    displayOrder: 2,
  });
  if (!labor.ok) throw new Error(`setup failed: labor (${labor.error.message})`);

  const frozen = freezeQuoteVersion(labor.nextState, advisorCtx(`${prefix}-freeze`), {
    quoteVersionId: version.data.version.id,
  });
  if (!frozen.ok) throw new Error(`setup failed: freeze (${frozen.error.message})`);

  return {
    ...kase,
    state: frozen.nextState,
    quoteId: quote.data.id,
    versionId: version.data.version.id,
    padsItemId: pads.data.id,
    laborItemId: labor.data.id,
    hash: frozen.data.snapshotHash as string,
  };
}

export interface PreparedScenario extends FrozenQuoteScenario {
  requestId: string;
  plainToken: string;
}

/** Prepared but deliberately NOT sent — case is `waiting_authorization`,
 * request is `prepared`. */
export function buildPreparedNotSentScenario(prefix: string): PreparedScenario {
  const built = buildFrozenQuoteScenario(prefix);
  const prepared = prepareAuthorizationRequest(built.state, advisorCtx(`${prefix}-prepare`), {
    quoteVersionId: built.versionId,
    audienceCustomerId: built.customerId,
  });
  if (!prepared.ok) throw new Error(`setup failed: prepare (${prepared.error.message})`);
  return {
    ...built,
    state: prepared.nextState,
    requestId: prepared.data.request.id,
    plainToken: prepared.data.plainToken,
  };
}

/** Prepared AND sent — case `waiting_authorization`, request `sent`. */
export function buildPreparedAndSentScenario(prefix: string): PreparedScenario {
  const prepared = buildPreparedNotSentScenario(prefix);
  const sent = markAuthorizationRequestSent(prepared.state, advisorCtx(`${prefix}-send`), {
    authorizationRequestId: prepared.requestId,
    channel: "whatsapp_manual_local",
    result: "sent",
  });
  if (!sent.ok) throw new Error(`setup failed: send (${sent.error.message})`);
  return { ...prepared, state: sent.nextState };
}

export interface DecidedScenario extends PreparedScenario {
  authorizationId: string;
}

/** Partial decision (accepts only the pads line) — case moves to `ready`. */
export function buildPartiallyAuthorizedScenario(prefix: string): DecidedScenario {
  const sent = buildPreparedAndSentScenario(prefix);
  const decided = recordAuthorization(sent.state, guestCtx(`${prefix}-decide`), {
    method: "secure_link",
    token: sent.plainToken,
    quoteVersionId: sent.versionId,
    quoteVersionHash: sent.hash,
    decision: "partial",
    acceptedQuoteItemIds: [sent.padsItemId],
  });
  if (!decided.ok) throw new Error(`setup failed: decide (${decided.error.message})`);
  return { ...sent, state: decided.nextState, authorizationId: decided.data.authorization.id };
}

/** Full rejection — case moves to `closed`. */
export function buildRejectedScenario(prefix: string): DecidedScenario {
  const sent = buildPreparedAndSentScenario(prefix);
  const decided = recordAuthorization(sent.state, guestCtx(`${prefix}-reject`), {
    method: "secure_link",
    token: sent.plainToken,
    quoteVersionId: sent.versionId,
    quoteVersionHash: sent.hash,
    decision: "reject",
    rejectionReason: "Cliente decidió no proceder.",
  });
  if (!decided.ok) throw new Error(`setup failed: reject (${decided.error.message})`);
  return { ...sent, state: decided.nextState, authorizationId: decided.data.authorization.id };
}

/** Full acceptance — case moves to `ready`. */
export function buildAcceptedScenario(prefix: string): DecidedScenario {
  const sent = buildPreparedAndSentScenario(prefix);
  const decided = recordAuthorization(sent.state, guestCtx(`${prefix}-accept`), {
    method: "secure_link",
    token: sent.plainToken,
    quoteVersionId: sent.versionId,
    quoteVersionHash: sent.hash,
    decision: "accept_all",
  });
  if (!decided.ok) throw new Error(`setup failed: accept (${decided.error.message})`);
  return { ...sent, state: decided.nextState, authorizationId: decided.data.authorization.id };
}

let testVinCounter = 0;
function nextTestVin(): string {
  testVinCounter += 1;
  // Same charset constraint documented in commands/test-helpers.ts: "VF" +
  // digits stays inside the VIN charset for any counter value.
  return `VG${String(testVinCounter).padStart(15, "0")}`;
}

/** A bare case at `new` — no schedule, no inspection, no quote. Runs only
 * the first four commands of `buildReadyToQuoteCase`'s pipeline
 * (customer -> vehicle -> intake -> case), stopping before any
 * `TransitionCase` call, so the case is exactly what `CreateCaseFromIntake`
 * itself produces. Cheapest scenario for testing the earliest
 * `getProCaseExperience` next-action branches. */
export function buildNewCase(prefix: string): {
  state: CrmVehicleState;
  caseId: string;
  vehicleId: string;
  customerId: string;
} {
  const customer = createProvisionalCustomer(createEmptyState(), advisorCtx(`${prefix}-customer`), {
    displayName: `Cliente ${prefix}`,
    source: "walk_in",
  });
  if (!customer.ok) throw new Error(`setup failed: customer (${customer.error.message})`);

  const vehicle = registerVehicle(customer.nextState, advisorCtx(`${prefix}-vehicle`), {
    vin: nextTestVin(),
    customerId: customer.data.id,
  });
  if (!vehicle.ok) throw new Error(`setup failed: vehicle (${vehicle.error.message})`);

  const intake = createManualIntake(vehicle.nextState, advisorCtx(`${prefix}-intake`), {
    customerId: customer.data.id,
    channel: "whatsapp_manual",
    originalText: "Frenos hacen ruido",
    reportedAt: "2026-07-30T10:00:00.000Z",
  });
  if (!intake.ok) throw new Error(`setup failed: intake (${intake.error.message})`);

  const kase = createCaseFromIntake(intake.nextState, advisorCtx(`${prefix}-case`), {
    intakeThreadId: intake.data.thread.id,
    customerId: customer.data.id,
    vehicleId: vehicle.data.vehicleId,
    summary: "Frenos",
  });
  if (!kase.ok) throw new Error(`setup failed: case (${kase.error.message})`);

  return {
    state: kase.nextState,
    caseId: kase.data.case.id,
    vehicleId: vehicle.data.vehicleId,
    customerId: customer.data.id,
  };
}
