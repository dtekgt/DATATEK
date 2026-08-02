import { describe, it } from "node:test";
import { expect } from "expect";
import { FIXTURE_ACTOR_IDS, FIXTURE_ORGANIZATION_IDS } from "../fixtures/tenancy.ts";
import { createEmptyState } from "./state.ts";
import {
  createProvisionalCustomer,
  addCustomerContact,
  linkCustomerAuthIdentity,
} from "./crm-commands.ts";
import { buildTestContext } from "./test-helpers.ts";

describe("CreateProvisionalCustomer", () => {
  it("creates a customer without requiring an account", () => {
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("provisional");
    expect(outcome.data.organizationId).toBe(FIXTURE_ORGANIZATION_IDS.dtek);
    expect(outcome.nextState.customers).toHaveLength(1);
    expect(outcome.nextState.auditLog).toHaveLength(1);
  });

  it("rejects an actor without crm.manage (customer role only has crm.read)", () => {
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.customerDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "Cliente",
      source: "walk_in",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("FORBIDDEN");
  });

  it("rejects a blank display name", () => {
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "   ",
      source: "walk_in",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("replays the same result for a repeated idempotency key instead of duplicating", () => {
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      idempotencyKey: "idem-create-customer-1",
    });
    const first = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = createProvisionalCustomer(first.nextState, ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.replayed).toBe(true);
    expect(second.data.id).toBe(first.data.id);
    expect(second.nextState.customers).toHaveLength(1);
  });
});

describe("AddCustomerContact", () => {
  function createCustomer() {
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });
    if (!outcome.ok) throw new Error("fixture setup failed");
    return outcome;
  }

  it("adds a normalized, unverified contact", () => {
    const created = createCustomer();
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = addCustomerContact(created.nextState, ctx, {
      customerId: created.data.id,
      channel: "whatsapp",
      rawValue: "+502 5555-1234",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.normalizedValue).toBe("+50255551234");
    expect(outcome.data.verified).toBe(false);
  });

  it("does not leak whether a customer id belongs to another organization", () => {
    const created = createCustomer();
    const ctxOtherOrg = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.ownerDemo,
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
    });
    const outcome = addCustomerContact(created.nextState, ctxOtherOrg, {
      customerId: created.data.id,
      channel: "email",
      rawValue: "cliente@example.com",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NOT_FOUND");
  });

  it("rejects an invalid email", () => {
    const created = createCustomer();
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const outcome = addCustomerContact(created.nextState, ctx, {
      customerId: created.data.id,
      channel: "email",
      rawValue: "not-an-email",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });
});

describe("LinkCustomerAuthIdentity", () => {
  it("requires verified=true before linking", () => {
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const created = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });
    if (!created.ok) throw new Error("setup failed");

    const outcome = linkCustomerAuthIdentity(created.nextState, ctx, {
      customerId: created.data.id,
      userId: "u-new-account",
      verificationMethod: "otp_phone",
      verified: false,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("VALIDATION");
  });

  it("links a verified account and promotes the customer to active", () => {
    const ctx = buildTestContext({
      actorId: FIXTURE_ACTOR_IDS.advisorDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
    });
    const created = createProvisionalCustomer(createEmptyState(), ctx, {
      displayName: "María López",
      source: "whatsapp_manual",
    });
    if (!created.ok) throw new Error("setup failed");

    const outcome = linkCustomerAuthIdentity(created.nextState, ctx, {
      customerId: created.data.id,
      userId: "u-new-account",
      verificationMethod: "otp_phone",
      verified: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.status).toBe("verified");
    const customer = outcome.nextState.customers.find((c) => c.id === created.data.id);
    expect(customer?.status).toBe("active");
  });

  it("refuses to fuse a second customer in the same org behind an already-linked account", () => {
    // Each call below gets its OWN idempotency key, exactly like distinct
    // user actions would in a real client — reusing one key across
    // different commands would (correctly) replay the first result instead
    // of running the later ones, which is not what this test is exercising.
    const buildCtx = () =>
      buildTestContext({
        actorId: FIXTURE_ACTOR_IDS.advisorDtek,
        organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      });

    const customerA = createProvisionalCustomer(createEmptyState(), buildCtx(), {
      displayName: "Cliente A",
      source: "walk_in",
    });
    if (!customerA.ok) throw new Error("setup failed");
    const linked = linkCustomerAuthIdentity(customerA.nextState, buildCtx(), {
      customerId: customerA.data.id,
      userId: "u-shared-account",
      verificationMethod: "otp_phone",
      verified: true,
    });
    if (!linked.ok) throw new Error("setup failed");

    const customerB = createProvisionalCustomer(linked.nextState, buildCtx(), {
      displayName: "Cliente B",
      source: "walk_in",
    });
    if (!customerB.ok) throw new Error("setup failed");

    const outcome = linkCustomerAuthIdentity(customerB.nextState, buildCtx(), {
      customerId: customerB.data.id,
      userId: "u-shared-account",
      verificationMethod: "otp_phone",
      verified: true,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("CONFLICT");
  });
});
