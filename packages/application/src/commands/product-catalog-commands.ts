// Product catalog commands — companion to the 0094 migration and
// `getProductCatalogForOrg` (queries/product-catalog.ts).
//
// Unlike the service catalog (neutral, seed-only, no writer per sección 6),
// the product catalog IS organization-scoped inventory (state.ts's
// `ProductCatalogItemRow` doc comment) — so it gets a real writer here,
// same precedent as `RegisterVehicle`/`CreateManualIntake` in this
// directory. Same Money/price_mode contract as
// `service_catalog_versions` (R0-A sección 4.15), reused as-is.
import {
  requirePermission,
  validationError,
  notFoundError,
  type CommandContext,
} from "./context.ts";
import {
  appendAuditEvent,
  appendIdempotencyRecord,
  cryptoRandomId,
  findIdempotentReplay,
  type CommandOutcome,
  type CrmVehicleState,
  type ProductCatalogItemRow,
} from "./state.ts";
import type { ServicePriceMode } from "@datatek/domain";

const PERMISSION_MANAGE_PARTS = "parts.manage" as const;
const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;

// --- RegisterProduct ---------------------------------------------------

export interface RegisterProductInput {
  sku?: string | null;
  category: string;
  name: string;
  brand?: string | null;
  unit: string;
  priceMode: ServicePriceMode;
  fixedAmountMinor?: number | null;
  fromAmountMinor?: number | null;
  rangeMinAmountMinor?: number | null;
  rangeMaxAmountMinor?: number | null;
  currency: string;
  quantityOnHand: number;
}

const COMMAND_REGISTER_PRODUCT = "RegisterProduct";

/** Same exact CHECK-constraint shape as `0094_product_catalog.sql` /
 * `0040_catalog.sql`'s service versions (R0-A sección 4.15) — every price
 * mode declares exactly the amount fields it needs, never more, never
 * fewer. Validated here too so an invalid row is never even offered to
 * `nextState`, matching how every other command in this engine validates
 * before mutating (never "validate in Postgres, trust here"). */
function validatePriceModeAmounts(input: RegisterProductInput) {
  switch (input.priceMode) {
    case "fixed":
      if (input.fixedAmountMinor == null || input.fixedAmountMinor < 0) {
        return validationError(
          "price_mode 'fixed' requiere fixedAmountMinor >= 0.",
          "fixedAmountMinor",
        );
      }
      if (
        input.fromAmountMinor != null ||
        input.rangeMinAmountMinor != null ||
        input.rangeMaxAmountMinor != null
      ) {
        return validationError(
          "price_mode 'fixed' no admite fromAmountMinor ni rangeMin/MaxAmountMinor.",
          "priceMode",
        );
      }
      return null;
    case "from":
      if (input.fromAmountMinor == null || input.fromAmountMinor < 0) {
        return validationError(
          "price_mode 'from' requiere fromAmountMinor >= 0.",
          "fromAmountMinor",
        );
      }
      if (
        input.fixedAmountMinor != null ||
        input.rangeMinAmountMinor != null ||
        input.rangeMaxAmountMinor != null
      ) {
        return validationError(
          "price_mode 'from' no admite fixedAmountMinor ni rangeMin/MaxAmountMinor.",
          "priceMode",
        );
      }
      return null;
    case "range":
      if (
        input.rangeMinAmountMinor == null ||
        input.rangeMaxAmountMinor == null ||
        input.rangeMinAmountMinor < 0 ||
        input.rangeMaxAmountMinor < input.rangeMinAmountMinor
      ) {
        return validationError(
          "price_mode 'range' requiere rangeMinAmountMinor >= 0 y rangeMaxAmountMinor >= rangeMinAmountMinor.",
          "rangeMaxAmountMinor",
        );
      }
      if (input.fixedAmountMinor != null || input.fromAmountMinor != null) {
        return validationError(
          "price_mode 'range' no admite fixedAmountMinor ni fromAmountMinor.",
          "priceMode",
        );
      }
      return null;
    case "inspection_required":
    case "diagnosis_required":
      if (
        input.fixedAmountMinor != null ||
        input.fromAmountMinor != null ||
        input.rangeMinAmountMinor != null ||
        input.rangeMaxAmountMinor != null
      ) {
        return validationError(
          `price_mode '${input.priceMode}' no admite ningún monto.`,
          "priceMode",
        );
      }
      return null;
    default:
      return validationError("price_mode inválido.", "priceMode");
  }
}

