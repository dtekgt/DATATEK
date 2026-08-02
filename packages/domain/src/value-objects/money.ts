// Money value object — DATATEK_R0_A sección 4.14: "Dinero como bigint en
// unidades menores + moneda ISO", nunca float.
//
// Implementation note: the Postgres column for every money field in
// 0040_catalog.sql is `bigint` (minor units), exactly per that convention.
// At the TypeScript layer this value object stores `amountMinor` as a
// `number`, not a `bigint` primitive: R0-D's fixture engine and its
// temporary HTTP route (apps/web) round-trip commands through
// `JSON.stringify`/`JSON.parse`, and `bigint` throws on serialization with
// no native JSON representation. A validated integer within
// `Number.isSafeInteger` range (±9007199254740991 minor units — far beyond
// any realistic quote total) carries the same "never float" guarantee
// without that friction. Every constructor below still rejects
// non-integers, so this is a deliberate, documented substitution, not a
// silent precision loss.
import { DomainInvariantError } from "./errors.ts";

const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;

export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export function createMoney(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor) || !Number.isSafeInteger(amountMinor)) {
    throw new DomainInvariantError(
      "Money.amountMinor must be a safe integer in minor units, never a float",
      "amountMinor",
    );
  }
  if (amountMinor < 0) {
    throw new DomainInvariantError("Money.amountMinor must not be negative", "amountMinor");
  }
  if (!ISO_CURRENCY_PATTERN.test(currency)) {
    throw new DomainInvariantError("Money.currency must be a 3-letter ISO 4217 code", "currency");
  }
  return { amountMinor, currency };
}

export function zeroMoney(currency: string): Money {
  return createMoney(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainInvariantError(
      `Cannot combine amounts in different currencies (${a.currency} vs ${b.currency})`,
      "currency",
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinor + b.amountMinor, a.currency);
}

/** Subtraction never goes negative — a quote/authorization never owes a
 * negative amount. Callers that need a signed delta should compare
 * `amountMinor` directly instead of calling this. */
export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  const result = a.amountMinor - b.amountMinor;
  if (result < 0) {
    throw new DomainInvariantError("Money subtraction must not produce a negative amount");
  }
  return createMoney(result, a.currency);
}

export function isZeroMoney(money: Money): boolean {
  return money.amountMinor === 0;
}

export function equalsMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor === b.amountMinor) return 0;
  return a.amountMinor < b.amountMinor ? -1 : 1;
}

/** Presentation only — never used for calculation. Assumes a 2-decimal
 * minor unit (true for GTQ/USD, the only seeded currencies in R0). */
export function formatMoney(money: Money, locale: string = "es-GT"): string {
  const major = money.amountMinor / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency: money.currency }).format(
    major,
  );
}
