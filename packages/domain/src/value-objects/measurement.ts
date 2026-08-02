// Generic Measurement value object — DATATEK_R0_A sección 9 (frenos):
// "unidades explícitas; medidas no negativas". No command in R0-D Fase 1
// persists a `measurements` row yet (that table ships in wave `0070`,
// inspección), but `RecordOdometerEvent` and future inspection commands
// share the same "explicit unit, non-negative value" invariant, so it is
// factored here once instead of duplicated per feature.
import { DomainInvariantError } from "./errors.ts";

export interface Measurement {
  readonly value: number;
  readonly unit: string;
}

const NON_EMPTY = (s: string) => s.trim().length > 0;

export function createMeasurement(value: number, unit: string): Measurement {
  if (!Number.isFinite(value)) {
    throw new DomainInvariantError("Measurement value must be a finite number", "value");
  }
  if (value < 0) {
    throw new DomainInvariantError("Measurement value must not be negative", "value");
  }
  if (!NON_EMPTY(unit)) {
    throw new DomainInvariantError("Measurement unit must be explicit, never inferred", "unit");
  }
  return { value, unit: unit.trim() };
}

export function equalsMeasurement(a: Measurement, b: Measurement): boolean {
  return a.unit === b.unit && a.value === b.value;
}
