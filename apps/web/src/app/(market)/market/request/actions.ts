"use server";

import { z } from "zod";
import { getCommandsEngine } from "../../../../lib/commands-engine";
import { buildGuestCommandContext } from "../../../../lib/command-context";

const requestSchema = z.object({
  workshopSlug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(1).max(40),
  customerEmail: z.string().trim().max(200).optional(),
  vehicleLabel: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
});

export interface MarketRequestActionState {
  status: "idle" | "success" | "error";
  message?: string;
  folioCode?: string;
}

export async function createMarketQuoteRequestAction(
  _previous: MarketRequestActionState,
  formData: FormData,
): Promise<MarketRequestActionState> {
  const parsed = requestSchema.safeParse({
    workshopSlug: String(formData.get("workshopSlug") ?? ""),
    customerName: String(formData.get("customerName") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
    customerEmail: String(formData.get("customerEmail") ?? "") || undefined,
    vehicleLabel: String(formData.get("vehicleLabel") ?? ""),
    description: String(formData.get("description") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revisa los datos antes de enviar.",
    };
  }

  const data = parsed.data;
  const ctx = buildGuestCommandContext({ orgSlug: data.workshopSlug });
  if (!ctx) return { status: "error", message: "No encontramos ese taller." };

  const outcome = getCommandsEngine().createMarketQuoteRequest(ctx, {
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerEmail: data.customerEmail ?? null,
    vehicleLabel: data.vehicleLabel,
    description: data.description,
  });

  if (!outcome.ok) {
    return { status: "error", message: outcome.error.message };
  }

  return {
    status: "success",
    message: "Solicitud enviada. Guarda tu folio para dar seguimiento en /market/requests.",
    folioCode: outcome.data.folioCode,
  };
}
