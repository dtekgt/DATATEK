import { describe, it } from "node:test";
import { expect } from "expect";
import {
  createEmptyState,
  type CrmVehicleState,
  type CustomerRow,
} from "@datatek/application/commands";
import { diffState } from "./diff.ts";
import { buildTableRegistry } from "./tables.ts";

function customer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: "cust-1",
    organizationId: "org-1",
    displayName: "Cliente de prueba",
    customerType: "person",
    status: "provisional",
    source: "walk_in",
    createdAt: "2026-08-05T00:00:00.000Z",
    effectiveAt: "2026-08-05T00:00:00.000Z",
    createdBy: "actor-1",
    ...overrides,
  };
}

describe("diffState", () => {
  it("detects a new row as inserted, not updated", () => {
    const before: CrmVehicleState = createEmptyState();
    const after: CrmVehicleState = { ...before, customers: [customer()] };
    const registry = buildTableRegistry("org-1");

    const [diff] = diffState(before, after, registry, ["customers"]);
    if (!diff) throw new Error("expected a diff for 'customers'");
    expect(diff.inserted).toHaveLength(1);
    expect(diff.updated).toHaveLength(0);
    expect(diff.inserted[0]?.id).toBe("cust-1");
  });

  it("detects a changed existing row as updated, not inserted", () => {
    const original = customer({ status: "provisional" });
    const before: CrmVehicleState = { ...createEmptyState(), customers: [original] };
    const after: CrmVehicleState = {
      ...before,
      customers: [{ ...original, status: "active" }],
    };
    const registry = buildTableRegistry("org-1");

    const [diff] = diffState(before, after, registry, ["customers"]);
    if (!diff) throw new Error("expected a diff for 'customers'");
    expect(diff.inserted).toHaveLength(0);
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0]?.status).toBe("active");
  });

  it("finds nothing when a row is unchanged", () => {
    const row = customer();
    const before: CrmVehicleState = { ...createEmptyState(), customers: [row] };
    const after: CrmVehicleState = { ...before, customers: [row] };
    const registry = buildTableRegistry("org-1");

    const [diff] = diffState(before, after, registry, ["customers"]);
    if (!diff) throw new Error("expected a diff for 'customers'");
    expect(diff.inserted).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
  });

  it("throws a loud error for a table with no registered TableSpec", () => {
    const before = createEmptyState();
    const after = createEmptyState();
    expect(() => diffState(before, after, {}, ["customers"] as (keyof CrmVehicleState)[])).toThrow(
      /customers/,
    );
  });
});
