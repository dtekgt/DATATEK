"use client";

import { useActionState, useState } from "react";
import { Button, Input, InlineAlert } from "@datatek/ui";
import { submitMarketOfferAction, type SubmitMarketOfferActionState } from "./actions";

const initialState: SubmitMarketOfferActionState = { status: "idle" };

export function OfferForm({ orgSlug, requestId }: { orgSlug: string; requestId: string }) {
  const [state, action, pending] = useActionState<SubmitMarketOfferActionState, FormData>(
    submitMarketOfferAction,
    initialState,
  );
  const [open, setOpen] = useState(false);

  if (state.status === "success") {
    return <InlineAlert tone="success" title="Oferta enviada" description={state.message} />;
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Enviar oferta
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="requestId" value={requestId} />
      {state.status === "error" ? (
        <InlineAlert tone="danger" title="No pudimos enviar la oferta" description={state.message} />
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Input
          name="amount"
          label="Monto"
          type="number"
          step="0.01"
          min="0.01"
          required
          className="w-32"
        />
        <Input name="currency" label="Moneda" defaultValue="GTQ" maxLength={3} required className="w-20" />
        <Input name="message" label="Mensaje (opcional)" maxLength={500} className="min-w-48 flex-1" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Enviar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
