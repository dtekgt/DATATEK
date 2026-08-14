"use client";

import { useActionState, useState } from "react";
import {
  Badge,
  Button,
  Card,
  InlineAlert,
  Input,
  MoneyText,
  Panel,
  Select,
  SectionTitle,
  StatusPill,
} from "@datatek/ui";
import {
  lookupMarketRequestAction,
  decideMarketOfferAction,
  type LookupMarketRequestState,
  type DecideMarketOfferState,
} from "./actions";

const lookupInitial: LookupMarketRequestState = { status: "idle" };
const decideInitial: DecideMarketOfferState = { status: "idle" };

const STATUS_LABEL: Record<string, string> = {
  submitted: "Esperando respuesta del taller",
  offered: "Oferta recibida",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

function OfferResponse({
  workshopSlug,
  requestId,
  customerPhone,
  onDecided,
}: {
  workshopSlug: string;
  requestId: string;
  customerPhone: string;
  onDecided: (decision: "accepted" | "rejected") => void;
}) {
  const [state, action, pending] = useActionState<DecideMarketOfferState, FormData>(
    async (previous, formData) => {
      const next = await decideMarketOfferAction(previous, formData);
      if (next.status === "done") onDecided(next.decision);
      return next;
    },
    decideInitial,
  );
  const [rejecting, setRejecting] = useState(false);

  if (state.status === "done") {
    return (
      <InlineAlert
        tone={state.decision === "accepted" ? "success" : "neutral"}
        title={state.decision === "accepted" ? "Oferta aceptada" : "Oferta rechazada"}
        description="El taller verá tu respuesta."
      />
    );
  }

  if (rejecting) {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="workshopSlug" value={workshopSlug} />
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="customerPhone" value={customerPhone} />
        <input type="hidden" name="decision" value="rejected" />
        <Input name="rejectionReason" label="Motivo del rechazo" required maxLength={300} />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" size="sm" loading={pending}>
            Confirmar rechazo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
            Volver
          </Button>
        </div>
        {state.status === "error" ? (
          <span className="text-xs text-[var(--color-danger-400)]">{state.message}</span>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="workshopSlug" value={workshopSlug} />
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="customerPhone" value={customerPhone} />
          <input type="hidden" name="decision" value="accepted" />
          <Button type="submit" size="sm" loading={pending}>
            Aceptar oferta
          </Button>
        </form>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(true)}>
          Rechazar
        </Button>
      </div>
      {state.status === "error" ? (
        <span className="text-xs text-[var(--color-danger-400)]">{state.message}</span>
      ) : null}
    </div>
  );
}

export function MarketRequestsLookupForm({
  workshops,
}: {
  workshops: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<LookupMarketRequestState, FormData>(
    lookupMarketRequestAction,
    lookupInitial,
  );
  const [decidedStatus, setDecidedStatus] = useState<"accepted" | "rejected" | null>(null);
  const effectiveStatus =
    state.status === "found" ? (decidedStatus ?? state.result.request.status) : null;

  return (
    <div className="flex flex-col gap-6">
      <form
        action={(formData: FormData) => {
          setDecidedStatus(null);
          return action(formData);
        }}
      >
        <Card className="flex flex-col gap-4" accent="brand">
          <SectionTitle>Consulta tu solicitud</SectionTitle>
          {state.status === "error" ? (
            <InlineAlert tone="danger" title="No encontramos tu solicitud" description={state.message} />
          ) : null}
          <Panel className="grid gap-4 md:grid-cols-3">
            <Select
              name="workshopSlug"
              label="Taller"
              required
              defaultValue={state.status === "found" ? state.result.workshopSlug : ""}
              options={[{ value: "", label: "Selecciona un taller" }, ...workshops]}
            />
            <Input name="folioCode" label="Folio" required placeholder="MKT-2026-00001" />
            <Input name="customerPhone" label="Teléfono" required maxLength={40} />
          </Panel>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              Buscar
            </Button>
          </div>
        </Card>
      </form>

      {state.status === "found" ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-sm text-[var(--color-muted-400)]">{state.result.request.folioCode}</p>
            <StatusPill
              label={STATUS_LABEL[effectiveStatus ?? ""] ?? effectiveStatus ?? ""}
              tone={
                effectiveStatus === "accepted"
                  ? "success"
                  : effectiveStatus === "rejected"
                    ? "danger"
                    : effectiveStatus === "offered"
                      ? "info"
                      : "warning"
              }
            />
          </div>
          <p className="text-sm">{state.result.request.vehicleLabel}</p>
          <p className="text-sm text-[var(--color-muted-400)]">{state.result.request.description}</p>

          {state.result.offer ? (
            <Panel className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-muted-400)]">Oferta del taller</span>
                <MoneyText amount={state.result.offer.amountMinor / 100} currency={state.result.offer.currency} />
              </div>
              {state.result.offer.message ? (
                <p className="text-sm text-[var(--color-paper-50)]">{state.result.offer.message}</p>
              ) : null}
              {effectiveStatus === "offered" ? (
                <OfferResponse
                  workshopSlug={state.result.workshopSlug}
                  requestId={state.result.request.id}
                  customerPhone={state.result.request.customerPhone}
                  onDecided={setDecidedStatus}
                />
              ) : (
                <Badge tone={effectiveStatus === "accepted" ? "success" : "neutral"}>
                  {effectiveStatus === "accepted" ? "Aceptaste esta oferta" : "Rechazaste esta oferta"}
                </Badge>
              )}
            </Panel>
          ) : (
            <p className="text-sm text-[var(--color-muted-400)]">
              El taller todavía no ha enviado una oferta.
            </p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
