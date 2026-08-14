"use client";

import { useActionState } from "react";
import { Button, Card, InlineAlert, Input, Panel, Select, SectionTitle, Textarea } from "@datatek/ui";
import { createMarketQuoteRequestAction, type MarketRequestActionState } from "./actions";

const initialState: MarketRequestActionState = { status: "idle" };

export function MarketRequestForm({
  workshops,
}: {
  workshops: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<MarketRequestActionState, FormData>(
    createMarketQuoteRequestAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <Card accent="brand" className="flex flex-col gap-3">
        <SectionTitle>Solicitud enviada</SectionTitle>
        <InlineAlert tone="success" title="Listo" description={state.message} />
        <p className="text-sm text-[var(--color-muted-400)]">
          Tu folio: <span className="font-mono text-[var(--color-paper-50)]">{state.folioCode}</span>
        </p>
        <p className="text-xs text-[var(--color-muted-400)]">
          Guárdalo junto con tu teléfono — los necesitarás en{" "}
          <a href="/market/requests" className="underline">
            /market/requests
          </a>{" "}
          para ver la respuesta del taller.
        </p>
      </Card>
    );
  }

  return (
    <form action={action}>
      <Card className="flex flex-col gap-5" accent="brand">
        <SectionTitle>Pide una cotización</SectionTitle>
        <p className="-mt-3 text-sm text-[var(--color-muted-400)]">
          Sin cuenta, sin guardar tu vehículo. Solo lo que necesitamos para responderte.
        </p>

        {state.status === "error" ? (
          <InlineAlert tone="danger" title="No pudimos enviar tu solicitud" description={state.message} />
        ) : null}

        <Panel className="grid gap-4 md:grid-cols-2">
          <Select
            name="workshopSlug"
            label="Taller"
            required
            defaultValue=""
            options={[{ value: "", label: "Selecciona un taller" }, ...workshops]}
          />
          <Input name="customerName" label="Tu nombre" required maxLength={200} />
          <Input name="customerPhone" label="Teléfono" required maxLength={40} placeholder="WhatsApp o llamada" />
          <Input name="customerEmail" label="Email (opcional)" type="email" maxLength={200} />
          <Input
            name="vehicleLabel"
            label="Vehículo"
            required
            maxLength={200}
            placeholder="Marca, línea, año"
            className="md:col-span-2"
          />
          <Textarea
            name="description"
            label="¿Qué necesitas?"
            required
            maxLength={2000}
            placeholder="Describe el servicio o problema"
            className="md:col-span-2"
          />
        </Panel>

        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Enviar solicitud
          </Button>
        </div>
      </Card>
    </form>
  );
}
