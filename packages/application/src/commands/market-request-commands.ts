// Market — solicitudes de cotización de invitado.
//
// `CreateMarketQuoteRequest`, `SubmitMarketOffer`, `RespondToMarketOffer`.
//
// A diferencia de todo lo demás en `commands/*.ts`, las dos operaciones del
// lado del cliente (crear solicitud, aceptar/rechazar oferta) NO llaman
// `requirePermission`: quien las ejecuta es un visitante anónimo de
// /market, no un miembro de la organización — no hay membresía que revisar.
// Ver `dtek-invitado-sin-garage` (regla de producto): agendar/pedir
// presupuesto nunca debe exigir cuenta. `SubmitMarketOffer` sí es una
// acción de taller (Pro) y se gatea igual que el resto de comandos de
// negocio, con `quote.manage`.
import {
  requirePermission,
  validationError,
  notFoundError,
  conflictError,
  type CommandContext,
} from "./context.ts";
import {
  appendAuditEvent,
  cryptoRandomId,
  consumeOrganizationCounter,
  type CommandOutcome,
  type CrmVehicleState,
  type MarketQuoteRequestRow,
  type MarketOfferRow,
} from "./state.ts";

const MARKET_OFFER_PERMISSION = "quote.manage" as const;
const NON_EMPTY = (s: string | null | undefined) => !!s && s.trim().length > 0;

// --- CreateMarketQuoteRequest ---------------------------------------------

export interface CreateMarketQuoteRequestInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  vehicleLabel: string;
  description: string;
}

const COMMAND_CREATE_MARKET_QUOTE_REQUEST = "CreateMarketQuoteRequest";

export function createMarketQuoteRequest(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateMarketQuoteRequestInput,
): CommandOutcome<MarketQuoteRequestRow> {
  if (!NON_EMPTY(input.customerName)) {
    return { ok: false, error: validationError("Escribe tu nombre.", "customerName") };
  }
  if (!NON_EMPTY(input.customerPhone)) {
    return { ok: false, error: validationError("Escribe un teléfono de contacto.", "customerPhone") };
  }
  if (!NON_EMPTY(input.vehicleLabel)) {
    return { ok: false, error: validationError("Describe el vehículo.", "vehicleLabel") };
  }
  if (!NON_EMPTY(input.description)) {
    return { ok: false, error: validationError("Describe qué necesitas.", "description") };
  }

  const { value: counterValue, nextState: withCounter } = consumeOrganizationCounter(
    state,
    ctx.organizationId,
    "market_request",
  );
  const year = ctx.now.getUTCFullYear();
  const folioCode = `MKT-${year}-${String(counterValue).padStart(5, "0")}`;

  const request: MarketQuoteRequestRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    folioCode,
    status: "submitted",
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerEmail: input.customerEmail?.trim() || null,
    vehicleLabel: input.vehicleLabel.trim(),
    description: input.description.trim(),
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_CREATE_MARKET_QUOTE_REQUEST,
    "Solicitud de cotización de invitado creada",
    { requestId: request.id, folioCode: request.folioCode },
  );

  const nextState: CrmVehicleState = {
    ...withCounter,
    marketQuoteRequests: [...withCounter.marketQuoteRequests, request],
    auditLog: [...withCounter.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: request, replayed: false };
}

// --- SubmitMarketOffer -----------------------------------------------------

export interface SubmitMarketOfferInput {
  requestId: string;
  amountMinor: number;
  currency: string;
  message?: string | null;
}

const COMMAND_SUBMIT_MARKET_OFFER = "SubmitMarketOffer";

