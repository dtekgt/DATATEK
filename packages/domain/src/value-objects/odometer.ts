// Odometer value object — DATATEK_R0_D sección 5: "odómetro guarda valor,
// unidad, procedencia, actor y fecha; valores atípicos generan
// conflicto/revisión, no sobrescritura."
//
// This file only models the value + the pure conflict decision. It does not
// know about `vehicle_odometer_events` rows, actors, or organizations —
// `packages/application`'s `RecordOdometerEvent` command wraps this with
// that context and decides what to persist. The record itself is always
// appended, never overwritten (sección 4.14: "hechos operativos no usan
// borrado en cascada"); this module only decides whether the append is
// `accepted` or `conflict`.
import { DomainInvariantError } from "./errors.ts";

export type OdometerUnit = "km" | "mi";

const MI_TO_KM = 1.60934;

export interface OdometerValue {
  readonly value: number;
  readonly unit: OdometerUnit;
}

/** Odometers are read as whole units in practice (R0 does not model
 * fractional km/mi) and must never be negative — "unidades explícitas" and
 * "medidas no negativas" both apply here (R0-A sección 9). */
export function createOdometerValue(value: number, unit: OdometerUnit): OdometerValue {
  if (!Number.isInteger(value)) {
    throw new DomainInvariantError("Odometer value must be a whole number", "value");
  }
  if (value < 0) {
    throw new DomainInvariantError("Odometer value must not be negative", "value");
  }
  if (unit !== "km" && unit !== "mi") {
    throw new DomainInvariantError("Odometer unit must be explicit: 'km' or 'mi'", "unit");
  }
  return { value, unit };
}

/** Normalizes to km for comparison only. The original `value`/`unit` the
 * reading was captured in is still what gets persisted — normalization is
 * never a substitute for storing the real unit (sección 4.14). */
export function odometerValueInKm(reading: OdometerValue): number {
  return reading.unit === "km" ? reading.value : Math.round(reading.value * MI_TO_KM);
}

export type OdometerEventStatus = "accepted" | "conflict";

export type OdometerConflictReason = "regression" | "implausible_jump" | "out_of_order_reading";

export interface OdometerEvaluation {
  status: OdometerEventStatus;
  reason: OdometerConflictReason | null;
}

export interface OdometerReadingPoint {
  valueKm: number;
  recordedAt: string;
}

/** A generous ceiling used only to flag readings for human review — not a
 * hard physical limit. Kept far above any plausible daily use so it never
 * false-positives on real mileage. */
const MAX_PLAUSIBLE_KM_PER_DAY = 1500;
const MIN_WINDOW_DAYS = 1 / 24;

/** Pure decision: does `next` conflict with the most recent accepted
 * reading for the same physical vehicle? `previous` is `null` for a
 * vehicle's first-ever reading (always accepted). Never mutates or discards
 * `previous` — the caller always appends `next` as a new row regardless of
 * the returned status (sección 5: "no sobrescritura"). */
export function evaluateOdometerReading(
  previous: OdometerReadingPoint | null,
  next: OdometerReadingPoint,
): OdometerEvaluation {
  if (next.valueKm < 0) {
    throw new DomainInvariantError("Odometer value must not be negative", "valueKm");
  }
  if (!previous) {
    return { status: "accepted", reason: null };
  }

  if (next.valueKm < previous.valueKm) {
    return { status: "conflict", reason: "regression" };
  }

  const previousAt = new Date(previous.recordedAt).getTime();
  const nextAt = new Date(next.recordedAt).getTime();

  if (nextAt < previousAt && next.valueKm !== previous.valueKm) {
    return { status: "conflict", reason: "out_of_order_reading" };
  }

  if (nextAt > previousAt) {
    const days = Math.max((nextAt - previousAt) / 86_400_000, MIN_WINDOW_DAYS);
    const deltaKm = next.valueKm - previous.valueKm;
    if (deltaKm > days * MAX_PLAUSIBLE_KM_PER_DAY) {
      return { status: "conflict", reason: "implausible_jump" };
    }
  }

  return { status: "accepted", reason: null };
}
