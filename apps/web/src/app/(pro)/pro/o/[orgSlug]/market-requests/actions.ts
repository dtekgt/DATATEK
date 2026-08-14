"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { buildStaffCommandContext } from "../../../../../../lib/command-context";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

const offerSchema = z.object({
  orgSlug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  requestId: z.string().min(1).max(128),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).toUpperCase(),
  message: z.string().trim().max(500).optional(),
});

export interface SubmitMarketOfferActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function submitMarketOfferAction(
  _previous: SubmitMarketOfferActionState,
  formData: FormData,
): Promise<SubmitMarketOfferActionState> {
  const parsed = offerSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    requestId: String(formData.get("requestId") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    currency: String(formData.get("currency") ?? "GTQ"),
    message: String(formData.get("message") ?? "") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revisa el monto antes de enviar la oferta.",
    };
  }

  const data = parsed.data;
  const session = await getWebSession(data.orgSlug, "quote.manage");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return { status: "error", message: "Tu acceso no permite enviar ofertas en este taller." };
  }

  const ctx = await buildStaffCommandContext({
    actorId: session.actorId,
    orgSlug: data.orgSlug,
    branchId: session.availableBranches[0]?.id ?? null,
  });
  if (!ctx) return { status: "error", message: "No encontramos el espacio de este taller." };

  const outcome = getCommandsEngine().submitMarketOffer(ctx, {
    requestId: data.requestId,
    amountMinor: Math.round(data.amount * 100),
    currency: data.currency,
    message: data.message ?? null,
  });

  if (!outcome.ok) return { status: "error", message: outcome.error.message };

  revalidatePath(`/pro/o/${data.orgSlug}/market-requests`);
  return { status: "success", message: "Oferta enviada." };
}