export function submitMarketOffer(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: SubmitMarketOfferInput,
): CommandOutcome<MarketOfferRow> {
  const permError = requirePermission(ctx, MARKET_OFFER_PERMISSION);
  if (permError) return { ok: false, error: permError };

  const request = state.marketQuoteRequests.find(
    (r) => r.id === input.requestId && r.organizationId === ctx.organizationId,
  );
  if (!request) return { ok: false, error: notFoundError() };
  if (request.status !== "submitted") {
    return {
      ok: false,
      error: conflictError(
        `Solo una solicitud 'submitted' puede recibir oferta (estado actual: ${request.status}).`,
      ),
    };
  }

  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return {
      ok: false,
      error: validationError(
        "amountMinor debe ser un entero positivo en unidades menores.",
        "amountMinor",
      ),
    };
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    return {
      ok: false,
      error: validationError("currency debe ser un código ISO de 3 letras.", "currency"),
    };
  }

  const offer: MarketOfferRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    requestId: request.id,
    amountMinor: input.amountMinor,
    currency: input.currency,
    message: input.message?.trim() || null,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
    respondedAt: null,
    respondedStatus: null,
    rejectionReason: null,
  };

  const updatedRequest: MarketQuoteRequestRow = {
    ...request,
    status: "offered",
    updatedAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_SUBMIT_MARKET_OFFER, "Oferta enviada al cliente", {
    requestId: request.id,
    offerId: offer.id,
  });

  const nextState: CrmVehicleState = {
    ...state,
    marketOffers: [...state.marketOffers, offer],
    marketQuoteRequests: state.marketQuoteRequests.map((r) =>
      r.id === request.id ? updatedRequest : r,
    ),
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: offer, replayed: false };
}

// --- RespondToMarketOffer ---------------------------------------------------

export interface RespondToMarketOfferInput {
  requestId: string;
  customerPhone: string;
  decision: "accepted" | "rejected";
  rejectionReason?: string | null;
}

const COMMAND_RESPOND_TO_MARKET_OFFER = "RespondToMarketOffer";

export function respondToMarketOffer(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: RespondToMarketOfferInput,
): CommandOutcome<MarketQuoteRequestRow> {
  const request = state.marketQuoteRequests.find(
    (r) => r.id === input.requestId && r.organizationId === ctx.organizationId,
  );
  // Comprobante liviano (folio + teléfono), no autenticación real — un
  // teléfono que no coincide se trata igual que una solicitud inexistente,
  // mismo criterio "errores neutrales al frontend" que
  // `tokenInvalidError` (authorization-commands.ts).
  if (!request || request.customerPhone !== input.customerPhone.trim()) {
    return { ok: false, error: notFoundError() };
  }
  if (request.status !== "offered") {
    return {
      ok: false,
      error: conflictError(
        `Esta solicitud no tiene una oferta pendiente de respuesta (estado actual: ${request.status}).`,
      ),
    };
  }
  if (input.decision === "rejected" && !NON_EMPTY(input.rejectionReason)) {
    return { ok: false, error: validationError("Escribe un motivo de rechazo.", "rejectionReason") };
  }

  const offer = state.marketOffers.find(
    (o) => o.requestId === request.id && o.respondedAt === null,
  );
  if (!offer) return { ok: false, error: notFoundError() };

  const updatedOffer: MarketOfferRow = {
    ...offer,
    respondedAt: ctx.now.toISOString(),
    respondedStatus: input.decision,
    rejectionReason: input.decision === "rejected" ? input.rejectionReason!.trim() : null,
  };

  const updatedRequest: MarketQuoteRequestRow = {
    ...request,
    status: input.decision,
    updatedAt: ctx.now.toISOString(),
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_RESPOND_TO_MARKET_OFFER,
    input.decision === "accepted" ? "Cliente aceptó la oferta" : "Cliente rechazó la oferta",
    { requestId: request.id, offerId: offer.id },
  );

  const nextState: CrmVehicleState = {
    ...state,
    marketOffers: state.marketOffers.map((o) => (o.id === offer.id ? updatedOffer : o)),
    marketQuoteRequests: state.marketQuoteRequests.map((r) =>
      r.id === request.id ? updatedRequest : r,
    ),
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: updatedRequest, replayed: false };
}
