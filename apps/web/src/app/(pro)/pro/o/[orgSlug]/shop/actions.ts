"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ServicePriceMode } from "@datatek/domain";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { buildStaffCommandContext } from "../../../../../../lib/command-context";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

const NAME_MAX = 120;

const formSchema = z
  .object({
    orgSlug: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9-]+$/),
    sku: z.string().trim().max(60),
    category: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2).max(NAME_MAX),
    brand: z.string().trim().max(60),
    unit: z.string().trim().min(1).max(20),
    priceMode: z.enum(["fixed", "from", "range", "inspection_required", "diagnosis_required"]),
    fixedAmount: z.string().trim().max(16),
    fromAmount: z.string().trim().max(16),
    rangeMinAmount: z.string().trim().max(16),
    rangeMaxAmount: z.string().trim().max(16),
    quantityOnHand: z.string().trim().max(16),
  })
  .superRefine((value, ctx) => {
    // Un quetzal (o cualquier moneda con 2 decimales) se captura en el
    // formulario como texto decimal — la conversión a centavos ocurre acá,
    // nunca en el cliente, para no confiar en aritmética de punto flotante
    // fuera de este único lugar.
    const toMinor = (raw: string) => {
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.round(n * 100) : NaN;
    };
    if (
      value.priceMode === "fixed" &&
      (toMinor(value.fixedAmount) == null || Number.isNaN(toMinor(value.fixedAmount)))
    ) {
      ctx.addIssue({ code: "custom", path: ["fixedAmount"], message: "Indica el precio fijo." });
    }
    if (
      value.priceMode === "from" &&
      (toMinor(value.fromAmount) == null || Number.isNaN(toMinor(value.fromAmount)))
    ) {
      ctx.addIssue({ code: "custom", path: ["fromAmount"], message: "Indica el precio desde." });
    }
    if (value.priceMode === "range") {
      const min = toMinor(value.rangeMinAmount);
      const max = toMinor(value.rangeMaxAmount);
      if (min == null || Number.isNaN(min)) {
        ctx.addIssue({
          code: "custom",
          path: ["rangeMinAmount"],
          message: "Indica el precio mínimo.",
        });
      }
      if (max == null || Number.isNaN(max)) {
        ctx.addIssue({
          code: "custom",
          path: ["rangeMaxAmount"],
          message: "Indica el precio máximo.",
        });
      }
      if (min != null && max != null && !Number.isNaN(min) && !Number.isNaN(max) && max < min) {
        ctx.addIssue({
          code: "custom",
          path: ["rangeMaxAmount"],
          message: "El máximo debe ser mayor o igual al mínimo.",
        });
      }
    }
    const qty = Number(value.quantityOnHand || "0");
    if (!Number.isFinite(qty) || qty < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quantityOnHand"],
        message: "La existencia debe ser un número >= 0.",
      });
    }
  });

function toMinorOrNull(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export interface RegisterProductActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function registerProductFromShop(
  _previous: RegisterProductActionState,
  formData: FormData,
): Promise<RegisterProductActionState> {
  const parsed = formSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    category: String(formData.get("category") ?? ""),
    name: String(formData.get("name") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    unit: String(formData.get("unit") ?? ""),
    priceMode: String(formData.get("priceMode") ?? "fixed"),
    fixedAmount: String(formData.get("fixedAmount") ?? ""),
    fromAmount: String(formData.get("fromAmount") ?? ""),
    rangeMinAmount: String(formData.get("rangeMinAmount") ?? ""),
    rangeMaxAmount: String(formData.get("rangeMaxAmount") ?? ""),
    quantityOnHand: String(formData.get("quantityOnHand") ?? "0"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revisa los datos antes de guardar.",
    };
  }

  const data = parsed.data;
  const session = await getWebSession(data.orgSlug, "parts.manage");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return {
      status: "error",
      message: "Tu acceso no permite administrar el catálogo de productos de este taller.",
    };
  }

  const ctx = await buildStaffCommandContext({
    actorId: session.actorId,
    orgSlug: data.orgSlug,
    branchId: session.availableBranches[0]?.id ?? null,
  });
  if (!ctx) return { status: "error", message: "No encontramos el espacio de este taller." };

  const outcome = getCommandsEngine().registerProduct(ctx, {
    sku: data.sku || null,
    category: data.category,
    name: data.name,
    brand: data.brand || null,
    unit: data.unit,
    priceMode: data.priceMode as ServicePriceMode,
    fixedAmountMinor: data.priceMode === "fixed" ? toMinorOrNull(data.fixedAmount) : null,
    fromAmountMinor: data.priceMode === "from" ? toMinorOrNull(data.fromAmount) : null,
    rangeMinAmountMinor: data.priceMode === "range" ? toMinorOrNull(data.rangeMinAmount) : null,
    rangeMaxAmountMinor: data.priceMode === "range" ? toMinorOrNull(data.rangeMaxAmount) : null,
    currency: "GTQ",
    quantityOnHand: Number(data.quantityOnHand || "0"),
  });

  if (!outcome.ok) {
    return { status: "error", message: outcome.error.message };
  }

  revalidatePath(`/pro/o/${data.orgSlug}/shop`);

  return { status: "success", message: `Producto "${outcome.data.name}" agregado al catálogo.` };
}
