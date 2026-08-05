"use client";

import { useActionState, useState } from "react";
import { Button, Card, InlineAlert, Input, Panel, Select, SectionTitle } from "@datatek/ui";
import { registerProductFromShop, type RegisterProductActionState } from "./actions";

const PRICE_MODE_OPTIONS = [
  { value: "fixed", label: "Precio fijo" },
  { value: "from", label: "Desde" },
  { value: "range", label: "Rango" },
  { value: "inspection_required", label: "Requiere inspección" },
  { value: "diagnosis_required", label: "Requiere diagnóstico" },
];

const initialState: RegisterProductActionState = { status: "idle" };

export function NewProductForm({ orgSlug }: { orgSlug: string }) {
  const [state, action, pending] = useActionState<RegisterProductActionState, FormData>(
    registerProductFromShop,
    initialState,
  );
  const [priceMode, setPriceMode] = useState("fixed");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Agregar producto
      </Button>
    );
  }

  return (
    <form action={action} className="max-w-2xl">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Card className="flex flex-col gap-5" accent="brand">
        <SectionTitle>Nuevo producto</SectionTitle>

        {state.status === "error" ? (
          <InlineAlert
            tone="danger"
            title="No pudimos guardar el producto"
            description={state.message}
          />
        ) : null}
        {state.status === "success" ? (
          <InlineAlert tone="success" title="Producto agregado" description={state.message} />
        ) : null}

        <Panel className="grid gap-4 md:grid-cols-2">
          <Input name="name" label="Nombre" maxLength={120} required />
          <Input
            name="category"
            label="Categoría"
            maxLength={60}
            required
            placeholder="frenos, motor..."
          />
          <Input name="brand" label="Marca" maxLength={60} />
          <Input name="sku" label="SKU" maxLength={60} helpText="Opcional." />
          <Input
            name="unit"
            label="Unidad"
            maxLength={20}
            required
            placeholder="litro, juego, unidad..."
          />
          <Input
            name="quantityOnHand"
            label="Existencia inicial"
            type="number"
            min={0}
            step="0.001"
            defaultValue="0"
          />
        </Panel>

        <Panel className="grid gap-4 md:grid-cols-2">
          <Select
            name="priceMode"
            label="Modalidad de precio"
            value={priceMode}
            onChange={(event) => setPriceMode(event.target.value)}
            options={PRICE_MODE_OPTIONS}
          />
          <div className="hidden md:block" />
          {priceMode === "fixed" ? (
            <Input
              name="fixedAmount"
              label="Precio (GTQ)"
              type="number"
              min={0}
              step="0.01"
              required
            />
          ) : (
            <input type="hidden" name="fixedAmount" value="" />
          )}
          {priceMode === "from" ? (
            <Input
              name="fromAmount"
              label="Precio desde (GTQ)"
              type="number"
              min={0}
              step="0.01"
              required
            />
          ) : (
            <input type="hidden" name="fromAmount" value="" />
          )}
          {priceMode === "range" ? (
            <>
              <Input
                name="rangeMinAmount"
                label="Precio mínimo (GTQ)"
                type="number"
                min={0}
                step="0.01"
                required
              />
              <Input
                name="rangeMaxAmount"
                label="Precio máximo (GTQ)"
                type="number"
                min={0}
                step="0.01"
                required
              />
            </>
          ) : (
            <>
              <input type="hidden" name="rangeMinAmount" value="" />
              <input type="hidden" name="rangeMaxAmount" value="" />
            </>
          )}
        </Panel>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Guardar producto
          </Button>
        </div>
      </Card>
    </form>
  );
}
