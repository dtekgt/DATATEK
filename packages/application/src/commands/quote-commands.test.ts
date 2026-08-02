import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { buildTestContext, buildReadyToQuoteCase } from "./test-helpers.ts";
import {
  createQuote,
  createQuoteVersion,
  addQuoteItem,
  updateDraftQuoteItem,
  freezeQuoteVersion,
} from "./quote-commands.ts";
import type { CrmVehicleState } from "./state.ts";

const advisorCtx = (overrides: Partial<Parameters<typeof buildTestContext>[0]> = {}) =>
  buildTestContext({
    actorId: FIXTURE_ACTOR_IDS.advisorDtek,
    organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    ...overrides,
  });

/** Builds a case with a completed inspection (still `inspection` — see
 * `ReadyToQuoteCase`), a quote, a draft version, and two lines (brake pads +
 * labor) — the common starting point for most tests below. Pass
 * `existingCase` to attach a SECOND quote to a case an
 * earlier call already built (used by the hash-determinism test below,
 * which needs two different quotes on the same case to isolate "same
 * content -> same hash" from caseId, which is itself part of the hashed
 * content by design — see `packages/domain/src/quote/quote-snapshot.ts`). */
function buildDraftVersionWithTwoLines(
  prefix: string,
  existingCase?: { state: CrmVehicleState; caseId: string },
) {
  const kase = existingCase ?? buildReadyToQuoteCase(prefix);

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

  const pads = addQuoteItem(
    version.nextState,
    advisorCtx({ idempotencyKey: `${prefix}-item-pads` }),
    {
      quoteVersionId: version.data.version.id,
      lineType: "part",
      description: "Pastillas de freno delanteras",
      quantity: 1,
      unitPriceMinor: 45000,
      currency: "GTQ",
      displayOrder: 1,
    },
  );
  if (!pads.ok) throw new Error(`setup failed: pads item (${pads.error.message})`);

  const labor = addQuoteItem(
    pads.nextState,
    advisorCtx({ idempotencyKey: `${prefix}-item-labor` }),
    {
      quoteVersionId: version.data.version.id,
      lineType: "labor",
      description: "Mano de obra — instalación",
      quantity: 1,
      unitPriceMinor: 12000,
      currency: "GTQ",
      displayOrder: 2,
    },
  );
  if (!labor.ok) throw new Error(`setup failed: labor item (${labor.error.message})`);

  return {
    state: labor.nextState,
    caseId: kase.caseId,
    quoteId: quote.data.id,
    versionId: version.data.version.id,
    padsItemId: pads.data.id,
    laborItemId: labor.data.id,
  };
}

