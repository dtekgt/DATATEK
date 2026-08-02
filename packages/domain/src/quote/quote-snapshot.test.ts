import { describe, it } from "node:test";
import { expect } from "expect";
import { buildQuoteSnapshot, type QuoteSnapshotLineInput } from "./quote-snapshot.ts";
import { DomainInvariantError } from "../value-objects/errors.ts";

const brakePads: QuoteSnapshotLineInput = {
  lineType: "part",
  description: "Pastillas de freno delanteras",
  quantity: 1,
  unitPriceMinor: 45000,
  currency: "GTQ",
  visibility: "customer",
  requiresAuthorization: true,
  sourceType: "finding",
  sourceId: "finding-1",
  displayOrder: 1,
};

const labor: QuoteSnapshotLineInput = {
  lineType: "labor",
  description: "Mano de obra — instalación de pastillas",
  quantity: 1.5,
  unitPriceMinor: 12000,
  currency: "GTQ",
  visibility: "customer",
  requiresAuthorization: true,
  sourceType: "manual",
  sourceId: null,
  displayOrder: 2,
};

describe("buildQuoteSnapshot — determinismo real (DATATEK_R0_D sección 11)", () => {
  it("produces the exact same hash for the same logical content called twice", () => {
    const a = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [brakePads, labor],
    });
    const b = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [brakePads, labor],
    });
    expect(a.hash).toBe(b.hash);
    expect(a.canonicalJson).toBe(b.canonicalJson);
  });

  it("produces the same hash regardless of item array order (order-independence)", () => {
    const forward = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [brakePads, labor],
    });
    const reversed = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [labor, brakePads],
    });
    expect(forward.hash).toBe(reversed.hash);
  });

  it("produces the same hash for two DIFFERENT quotes with equivalent content — the hash is a function of content, not of object identity", () => {
    // Simulates freezing two separate quote versions (different quoteId/
    // versionNumber/frozenAt in the real command) built from equivalent
    // line data — exactly the scenario DATATEK_R0_D asks to be proven:
    // "congela dos veces datos equivalentes y compara hashes".
    const first = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [{ ...brakePads }, { ...labor }],
    });
    const second = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [
        // Different object references, same logical values.
        { ...brakePads, description: brakePads.description },
        { ...labor, description: labor.description },
      ],
    });
    expect(first.hash).toBe(second.hash);
  });

  it("produces a DIFFERENT hash when a price changes", () => {
    const original = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [brakePads, labor],
    });
    const changed = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [{ ...brakePads, unitPriceMinor: 46000 }, labor],
    });
    expect(original.hash).not.toBe(changed.hash);
  });

  it("produces a DIFFERENT hash when a quantity or description changes", () => {
    const base = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [brakePads],
    });
    const quantityChanged = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [{ ...brakePads, quantity: 2 }],
    });
    const descriptionChanged = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [{ ...brakePads, description: "Pastillas de freno traseras" }],
    });
    expect(base.hash).not.toBe(quantityChanged.hash);
    expect(base.hash).not.toBe(descriptionChanged.hash);
  });

  it("computes subtotal/total as the sum of rounded line totals", () => {
    const snapshot = buildQuoteSnapshot({
      organizationId: "org-dtek-servicios",
      caseId: "case-1",
      currency: "GTQ",
      items: [brakePads, labor],
    });
    // brakePads: 1 * 45000 = 45000; labor: 1.5 * 12000 = 18000
    expect(snapshot.subtotalMinor).toBe(63000);
    expect(snapshot.totalMinor).toBe(63000);
  });

  it("rejects an empty line list", () => {
    expect(() =>
      buildQuoteSnapshot({
        organizationId: "org-dtek-servicios",
        caseId: "case-1",
        currency: "GTQ",
        items: [],
      }),
    ).toThrow(DomainInvariantError);
  });

  it("rejects a line in a different currency than the version", () => {
    expect(() =>
      buildQuoteSnapshot({
        organizationId: "org-dtek-servicios",
        caseId: "case-1",
        currency: "GTQ",
        items: [{ ...brakePads, currency: "USD" }],
      }),
    ).toThrow(DomainInvariantError);
  });

  it("rejects a non-positive quantity", () => {
    expect(() =>
      buildQuoteSnapshot({
        organizationId: "org-dtek-servicios",
        caseId: "case-1",
        currency: "GTQ",
        items: [{ ...brakePads, quantity: 0 }],
      }),
    ).toThrow(DomainInvariantError);
  });
});