export function registerProduct(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RegisterProductInput,
): CommandOutcome<ProductCatalogItemRow> {
  const replay = findIdempotentReplay<ProductCatalogItemRow>(state, ctx, COMMAND_REGISTER_PRODUCT);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, PERMISSION_MANAGE_PARTS);
  if (permError) return { ok: false, error: permError };

  if (!NON_EMPTY(input.name)) {
    return { ok: false, error: validationError("El nombre del producto es obligatorio.", "name") };
  }
  if (!NON_EMPTY(input.category)) {
    return { ok: false, error: validationError("La categoría es obligatoria.", "category") };
  }
  if (!NON_EMPTY(input.unit)) {
    return { ok: false, error: validationError("La unidad es obligatoria.", "unit") };
  }
  if (!NON_EMPTY(input.currency)) {
    return { ok: false, error: validationError("La moneda es obligatoria.", "currency") };
  }
  if (!Number.isFinite(input.quantityOnHand) || input.quantityOnHand < 0) {
    return {
      ok: false,
      error: validationError("quantityOnHand debe ser un número >= 0.", "quantityOnHand"),
    };
  }

  const priceError = validatePriceModeAmounts(input);
  if (priceError) return { ok: false, error: priceError };

  // sku es único por organización cuando está presente (índice parcial en
  // 0094) — la misma organización no puede registrar dos productos con el
  // mismo sku, pero sku nulo (sin código todavía) no colisiona nunca.
  if (input.sku != null) {
    const skuTaken = state.productCatalogItems.some(
      (p) => p.organizationId === ctx.organizationId && p.sku === input.sku,
    );
    if (skuTaken) {
      return {
        ok: false,
        error: validationError("Ya existe un producto con este SKU en esta organización.", "sku"),
      };
    }
  }

  const product: ProductCatalogItemRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    sku: input.sku ?? null,
    category: input.category,
    name: input.name,
    brand: input.brand ?? null,
    unit: input.unit,
    priceMode: input.priceMode,
    fixedAmountMinor: input.fixedAmountMinor ?? null,
    fromAmountMinor: input.fromAmountMinor ?? null,
    rangeMinAmountMinor: input.rangeMinAmountMinor ?? null,
    rangeMaxAmountMinor: input.rangeMaxAmountMinor ?? null,
    currency: input.currency,
    quantityOnHand: input.quantityOnHand,
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_REGISTER_PRODUCT, "Producto registrado", {
    productId: product.id,
    sku: product.sku,
    name: product.name,
  });

  const nextState: CrmVehicleState = {
    ...state,
    productCatalogItems: [...state.productCatalogItems, product],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_REGISTER_PRODUCT, product),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: product, replayed: false };
}

// --- AdjustProductStock --------------------------------------------------

export interface AdjustProductStockInput {
  productId: string;
  /** Delta a aplicar sobre quantityOnHand — positivo (reabastecimiento) o
   * negativo (venta/consumo). Nunca un valor absoluto: dos ajustes
   * concurrentes deben poder sumarse sin pisarse (a diferencia de
   * `RegisterProduct`, que sí fija un valor inicial absoluto). */
  quantityDelta: number;
  reason: string;
}

const COMMAND_ADJUST_PRODUCT_STOCK = "AdjustProductStock";

export function adjustProductStock(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: AdjustProductStockInput,
): CommandOutcome<ProductCatalogItemRow> {
  const replay = findIdempotentReplay<ProductCatalogItemRow>(
    state,
    ctx,
    COMMAND_ADJUST_PRODUCT_STOCK,
  );
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, PERMISSION_MANAGE_PARTS);
  if (permError) return { ok: false, error: permError };

  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    return {
      ok: false,
      error: validationError("quantityDelta debe ser un número distinto de 0.", "quantityDelta"),
    };
  }
  if (!NON_EMPTY(input.reason)) {
    return { ok: false, error: validationError("reason es obligatorio.", "reason") };
  }

  const product = state.productCatalogItems.find(
    (p) => p.id === input.productId && p.organizationId === ctx.organizationId,
  );
  if (!product) return { ok: false, error: notFoundError() };

  const nextQuantity = product.quantityOnHand + input.quantityDelta;
  if (nextQuantity < 0) {
    return {
      ok: false,
      error: validationError("El ajuste dejaría quantityOnHand en negativo.", "quantityDelta"),
    };
  }

  const updated: ProductCatalogItemRow = { ...product, quantityOnHand: nextQuantity };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_ADJUST_PRODUCT_STOCK,
    "Existencia de producto ajustada",
    { productId: product.id, quantityDelta: input.quantityDelta, reason: input.reason },
  );

  const nextState: CrmVehicleState = {
    ...state,
    productCatalogItems: state.productCatalogItems.map((p) => (p.id === product.id ? updated : p)),
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_ADJUST_PRODUCT_STOCK, updated),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: updated, replayed: false };
}
