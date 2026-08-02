import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { buildTestContext, buildReadyToQuoteCase } from "./test-helpers.ts";
import {
  createQuote,
  createQuoteVersion,
  addQuoteItem,
  freezeQuoteVersion,
} from "./quote-commands.ts";
import {
  prepareAuthorizationRequest,
  markAuthorizationRequestSent,
  verifyAuthorizationAccess,
  recordAuthorization,
  invalidateAuthorization,
  revokeAndReprepareAuthorizationRequest,
} from "./authorization-commands.ts";
import {
  FEATURE_KEY_AUTHORIZATION_REISSUE,
  type CrmVehicleState,
  type FeatureFlagRow,
  type FeatureFlagOverrideRow,
} from "./state.ts";

const advisorCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

/** `InvalidateAuthorization` requires `authorization.decide`, which only
 * the `owner` role template has (advisor has `authorization.request` but
 * NOT `.decide` — see packages/domain/generated/spec.constants.ts). */
const ownerCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.ownerDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

/** A guest actor id not present anywhere in the R0-C fixture tenancy graph
 * — `resolveOrganizationCapabilities` resolves it to `membershipStatus:
 * "missing"`, exactly like a real customer with no Pro/Control account.
 * Used to prove `VerifyAuthorizationAccess`/`RecordAuthorization`
 * (secure_link) do not require any org permission. */
const guestCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: "guest-no-account",
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

/** Case with a completed inspection (still `inspection`) + quote + frozen
 * version with two lines (pads GTQ 450.00, labor GTQ 120.00 = total GTQ
 * 570.00). Does NOT call `PrepareAuthorizationRequest` — callers that need
 * the case at `waiting_authorization` do that themselves, same as
 * production. Returns everything a request/decision test needs. */
function buildFrozenVersion(prefix: string) {
  const kase = buildReadyToQuoteCase(prefix);

  const quote = createQuote(kase.state, advisorCtx({ idempotencyKey: `${prefix}-quote` }), {
    caseId: kase.caseId,
  });
  if (!quote.ok) throw new Error(`setup failed: quote (${quote.error.message})`);

  const version = createQuoteVersion(
    quote.nextState,
    advisorCtx({ idempotencyKey: `${prefix}-version` }),
    { quoteId: quote.data.id, currency: "GTQ" },
  );
  if (!version.ok) throw new Error(`setup failed: version (${version.error.message})`);

  const pads = addQuoteItem(version.nextState, advisorCtx({ idempotencyKey: `${prefix}-pads` }), {
    quoteVersionId: version.data.version.id,
    lineType: "part",
    description: "Pastillas de freno delanteras",
    quantity: 1,
    unitPriceMinor: 45000,
    currency: "GTQ",
    displayOrder: 1,
  });
  if (!pads.ok) throw new Error(`setup failed: pads (${pads.error.message})`);

  const labor = addQuoteItem(pads.nextState, advisorCtx({ idempotencyKey: `${prefix}-labor` }), {
    quoteVersionId: version.data.version.id,
    lineType: "labor",
    description: "Mano de obra",
    quantity: 1,
    unitPriceMinor: 12000,
    currency: "GTQ",
    displayOrder: 2,
  });
  if (!labor.ok) throw new Error(`setup failed: labor (${labor.error.message})`);

  const frozen = freezeQuoteVersion(
    labor.nextState,
    advisorCtx({ idempotencyKey: `${prefix}-freeze` }),
    {
      quoteVersionId: version.data.version.id,
    },
  );
  if (!frozen.ok) throw new Error(`setup failed: freeze (${frozen.error.message})`);

  return {
    state: frozen.nextState,
    caseId: kase.caseId,
    customerId: kase.customerId,
    quoteId: quote.data.id,
    versionId: version.data.version.id,
    padsItemId: pads.data.id,
    laborItemId: labor.data.id,
    hash: frozen.data.snapshotHash as string,
  };
}