describe("CreateQuote", () => {
  it("creates a quote for a case not in a terminal state", () => {
    const kase = buildReadyToQuoteCase("cq-ok");
    const outcome = createQuote(kase.state, advisorCtx({ idempotencyKey: "cq-1" }), {
      caseId: kase.caseId,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.caseId).toBe(kase.caseId);
  });

  it("rejects a case that does not exist", () => {
    const kase = buildReadyToQuoteCase("cq-missing");
    const outcome = createQuote(kase.state, advisorCtx({ idempotencyKey: "cq-missing-1" }), {
      caseId: "case-does-not-exist",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NOT_FOUND");
  });
});

describe("AddQuoteItem / UpdateDraftQuoteItem — draft is editable", () => {
  it("computes totalMinor and rolls it into the version subtotal", () => {
    const built = buildDraftVersionWithTwoLines("aqi-ok");
    const version = built.state.quoteVersions.find((v) => v.id === built.versionId);
    expect(version?.subtotalMinor).toBe(45000 + 12000);
    expect(version?.totalMinor).toBe(45000 + 12000);
  });

  it("rejects a line in a different currency than the version", () => {
    const built = buildDraftVersionWithTwoLines("aqi-currency");
    const outcome = addQuoteItem(built.state, advisorCtx({ idempotencyKey: "aqi-currency-bad" }), {
      quoteVersionId: built.versionId,
      lineType: "part",
      description: "Línea en USD",
      quantity: 1,
      unitPriceMinor: 100,
      currency: "USD",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("edits a draft item's quantity/price and recomputes totals", () => {
    const built = buildDraftVersionWithTwoLines("udi-ok");
    const outcome = updateDraftQuoteItem(built.state, advisorCtx({ idempotencyKey: "udi-1" }), {
      quoteItemId: built.padsItemId,
      quantity: 2,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.totalMinor).toBe(90000);
    const version = outcome.nextState.quoteVersions.find((v) => v.id === built.versionId);
    expect(version?.totalMinor).toBe(90000 + 12000);
  });
});

describe("FreezeQuoteVersion — inmutabilidad (DATATEK_R0_D sección 11)", () => {
  it("freezes a draft version, producing a hash and a frozen_at", () => {
    const built = buildDraftVersionWithTwoLines("freeze-ok");
    const outcome = freezeQuoteVersion(built.state, advisorCtx({ idempotencyKey: "freeze-1" }), {
      quoteVersionId: built.versionId,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("frozen");
    expect(outcome.data.snapshotHash).toBeTruthy();
    expect(outcome.data.snapshotHash?.length).toBe(64); // hex sha256
    expect(outcome.data.frozenAt).toBeTruthy();
    expect(outcome.data.totalMinor).toBe(57000);
  });

  it("produces the SAME hash for two DIFFERENT quotes on the same case built from equivalent lines — real determinism, not just 'a' hash", () => {
    const kase = buildReadyToQuoteCase("freeze-det-case");
    const first = buildDraftVersionWithTwoLines("freeze-det-a", kase);
    const second = buildDraftVersionWithTwoLines("freeze-det-b", kase);

    const frozenFirst = freezeQuoteVersion(
      first.state,
      advisorCtx({ idempotencyKey: "freeze-det-a-1" }),
      { quoteVersionId: first.versionId },
    );
    const frozenSecond = freezeQuoteVersion(
      second.state,
      advisorCtx({ idempotencyKey: "freeze-det-b-1" }),
      { quoteVersionId: second.versionId },
    );
    expect(frozenFirst.ok).toBe(true);
    expect(frozenSecond.ok).toBe(true);
    if (!frozenFirst.ok || !frozenSecond.ok) return;

    // Different quoteId/versionId/frozenAt/row-generated-ids — but
    // IDENTICAL organization, case, currency and line content
    // (description/quantity/price/visibility/etc). The hash must match:
    // it is a function of content, not of row identity.
    expect(frozenFirst.data.snapshotHash).toBe(frozenSecond.data.snapshotHash);
    expect(frozenFirst.data.quoteId).not.toBe(frozenSecond.data.quoteId);
    expect(frozenFirst.data.id).not.toBe(frozenSecond.data.id);
  });

  it("produces a DIFFERENT hash when a price differs", () => {
    const baselineBuilt = buildDraftVersionWithTwoLines("freeze-diff-base");
    const baseline = freezeQuoteVersion(
      baselineBuilt.state,
      advisorCtx({ idempotencyKey: "freeze-diff-base-freeze" }),
      { quoteVersionId: baselineBuilt.versionId },
    );
    if (!baseline.ok) throw new Error("setup failed: baseline freeze");

    const changedBuilt = buildDraftVersionWithTwoLines("freeze-diff-changed");
    const changed = updateDraftQuoteItem(
      changedBuilt.state,
      advisorCtx({ idempotencyKey: "freeze-diff-changed-edit" }),
      { quoteItemId: changedBuilt.padsItemId, unitPriceMinor: 46000 },
    );
    if (!changed.ok) throw new Error("setup failed: edit price");
    const frozenChanged = freezeQuoteVersion(
      changed.nextState,
      advisorCtx({ idempotencyKey: "freeze-diff-changed-freeze" }),
      { quoteVersionId: changedBuilt.versionId },
    );
    if (!frozenChanged.ok) throw new Error("setup failed: changed freeze");

    expect(baseline.data.snapshotHash).not.toBe(frozenChanged.data.snapshotHash);
  });

  it("rejects freezing an already-frozen version", () => {
    const built = buildDraftVersionWithTwoLines("freeze-twice");
    const first = freezeQuoteVersion(
      built.state,
      advisorCtx({ idempotencyKey: "freeze-twice-1" }),
      {
        quoteVersionId: built.versionId,
      },
    );
    if (!first.ok) throw new Error("setup failed");

    const second = freezeQuoteVersion(
      first.nextState,
      advisorCtx({ idempotencyKey: "freeze-twice-2" }),
      { quoteVersionId: built.versionId },
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("CONFLICT");
  });

  it("rejects freezing a version with no lines", () => {
    const kase = buildReadyToQuoteCase("freeze-empty");
    const quote = createQuote(kase.state, advisorCtx({ idempotencyKey: "freeze-empty-quote" }), {
      caseId: kase.caseId,
    });
    if (!quote.ok) throw new Error("setup failed");
    const version = createQuoteVersion(
      quote.nextState,
      advisorCtx({ idempotencyKey: "freeze-empty-version" }),
      { quoteId: quote.data.id },
    );
    if (!version.ok) throw new Error("setup failed");

    const outcome = freezeQuoteVersion(
      version.nextState,
      advisorCtx({ idempotencyKey: "freeze-empty-freeze" }),
      { quoteVersionId: version.data.version.id },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("rejects AddQuoteItem on a frozen version", () => {
    const built = buildDraftVersionWithTwoLines("freeze-then-add");
    const frozen = freezeQuoteVersion(
      built.state,
      advisorCtx({ idempotencyKey: "freeze-then-add-freeze" }),
      { quoteVersionId: built.versionId },
    );
    if (!frozen.ok) throw new Error("setup failed");

    const outcome = addQuoteItem(
      frozen.nextState,
      advisorCtx({ idempotencyKey: "freeze-then-add-item" }),
      {
        quoteVersionId: built.versionId,
        lineType: "part",
        description: "Otra línea",
        quantity: 1,
        unitPriceMinor: 1000,
        currency: "GTQ",
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");
  });

  it("rejects UpdateDraftQuoteItem on a frozen version — frozen is truly immutable", () => {
    const built = buildDraftVersionWithTwoLines("freeze-then-update");
    const frozen = freezeQuoteVersion(
      built.state,
      advisorCtx({ idempotencyKey: "freeze-then-update-freeze" }),
      { quoteVersionId: built.versionId },
    );
    if (!frozen.ok) throw new Error("setup failed");

    const outcome = updateDraftQuoteItem(
      frozen.nextState,
      advisorCtx({ idempotencyKey: "freeze-then-update-edit" }),
      { quoteItemId: built.padsItemId, quantity: 5 },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");

    // And the frozen row itself never moved.
    const version = frozen.nextState.quoteVersions.find((v) => v.id === built.versionId);
    expect(version?.status).toBe("frozen");
  });
});

describe("CreateQuoteVersion — nueva versión", () => {
  it("increments versionNumber and supersedes the prior frozen version", () => {
    const built = buildDraftVersionWithTwoLines("newver-ok");
    const frozen = freezeQuoteVersion(
      built.state,
      advisorCtx({ idempotencyKey: "newver-freeze" }),
      { quoteVersionId: built.versionId },
    );
    if (!frozen.ok) throw new Error("setup failed");

    const v2 = createQuoteVersion(frozen.nextState, advisorCtx({ idempotencyKey: "newver-v2" }), {
      quoteId: built.quoteId,
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.data.version.versionNumber).toBe(2);
    expect(v2.data.supersededVersionId).toBe(built.versionId);

    const priorVersion = v2.nextState.quoteVersions.find((v) => v.id === built.versionId);
    expect(priorVersion?.status).toBe("superseded");
    expect(priorVersion?.supersededByVersionId).toBe(v2.data.version.id);
  });
});
