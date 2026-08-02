import { describe, it } from "node:test";
import { expect } from "expect";
import { assertValidMaintenanceRecommendationDraft } from "./maintenance-recommendation.ts";
import { DomainInvariantError } from "../value-objects/errors.ts";

describe("Maintenance recommendation invariants — R0-A sección 4.15", () => {
  it("accepts trigger_kind=date with due_at", () => {
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "date",
        dueAt: "2027-01-01T00:00:00.000Z",
        dueOdometerKm: null,
        customerExplanation: null,
      }),
    ).not.toThrow();
  });

  it("rejects trigger_kind=date without due_at", () => {
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "date",
        dueAt: null,
        dueOdometerKm: null,
        customerExplanation: null,
      }),
    ).toThrow(DomainInvariantError);
  });

  it("accepts trigger_kind=odometer with due_odometer_km", () => {
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "odometer",
        dueAt: null,
        dueOdometerKm: 90000,
        customerExplanation: null,
      }),
    ).not.toThrow();
  });

  it("rejects trigger_kind=odometer without due_odometer_km", () => {
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "odometer",
        dueAt: null,
        dueOdometerKm: null,
        customerExplanation: null,
      }),
    ).toThrow(DomainInvariantError);
  });

  it("accepts trigger_kind=whichever_first only with both due_at and due_odometer_km", () => {
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "whichever_first",
        dueAt: "2027-01-01T00:00:00.000Z",
        dueOdometerKm: 90000,
        customerExplanation: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "whichever_first",
        dueAt: "2027-01-01T00:00:00.000Z",
        dueOdometerKm: null,
        customerExplanation: null,
      }),
    ).toThrow(DomainInvariantError);
  });

  it("accepts trigger_kind=condition only with customer_explanation (the 'unknown' recommendation shape)", () => {
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "condition",
        dueAt: null,
        dueOdometerKm: null,
        customerExplanation:
          "No se pudo determinar vencimiento por falta de lectura de odómetro confiable.",
      }),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "condition",
        dueAt: null,
        dueOdometerKm: null,
        customerExplanation: null,
      }),
    ).toThrow(DomainInvariantError);
  });

  it("rejects negative due_odometer_km regardless of trigger_kind", () => {
    expect(() =>
      assertValidMaintenanceRecommendationDraft({
        triggerKind: "odometer",
        dueAt: null,
        dueOdometerKm: -1,
        customerExplanation: null,
      }),
    ).toThrow(DomainInvariantError);
  });
});
