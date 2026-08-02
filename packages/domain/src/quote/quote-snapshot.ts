// Deterministic freeze snapshot for a quote version — DATATEK_R0_D sección
// 11 "Freeze" / DATATEK_R0_A sección 9.2: "construye snapshot canónico...
// serializa de forma determinista... genera SHA-256". This module owns the
// canonicalization + hashing algorithm as a pure domain function so it can
// be unit-tested directly — same content -> same hash, regardless of item
// array order or of any database-generated id/timestamp — without going
// through the application-layer `FreezeQuoteVersion` command.
//
// Deliberately EXCLUDED from the hashed content: row ids, quoteId,
// versionNumber, frozenAt/createdAt, actor ids. None of those are part of
// "lo que se cotizó" (what was actually quoted) — two snapshots built from
// identical organization/case/currency/line content must hash identically
// even if they come from two different quote objects created at different
// times. That is what "determinismo real" means here, not merely "calling
// the same function twice with the same object returns the same value".
import { createHash } from "node:crypto";
import { createMoney, addMoney, type Money } from "../value-objects/money.ts";
import { DomainInvariantError } from "../value-objects/errors.ts";
import type { Visibility } from "../../generated/spec.constants.ts";

export interface QuoteSnapshotLineInput {
  lineType: string;
  description: string;
  /** Plain decimal quantity — same precedent as `Measurement.value`
   * elsewhere in this codebase (packages/domain/src/value-objects/
   * measurement.ts): a validated positive finite number, not a bigint/
   * scaled-integer scheme. Money is the only value that gets the
   * never-float bigint-minor-units treatment (R0-A sección 4.14). */
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  visibility: Visibility;
  requiresAuthorization: boolean;
  sourceType: string | null;
  sourceId: string | null;
  displayOrder: number;
}

export interface QuoteSnapshotInput {
  organizationId: string;
  caseId: string;
  currency: string;
  items: readonly QuoteSnapshotLineInput[];
}

export interface QuoteSnapshotLineComputed extends QuoteSnapshotLineInput {
  lineTotalMinor: number;
}

export interface QuoteSnapshot {
  /** Deterministic, key-sorted JSON string — this exact string is what gets
   * hashed. Persisted alongside the hash so a later audit can re-verify
   * `sha256(canonicalJson) === hash` without recomputing from live rows. */
  canonicalJson: string;
  /** Lowercase hex SHA-256 digest of `canonicalJson`. */
  hash: string;
  subtotalMinor: number;
  totalMinor: number;
  lines: QuoteSnapshotLineComputed[];
}

/** Recursively sorts object keys before stringifying so the same logical
 * content always serializes identically, independent of insertion order.
 * Sección 11: "JSON con claves ordenadas". */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Pure, deterministic: same logical content always produces the same
 * `hash`, regardless of the order `input.items` arrives in (sorted here by
 * `displayOrder` then `description`) and regardless of any volatile field
 * a caller might have accidentally left in a line object — this function
 * only reads the named fields of `QuoteSnapshotLineInput`, nothing else. */
export function buildQuoteSnapshot(input: QuoteSnapshotInput): QuoteSnapshot {
  if (input.items.length === 0) {
    throw new DomainInvariantError(
      "Una versión de cotización necesita al menos una línea para congelarse.",
      "items",
    );
  }

  const sortedItems = [...input.items].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.description.localeCompare(b.description);
  });

  let subtotal: Money = createMoney(0, input.currency);
  const lines: QuoteSnapshotLineComputed[] = sortedItems.map((item) => {
    if (item.currency !== input.currency) {
      throw new DomainInvariantError(
        `La línea usa moneda "${item.currency}", distinta a la moneda de la versión "${input.currency}".`,
        "currency",
      );
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new DomainInvariantError(
        "La cantidad de la línea debe ser un número positivo.",
        "quantity",
      );
    }
    const lineTotalMinor = Math.round(item.quantity * item.unitPriceMinor);
    subtotal = addMoney(subtotal, createMoney(lineTotalMinor, input.currency));
    return { ...item, lineTotalMinor };
  });

  // R0 does not model taxes/discounts (sección 9.1: "solo si el contrato
  // los soporta" — it does not, yet) so total === subtotal. Both are kept
  // as separate fields so a future wave can add discounts without
  // reshaping this return type.
  const canonicalObject = {
    organizationId: input.organizationId,
    caseId: input.caseId,
    currency: input.currency,
    subtotalMinor: subtotal.amountMinor,
    totalMinor: subtotal.amountMinor,
    lines: lines.map((l) => ({
      lineType: l.lineType,
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      currency: l.currency,
      visibility: l.visibility,
      requiresAuthorization: l.requiresAuthorization,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      displayOrder: l.displayOrder,
      lineTotalMinor: l.lineTotalMinor,
    })),
  };

  const canonicalJson = stableStringify(canonicalObject);
  const hash = createHash("sha256").update(canonicalJson, "utf8").digest("hex");

  return {
    canonicalJson,
    hash,
    subtotalMinor: subtotal.amountMinor,
    totalMinor: subtotal.amountMinor,
    lines,
  };
}