/** Frozen version + prepared + sent request. Returns the plaintext token. */
function buildSentRequest(prefix: string) {
  const built = buildFrozenVersion(prefix);
  const prepared = prepareAuthorizationRequest(
    built.state,
    advisorCtx({ idempotencyKey: `${prefix}-prepare` }),
    { quoteVersionId: built.versionId, audienceCustomerId: built.customerId },
  );
  if (!prepared.ok) throw new Error(`setup failed: prepare (${prepared.error.message})`);

  const sent = markAuthorizationRequestSent(
    prepared.nextState,
    advisorCtx({ idempotencyKey: `${prefix}-send` }),
    {
      authorizationRequestId: prepared.data.request.id,
      channel: "whatsapp_manual_local",
      result: "sent",
    },
  );
  if (!sent.ok) throw new Error(`setup failed: send (${sent.error.message})`);

  return {
    ...built,
    state: sent.nextState,
    requestId: prepared.data.request.id,
    plainToken: prepared.data.plainToken,
  };
}

/** `createEmptyState()` (used by `buildReadyToQuoteCase`, unlike the real
 * dev-route engine which seeds from `buildFixtureCrmVehicleState()`) starts
 * with NO `featureFlags` rows, and `isFeatureEnabled` fails closed (returns
 * `false`) when a flag key was never seeded — see the comment on
 * `isFeatureEnabled` in state.ts. Every
 * `RevokeAndReprepareAuthorizationRequest` test below must inject the
 * `authorization_reissue` flag by hand, same precedent as seeding
 * `resources` directly in `test-helpers.ts` before any `CreateResource`
 * command existed. */
