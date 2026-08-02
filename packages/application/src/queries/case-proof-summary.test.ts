import { describe, it } from "node:test";
import { expect } from "expect";
import {
  createUploadIntent,
  confirmEvidenceUpload,
  linkEvidence,
} from "../commands/inspection-commands.ts";
import { getCaseProofSummary } from "./case-proof-summary.ts";
import {
  buildQueryContext,
  buildPartiallyAuthorizedScenario,
  inspectorCtx,
} from "./query-test-helpers.ts";
import type { EvidenceAssetRow, EvidenceLinkRow } from "../commands/state.ts";

describe("getCaseProofSummary — DATATEK_R0_D sección 3.1 (nunca éxito falso)", () => {
  it("returns null for a case that does not belong to the requesting customer", () => {
    const scenario = buildPartiallyAuthorizedScenario("proof-notmine");
    const ctx = buildQueryContext({ audience: "pass", actorId: "someone-else" });
    expect(getCaseProofSummary(scenario.state, ctx, scenario.caseId)).toBeNull();
  });

  it("completedSuccessfully is always false, even after a real authorization decision", () => {
    const scenario = buildPartiallyAuthorizedScenario("proof-neverclaim");
    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getCaseProofSummary(scenario.state, ctx, scenario.caseId);
    expect(result?.completedSuccessfully).toBe(false);
  });

  it("facts reflect the real inspection/quote/decision that actually happened", () => {
    const scenario = buildPartiallyAuthorizedScenario("proof-facts");
    const ctx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const result = getCaseProofSummary(scenario.state, ctx, scenario.caseId);

    expect(result?.facts.some((f) => f.label === "Inspección completada")).toBe(true);
    const quoteFact = result?.facts.find((f) => f.label.startsWith("Cotización congelada"));
    expect(quoteFact).toBeTruthy();
    expect(quoteFact?.detail).toContain(scenario.hash.slice(0, 8));
    // Never the FULL hash to a customer-facing audience.
    expect(quoteFact?.detail).not.toContain(scenario.hash);
    const decisionFact = result?.facts.find((f) => f.label === "Decisión registrada");
    expect(decisionFact?.detail).toContain("Autorizado parcialmente");
    expect(result?.decisionsCount).toBe(1);
  });

  it("evidenceCount: only confirmed AND audience-visible evidence counts", () => {
    const scenario = buildPartiallyAuthorizedScenario("proof-evidence");

    const intent = createUploadIntent(scenario.state, inspectorCtx("proof-evidence-intent"), {
      caseId: scenario.caseId,
      purpose: "Foto de pastillas",
      declaredMime: "image/jpeg",
      visibilityRequested: "customer",
    });
    if (!intent.ok) throw new Error("setup failed");
    const confirmed = confirmEvidenceUpload(
      intent.nextState,
      inspectorCtx("proof-evidence-confirm"),
      { uploadIntentId: intent.data.id, mimeDetected: "image/jpeg", bytes: 1024, hash: "abc123" },
    );
    if (!confirmed.ok) throw new Error("setup failed");
    const linkedCustomer = linkEvidence(
      confirmed.nextState,
      inspectorCtx("proof-evidence-link-customer"),
      {
        assetId: confirmed.data.id,
        entityType: "case",
        entityId: scenario.caseId,
        visibility: "customer",
      },
    );
    if (!linkedCustomer.ok) throw new Error("setup failed");

    // A second, INTERNAL-only confirmed asset — counts for pro, not for pass.
    const intent2 = createUploadIntent(
      linkedCustomer.nextState,
      inspectorCtx("proof-evidence-intent2"),
      {
        caseId: scenario.caseId,
        purpose: "Nota interna de taller",
        declaredMime: "image/jpeg",
        visibilityRequested: "internal",
      },
    );
    if (!intent2.ok) throw new Error("setup failed");
    const confirmed2 = confirmEvidenceUpload(
      intent2.nextState,
      inspectorCtx("proof-evidence-confirm2"),
      { uploadIntentId: intent2.data.id, mimeDetected: "image/jpeg", bytes: 2048, hash: "def456" },
    );
    if (!confirmed2.ok) throw new Error("setup failed");
    const linkedInternal = linkEvidence(
      confirmed2.nextState,
      inspectorCtx("proof-evidence-link-internal"),
      {
        assetId: confirmed2.data.id,
        entityType: "case",
        entityId: scenario.caseId,
        visibility: "internal",
      },
    );
    if (!linkedInternal.ok) throw new Error("setup failed");

    // A THIRD asset that never finished uploading (`pending_upload`) with a
    // link spliced directly onto state — the real `LinkEvidence` command
    // structurally cannot link an unconfirmed asset (it requires the asset
    // row to already exist in `evidenceAssets`, which only
    // `ConfirmEvidenceUpload` creates), so this exercises the defensive
    // "pending never counts" filter directly rather than only relying on
    // that structural impossibility.
    const pendingAsset: EvidenceAssetRow = {
      id: "asset-pending-proof",
      organizationId: linkedInternal.nextState.customers.find((c) => c.id === scenario.customerId)!
        .organizationId,
      uploadIntentId: "intent-pending-proof",
      uploaderId: "u-inspector-dtek",
      bucket: "evidence",
      path: "pending/path",
      mimeDeclared: "image/jpeg",
      mimeDetected: null,
      bytes: null,
      hash: null,
      capturedAt: null,
      uploadedAt: null,
      provenance: "observed",
      visibilityMax: "customer",
      status: "pending_upload",
      invalidatedAt: null,
      invalidatedReason: null,
      replacesAssetId: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    const pendingLink: EvidenceLinkRow = {
      id: "link-pending-proof",
      organizationId: pendingAsset.organizationId,
      assetId: pendingAsset.id,
      entityType: "case",
      entityId: scenario.caseId,
      purpose: null,
      caption: null,
      visibility: "customer",
      displayOrder: 0,
      actorId: "u-inspector-dtek",
      effectiveAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    const finalState = {
      ...linkedInternal.nextState,
      evidenceAssets: [...linkedInternal.nextState.evidenceAssets, pendingAsset],
      evidenceLinks: [...linkedInternal.nextState.evidenceLinks, pendingLink],
    };

    const passCtx = buildQueryContext({ audience: "pass", actorId: scenario.customerId });
    const passResult = getCaseProofSummary(finalState, passCtx, scenario.caseId);
    // Only the customer-visible CONFIRMED asset counts — not the internal
    // one, not the pending one.
    expect(passResult?.evidenceCount).toBe(1);

    const proCtx = buildQueryContext({ audience: "pro", actorId: "u-advisor-dtek" });
    const proResult = getCaseProofSummary(finalState, proCtx, scenario.caseId);
    // Pro sees both CONFIRMED assets (customer + internal) — still never
    // the pending one.
    expect(proResult?.evidenceCount).toBe(2);
  });
});
