"use server";

import { z } from "zod";
import { getCommandsEngine } from "../../../../lib/commands-engine";
import { buildGuestCommandContext, resolveOrgBySlug } from "../../../../lib/command-context";
import type { MarketQuoteRequestRow, MarketOfferRow } from "@datatek/application/commands";

const lookupSchema = z.object({
  workshopSlug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  folioCode: z.string().trim().min(1).max(64),
  customerPhone: z.string().trim().min(1).max(40),
});

export interface MarketRequestLookup {
  workshopSlug: string;
  request: MarketQuoteRequestRow;
  offer: MarketOfferRow | null;
}

export type LookupMarketRequestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "found"; result: MarketRequestLookup };

export async function lookupMarketRequestAction(
  _previous: LookupMarketRequestState,
  formData: FormData,
): Promise<LookupMarketRequestState> {
  const parsed = lookupSchema.safeParse({
    workshopSlug: String(formData.get("workshopSlug") ?? ""),
    folioCode: String(formData.get("folioCode") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error", message: "Revisa el taller, folio y teléfono." };
  }

  const org = resolveOrgBySlug(parsed.data.workshopSlug);
  if (!org) return { status: "error", message: "No encontramos ese taller." };

  const state = getCommandsEngine().getState();
  const request = state.marketQuoteRequests.find(
    (r) =>
      r.organizationId === org.id &&
      r.folioCode === parsed.data.folioCode.trim() &&
      r.customerPhone === parsed.data.customerPhone.trim(),
  );
  // Mismo criterio de error neutral que el resto del engine: folio, teléfono
  // o taller equivocado se ven todos igual desde afuera.
  if (!request) {
    return { status: "error", message: "No encontramos una solicitud con esos datos." };
  }

  const offer = state.marketOffers.find((o) => o.requestId === request.id) ?? null;

  return {
    status: "found",
    result: { workshopSlug: parsed.data.workshopSlug, request, offer },
  };
}

const decideSchema = z.object({
  workshopSlug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  requestId: z.string().min(1).max(128),
  customerPhone: z.string().trim().min(1).max(40),
  decision: z.enum(["accepted", "rejected"]),
  rejectionReason: z.string().trim().max(300).optional(),
});

export type DecideMarketOfferState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; decision: "accepted" | "rejected" };

export async function decideMarketOfferAction(
  _previous: DecideMarketOfferState,
  formData: FormData,
): Promise<DecideMarketOfferState> {
  const parsed = decideSchema.safeParse({
    workshopSlug: String(formData.get("workshopSlug") ?? ""),
    requestId: String(formData.get("requestId") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
    decision: String(formData.get("decision") ?? ""),
    rejectionReason: String(formData.get("rejectionReason") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Solicitud inválida." };
  }

  const ctx = buildGuestCommandContext({ orgSlug: parsed.data.workshopSlug });
  if (!ctx) return { status: "error", message: "No encontramos ese taller." };

  const outcome = getCommandsEngine().respondToMarketOffer(ctx, {
    requestId: parsed.data.requestId,
    customerPhone: parsed.data.customerPhone,
    decision: parsed.data.decision,
    rejectionReason: parsed.data.rejectionReason ?? null,
  });

  if (!outcome.ok) return { status: "error", message: outcome.error.message };

  return { status: "done", decision: parsed.data.decision };
}