function withReissueFlag(
  state: CrmVehicleState,
  opts: { organizationId: string; defaultEnabled?: boolean; overrideEnabled?: boolean },
): CrmVehicleState {
  const flag: FeatureFlagRow = {
    id: "flag-authorization-reissue-test",
    key: FEATURE_KEY_AUTHORIZATION_REISSUE,
    label: "Reenvío de solicitud de autorización",
    description: "test",
    defaultEnabled: opts.defaultEnabled ?? true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const featureFlagOverrides: FeatureFlagOverrideRow[] =
    opts.overrideEnabled == null
      ? []
      : [
          {
            id: "ffo-test",
            organizationId: opts.organizationId,
            featureFlagId: flag.id,
            enabled: opts.overrideEnabled,
            reason: "test override",
            createdAt: "2026-08-01T00:00:00.000Z",
            createdBy: "test",
          },
        ];
  return { ...state, featureFlags: [flag], featureFlagOverrides };
}

describe("PrepareAuthorizationRequest", () => {
  it("only accepts a frozen version", () => {
    const kase = buildReadyToQuoteCase("prep-draft");
    const quote = createQuote(kase.state, advisorCtx({ idempotencyKey: "prep-draft-quote" }), {
      caseId: kase.caseId,
    });
    if (!quote.ok) throw new Error("setup failed");
    const version = createQuoteVersion(
      quote.nextState,
      advisorCtx({ idempotencyKey: "prep-draft-version" }),
      { quoteId: quote.data.id },
    );
    if (!version.ok) throw new Error("setup failed");

    const outcome = prepareAuthorizationRequest(
      version.nextState,
      advisorCtx({ idempotencyKey: "prep-draft-req" }),
      { quoteVersionId: version.data.version.id, audienceCustomerId: kase.customerId },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");
  });

  it("prepares a request and a token WITHOUT marking it sent", () => {
    const built = buildFrozenVersion("prep-ok");
    const outcome = prepareAuthorizationRequest(
      built.state,
      advisorCtx({ idempotencyKey: "prep-ok-req" }),
      { quoteVersionId: built.versionId, audienceCustomerId: built.customerId },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.request.status).toBe("prepared");
    expect(outcome.data.token.tokenHash).toBeTruthy();
    expect(outcome.data.plainToken).toContain(".");
    // The version is untouched by preparing a request.
    const version = outcome.nextState.quoteVersions.find((v) => v.id === built.versionId);
    expect(version?.status).toBe("frozen");
  });
});

describe("MarkAuthorizationRequestSent — separado de freeze", () => {
  it("a failed send attempt does not move the request to 'sent' and never touches the quote version", () => {
    const built = buildFrozenVersion("send-fail");
    const originalFrozenAt = built.state.quoteVersions.find(
      (v) => v.id === built.versionId,
    )?.frozenAt;

    const prepared = prepareAuthorizationRequest(
      built.state,
      advisorCtx({ idempotencyKey: "send-fail-prep" }),
      { quoteVersionId: built.versionId, audienceCustomerId: built.customerId },
    );
    if (!prepared.ok) throw new Error("setup failed");

    const outcome = markAuthorizationRequestSent(
      prepared.nextState,
      advisorCtx({ idempotencyKey: "send-fail-attempt" }),
      {
        authorizationRequestId: prepared.data.request.id,
        channel: "sms_manual_local",
        result: "failed",
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("prepared");
    const version = outcome.nextState.quoteVersions.find((v) => v.id === built.versionId);
    expect(version?.status).toBe("frozen");
    expect(version?.frozenAt).toBe(originalFrozenAt);
  });

  it("marks sent on a successful attempt", () => {
    const sent = buildSentRequest("send-ok");
    const request = sent.state.authorizationRequests.find((r) => r.id === sent.requestId);
    expect(request?.status).toBe("sent");
    expect(request?.sentChannel).toBe("whatsapp_manual_local");
  });
});

describe("VerifyAuthorizationAccess — /a/[token] (DATATEK_R0_A sección 10.2)", () => {
  it("accepts the correct token without needing any org permission (guest)", () => {
    const sent = buildSentRequest("verify-ok");
    const outcome = verifyAuthorizationAccess(
      sent.state,
      guestCtx({ idempotencyKey: "verify-ok-1" }),
      { token: sent.plainToken },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.authorizationRequestId).toBe(sent.requestId);
    expect(outcome.data.quoteVersionId).toBe(sent.versionId);

    const request = outcome.nextState.authorizationRequests.find((r) => r.id === sent.requestId);
    expect(request?.status).toBe("viewed");
  });

  it("locks the token after exactly 5 wrong attempts, returning the SAME neutral error every time", () => {
    const sent = buildSentRequest("verify-lock");
    const [tokenId] = sent.plainToken.split(".");
    let state: CrmVehicleState = sent.state;
    const messages: string[] = [];
    const codes: string[] = [];

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const outcome = verifyAuthorizationAccess(
        state,
        guestCtx({ idempotencyKey: `verify-lock-attempt-${attempt}` }),
        { token: `${tokenId}.wrong-secret-${attempt}` },
      );
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      messages.push(outcome.error.message);
      codes.push(outcome.error.code);
      // A failed attempt still has a side effect (attempt counter) — the
      // engine's `apply()` folds this in; tests call the pure function
      // directly, so thread the returned nextState by hand.
      state = (outcome as { nextState?: CrmVehicleState }).nextState ?? state;
    }

    // Every single failure — including the 5th, the one that trips the
    // lock — returned the exact same neutral message/code.
    expect(new Set(messages).size).toBe(1);
    expect(new Set(codes).size).toBe(1);
    expect(codes[0]).toBe("TOKEN_INVALID");

    const token = state.authorizationAccessTokens.find((t) => t.id === tokenId);
    expect(token?.attemptCount).toBe(5);
    expect(token?.lockedAt).toBeTruthy();

    // The 6th attempt — even with the CORRECT secret this time — is
    // rejected with the same neutral error; lock wins over a correct guess.
    const finalTry = verifyAuthorizationAccess(
      state,
      guestCtx({ idempotencyKey: "verify-lock-correct-after-lock" }),
      { token: sent.plainToken },
    );
    expect(finalTry.ok).toBe(false);
    if (finalTry.ok) return;
    expect(finalTry.error.message).toBe(messages[0]);
  });

  it("returns the same neutral error for a token that never existed", () => {
    const outcome = verifyAuthorizationAccess(
      buildReadyToQuoteCase("verify-none").state,
      guestCtx({ idempotencyKey: "verify-none-1" }),
      { token: "not-a-real-token-id.some-secret" },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("TOKEN_INVALID");
  });

  it("a malformed token (no secret component) is rejected without throwing — exercises the constant-time-compare length guard", () => {
    const sent = buildSentRequest("verify-malformed");
    const outcome = verifyAuthorizationAccess(
      sent.state,
      guestCtx({ idempotencyKey: "verify-malformed-1" }),
      { token: "no-dot-in-here" },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("TOKEN_INVALID");
  });
});

describe("RecordAuthorization — decisión total/parcial/rechazo (DATATEK_R0_A sección 9.4/10.3)", () => {
  it("accepts all lines and transitions the case to 'ready'", () => {
    const sent = buildSentRequest("record-all");
    const outcome = recordAuthorization(sent.state, guestCtx({ idempotencyKey: "record-all-1" }), {
      method: "secure_link",
      token: sent.plainToken,
      quoteVersionId: sent.versionId,
      quoteVersionHash: sent.hash,
      decision: "accept_all",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.authorization.status).toBe("accepted");
    expect(outcome.data.items).toHaveLength(2);
    expect(outcome.data.items.every((i) => i.decision === "accepted")).toBe(true);
    expect(outcome.data.case.status).toBe("ready");

    const request = outcome.nextState.authorizationRequests.find((r) => r.id === sent.requestId);
    expect(request?.status).toBe("decided");
    const token = outcome.nextState.authorizationAccessTokens.find(
      (t) => t.id === sent.plainToken.split(".")[0],
    );
    expect(token?.usedAt).toBeTruthy();
  });

  it("accepts a PARTIAL subset of lines — case still moves to 'ready'", () => {
    const sent = buildSentRequest("record-partial");
    const outcome = recordAuthorization(
      sent.state,
      guestCtx({ idempotencyKey: "record-partial-1" }),
      {
        method: "secure_link",
        token: sent.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "partial",
        acceptedQuoteItemIds: [sent.padsItemId],
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.authorization.status).toBe("partially_accepted");
    const accepted = outcome.data.items.filter((i) => i.decision === "accepted");
    const rejected = outcome.data.items.filter((i) => i.decision === "rejected");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.quoteItemId).toBe(sent.padsItemId);
    expect(rejected).toHaveLength(1);
    expect(outcome.data.case.status).toBe("ready");
  });

  it("rejects all lines and transitions the case to 'closed'", () => {
    const sent = buildSentRequest("record-reject");
    const outcome = recordAuthorization(
      sent.state,
      guestCtx({ idempotencyKey: "record-reject-1" }),
      {
        method: "secure_link",
        token: sent.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "reject",
        rejectionReason: "Cliente decidió no proceder por ahora.",
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.authorization.status).toBe("rejected");
    expect(outcome.data.items.every((i) => i.decision === "rejected")).toBe(true);
    expect(outcome.data.case.status).toBe("closed");
  });

  it("rejects a hash that does not match the currently frozen version", () => {
    const sent = buildSentRequest("record-badhash");
    const outcome = recordAuthorization(
      sent.state,
      guestCtx({ idempotencyKey: "record-badhash-1" }),
      {
        method: "secure_link",
        token: sent.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: "0".repeat(64),
        decision: "accept_all",
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");

    // The token was NOT consumed by a hash-mismatched attempt.
    const tokenId = sent.plainToken.split(".")[0];
    const token = sent.state.authorizationAccessTokens.find((t) => t.id === tokenId);
    expect(token?.usedAt).toBeFalsy();
  });

  it("double submit with the SAME idempotency key returns the same result, not a second authorization", () => {
    const sent = buildSentRequest("record-idem");
    const input = {
      method: "secure_link" as const,
      token: sent.plainToken,
      quoteVersionId: sent.versionId,
      quoteVersionHash: sent.hash,
      decision: "accept_all" as const,
    };
    const first = recordAuthorization(
      sent.state,
      guestCtx({ idempotencyKey: "record-idem-key" }),
      input,
    );
    if (!first.ok) throw new Error("setup failed");

    const second = recordAuthorization(
      first.nextState,
      guestCtx({ idempotencyKey: "record-idem-key" }),
      input,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.authorization.id).toBe(first.data.authorization.id);
    expect(second.nextState.authorizations).toHaveLength(1);
  });

  it("a second RecordAuthorization on an already-decided request (different idempotency key) fails", () => {
    const sent = buildSentRequest("record-twice");
    const first = recordAuthorization(sent.state, guestCtx({ idempotencyKey: "record-twice-1" }), {
      method: "secure_link",
      token: sent.plainToken,
      quoteVersionId: sent.versionId,
      quoteVersionHash: sent.hash,
      decision: "accept_all",
    });
    if (!first.ok) throw new Error("setup failed");

    const second = recordAuthorization(
      first.nextState,
      guestCtx({ idempotencyKey: "record-twice-2" }),
      {
        method: "secure_link",
        token: sent.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "accept_all",
      },
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    // The token is already `usedAt` — same neutral error as any other
    // dead-token case (sección 10.2/10.3: "una decisión... elimina
    // capacidad de mutar").
    expect(second.error.code).toBe("TOKEN_INVALID");
    expect(second.nextState?.authorizations).toHaveLength(1);
  });

  it("a staff_manual decision requires authorization.decide (owner has it, advisor does not)", () => {
    const sent = buildSentRequest("record-staff");
    const asAdvisor = recordAuthorization(
      sent.state,
      advisorCtx({ idempotencyKey: "record-staff-advisor" }),
      {
        method: "staff_manual",
        authorizationRequestId: sent.requestId,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "accept_all",
      },
    );
    expect(asAdvisor.ok).toBe(false);
    if (!asAdvisor.ok) expect(asAdvisor.error.code).toBe("FORBIDDEN");

    const asOwner = recordAuthorization(
      sent.state,
      ownerCtx({ idempotencyKey: "record-staff-owner" }),
      {
        method: "staff_manual",
        authorizationRequestId: sent.requestId,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "accept_all",
      },
    );
    expect(asOwner.ok).toBe(true);
    if (!asOwner.ok) return;
    expect(asOwner.data.authorization.method).toBe("staff_manual");
  });
});

describe("CreateQuoteVersion revokes pending requests of the superseded version", () => {
  it("a new version marks the prior frozen version's pending request 'revoked' and revokes its token", () => {
    const sent = buildSentRequest("supersede");
    const v2 = createQuoteVersion(sent.state, advisorCtx({ idempotencyKey: "supersede-v2" }), {
      quoteId: sent.quoteId,
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.data.revokedRequestIds).toContain(sent.requestId);

    const request = v2.nextState.authorizationRequests.find((r) => r.id === sent.requestId);
    expect(request?.status).toBe("revoked");
    expect(request?.supersededByQuoteVersionId).toBe(v2.data.version.id);

    const tokenId = sent.plainToken.split(".")[0];
    const token = v2.nextState.authorizationAccessTokens.find((t) => t.id === tokenId);
    expect(token?.revokedAt).toBeTruthy();

    // The now-revoked token can no longer be used to verify access.
    const verify = verifyAuthorizationAccess(
      v2.nextState,
      guestCtx({ idempotencyKey: "supersede-verify" }),
      { token: sent.plainToken },
    );
    expect(verify.ok).toBe(false);
    if (verify.ok) return;
    expect(verify.error.code).toBe("TOKEN_INVALID");
  });
});

describe("InvalidateAuthorization — append-only (DATATEK_R0_A sección 5.6)", () => {
  it("marks the authorization invalidated without deleting the original decision", () => {
    const sent = buildSentRequest("invalidate-ok");
    const decided = recordAuthorization(
      sent.state,
      guestCtx({ idempotencyKey: "invalidate-ok-decide" }),
      {
        method: "secure_link",
        token: sent.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "accept_all",
      },
    );
    if (!decided.ok) throw new Error("setup failed");

    const outcome = invalidateAuthorization(
      decided.nextState,
      ownerCtx({ idempotencyKey: "invalidate-ok-1" }),
      {
        authorizationId: decided.data.authorization.id,
        reason: "Cliente pidió cancelar por error de captura.",
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("invalidated");
    expect(outcome.data.invalidatedReason).toBeTruthy();

    // The authorization row still exists (append-only) and its items are
    // untouched — history is preserved, not deleted.
    expect(outcome.nextState.authorizations).toHaveLength(1);
    const items = outcome.nextState.authorizationItems.filter(
      (i) => i.authorizationId === decided.data.authorization.id,
    );
    expect(items).toHaveLength(2);
  });

  it("rejects invalidating an already-invalidated authorization", () => {
    const sent = buildSentRequest("invalidate-twice");
    const decided = recordAuthorization(
      sent.state,
      guestCtx({ idempotencyKey: "invalidate-twice-decide" }),
      {
        method: "secure_link",
        token: sent.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "accept_all",
      },
    );
    if (!decided.ok) throw new Error("setup failed");

    const first = invalidateAuthorization(
      decided.nextState,
      ownerCtx({ idempotencyKey: "invalidate-twice-1" }),
      { authorizationId: decided.data.authorization.id, reason: "Motivo inicial." },
    );
    if (!first.ok) throw new Error("setup failed");

    const second = invalidateAuthorization(
      first.nextState,
      ownerCtx({ idempotencyKey: "invalidate-twice-2" }),
      { authorizationId: decided.data.authorization.id, reason: "Segundo intento." },
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("CONFLICT");
  });
});

describe("RevokeAndReprepareAuthorizationRequest — Fase 4a (cierra el hallazgo de Fase 3)", () => {
  it("revokes the live request+token and issues a fresh pair for the SAME frozen version — old token dead, new token works", () => {
    const sent = buildSentRequest("reissue-ok");
    const state = withReissueFlag(sent.state, { organizationId: FIXTURE_ORGANIZATION_IDS.dtek });

    const outcome = revokeAndReprepareAuthorizationRequest(
      state,
      advisorCtx({ idempotencyKey: "reissue-ok-1" }),
      { authorizationRequestId: sent.requestId, reason: "Cliente perdió el enlace." },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.data.revokedRequest.id).toBe(sent.requestId);
    expect(outcome.data.revokedRequest.status).toBe("revoked");
    expect(outcome.data.revokedRequest.revokedReason).toBe("Cliente perdió el enlace.");
    expect(outcome.data.request.id).not.toBe(sent.requestId);
    expect(outcome.data.request.status).toBe("prepared");
    // Same case, same frozen quote version — nothing about WHAT is being
    // authorized changed, only the request/token pair.
    expect(outcome.data.request.quoteVersionId).toBe(sent.versionId);
    expect(outcome.data.request.audienceCustomerId).toBe(sent.customerId);
    expect(outcome.data.case.status).toBe("waiting_authorization");
    expect(outcome.data.plainToken).not.toBe(sent.plainToken);

    // The version/hash a customer would see are unchanged by a reissue.
    const version = outcome.nextState.quoteVersions.find((v) => v.id === sent.versionId);
    expect(version?.status).toBe("frozen");
    expect(version?.snapshotHash).toBe(sent.hash);

    // The OLD token no longer verifies...
    const oldTokenCheck = verifyAuthorizationAccess(
      outcome.nextState,
      guestCtx({ idempotencyKey: "reissue-ok-verify-old" }),
      { token: sent.plainToken },
    );
    expect(oldTokenCheck.ok).toBe(false);
    if (!oldTokenCheck.ok) expect(oldTokenCheck.error.code).toBe("TOKEN_INVALID");

    // ...but the NEW token does, and points at the same request/version.
    const newTokenCheck = verifyAuthorizationAccess(
      oldTokenCheck.nextState ?? outcome.nextState,
      guestCtx({ idempotencyKey: "reissue-ok-verify-new" }),
      { token: outcome.data.plainToken },
    );
    expect(newTokenCheck.ok).toBe(true);
    if (!newTokenCheck.ok) return;
    expect(newTokenCheck.data.authorizationRequestId).toBe(outcome.data.request.id);
    expect(newTokenCheck.data.quoteVersionId).toBe(sent.versionId);
  });

  it("the new token can complete a real decision (accept_all) after reissue", () => {
    const sent = buildSentRequest("reissue-decide");
    const state = withReissueFlag(sent.state, { organizationId: FIXTURE_ORGANIZATION_IDS.dtek });
    const reissued = revokeAndReprepareAuthorizationRequest(
      state,
      advisorCtx({ idempotencyKey: "reissue-decide-1" }),
      { authorizationRequestId: sent.requestId, reason: "Token bloqueado tras 5 intentos." },
    );
    if (!reissued.ok) throw new Error("setup failed");

    const decided = recordAuthorization(
      reissued.nextState,
      guestCtx({ idempotencyKey: "reissue-decide-2" }),
      {
        method: "secure_link",
        token: reissued.data.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "accept_all",
      },
    );
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.data.case.status).toBe("ready");
    expect(decided.data.authorization.authorizationRequestId).toBe(reissued.data.request.id);
  });

  it("fails when the feature flag is disabled for the organization", () => {
    const sent = buildSentRequest("reissue-flag-off");
    const state = withReissueFlag(sent.state, {
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      overrideEnabled: false,
    });

    const outcome = revokeAndReprepareAuthorizationRequest(
      state,
      advisorCtx({ idempotencyKey: "reissue-flag-off-1" }),
      { authorizationRequestId: sent.requestId, reason: "Cliente perdió el enlace." },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");

    // Nothing changed — the original request/token are still exactly as
    // they were, still usable.
    const verify = verifyAuthorizationAccess(
      sent.state,
      guestCtx({ idempotencyKey: "reissue-flag-off-verify" }),
      { token: sent.plainToken },
    );
    expect(verify.ok).toBe(true);
  });

  it("fails closed when the flag was never seeded at all (unknown key defaults to disabled)", () => {
    const sent = buildSentRequest("reissue-no-flag");
    const outcome = revokeAndReprepareAuthorizationRequest(
      sent.state,
      advisorCtx({ idempotencyKey: "reissue-no-flag-1" }),
      { authorizationRequestId: sent.requestId, reason: "Cliente perdió el enlace." },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");
  });

  it("rejects revoking a request that is not vigente (already decided)", () => {
    const sent = buildSentRequest("reissue-decided");
    const decided = recordAuthorization(
      sent.state,
      guestCtx({ idempotencyKey: "reissue-decided-decide" }),
      {
        method: "secure_link",
        token: sent.plainToken,
        quoteVersionId: sent.versionId,
        quoteVersionHash: sent.hash,
        decision: "accept_all",
      },
    );
    if (!decided.ok) throw new Error("setup failed");

    const state = withReissueFlag(decided.nextState, {
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = revokeAndReprepareAuthorizationRequest(
      state,
      advisorCtx({ idempotencyKey: "reissue-decided-1" }),
      { authorizationRequestId: sent.requestId, reason: "Intento inválido." },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");
  });

  it("requires a non-empty reason", () => {
    const sent = buildSentRequest("reissue-noreason");
    const state = withReissueFlag(sent.state, { organizationId: FIXTURE_ORGANIZATION_IDS.dtek });
    const outcome = revokeAndReprepareAuthorizationRequest(
      state,
      advisorCtx({ idempotencyKey: "reissue-noreason-1" }),
      { authorizationRequestId: sent.requestId, reason: "   " },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("double submit with the SAME idempotency key replays the same result — no double revoke", () => {
    const sent = buildSentRequest("reissue-idem");
    const state = withReissueFlag(sent.state, { organizationId: FIXTURE_ORGANIZATION_IDS.dtek });
    const input = { authorizationRequestId: sent.requestId, reason: "Cliente perdió el enlace." };

    const first = revokeAndReprepareAuthorizationRequest(
      state,
      advisorCtx({ idempotencyKey: "reissue-idem-key" }),
      input,
    );
    if (!first.ok) throw new Error("setup failed");

    const second = revokeAndReprepareAuthorizationRequest(
      first.nextState,
      advisorCtx({ idempotencyKey: "reissue-idem-key" }),
      input,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.request.id).toBe(first.data.request.id);
    expect(second.data.plainToken).toBe(first.data.plainToken);
    // Only ONE new request/token pair was ever created — replaying the same
    // key did not create a second one.
    const newRequests = second.nextState.authorizationRequests.filter(
      (r) => r.id === first.data.request.id,
    );
    expect(newRequests).toHaveLength(1);
  });
});
