"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  InlineAlert,
  Input,
  LinkButton,
  Panel,
  Select,
  SectionTitle,
  Textarea,
} from "@datatek/ui";
import { openCaseFromPro, type OpenCaseActionState } from "./actions";

export interface ExistingCustomerOption {
  id: string;
  label: string;
}

export interface ExistingVehicleOption {
  id: string;
  customerId: string;
  label: string;
}

const initialState: OpenCaseActionState = { status: "idle" };

export function NewCaseForm({
  orgSlug,
  customers,
  vehicles,
}: {
  orgSlug: string;
  customers: ExistingCustomerOption[];
  vehicles: ExistingVehicleOption[];
}) {
  const [state, action, pending] = useActionState(openCaseFromPro, initialState);
  const [customerSelection, setCustomerSelection] = useState("new");
  const [vehicleSelection, setVehicleSelection] = useState("new");
  const router = useRouter();

  const customerVehicles = useMemo(
    () =>
      customerSelection === "new"
        ? []
        : vehicles.filter((vehicle) => vehicle.customerId === customerSelection),
    [customerSelection, vehicles],
  );

  useEffect(() => {
    if (state.status === "success" && state.casePath) {
      router.push(state.casePath);
    }
  }, [router, state.casePath, state.status]);

  return (
    <form action={action} className="max-w-4xl">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Card className="flex flex-col gap-6" accent="brand">
        <div>
          <SectionTitle>Captura lo que ya sabes</SectionTitle>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted-400)]">
            No necesitas llenar una ficha eterna. Con cliente, vehículo y motivo de consulta queda
            abierto el expediente; el resto se completa conforme avanza el trabajo.
          </p>
        </div>

        {state.status === "error" ? (
          <InlineAlert tone="danger" title="No pudimos abrir el caso" description={state.message} />
        ) : null}

        <Panel className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--color-brand-400)] uppercase">
              1 · Cliente
            </p>
          </div>
          <Select
            name="customerSelection"
            label="¿Quién trae el vehículo?"
            value={customerSelection}
            onChange={(event) => {
              setCustomerSelection(event.target.value);
              setVehicleSelection("new");
            }}
            options={[
              { value: "new", label: "Cliente nuevo" },
              ...customers.map((customer) => ({ value: customer.id, label: customer.label })),
            ]}
          />
          {customerSelection === "new" ? (
            <Input
              name="customerName"
              label="Nombre del cliente"
              autoComplete="name"
              maxLength={120}
              required
            />
          ) : (
            <div className="flex items-end pb-2 text-sm text-[var(--color-muted-400)]">
              Usaremos su relación y vehículos ya registrados en este taller.
            </div>
          )}
          {customerSelection === "new" ? (
            <>
              <Select
                name="contactChannel"
                label="Medio de contacto"
                defaultValue="whatsapp"
                options={[
                  { value: "whatsapp", label: "WhatsApp" },
                  { value: "phone", label: "Teléfono" },
                  { value: "email", label: "Correo" },
                ]}
              />
              <Input
                name="contactValue"
                label="Contacto"
                helpText="Opcional por ahora; no bloquea la apertura del caso."
                maxLength={160}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="customerName" value="" />
              <input type="hidden" name="contactChannel" value="whatsapp" />
              <input type="hidden" name="contactValue" value="" />
            </>
          )}
        </Panel>

        <Panel className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--color-brand-400)] uppercase">
              2 · Vehículo
            </p>
          </div>
          <Select
            name="vehicleSelection"
            label="Vehículo"
            value={vehicleSelection}
            onChange={(event) => setVehicleSelection(event.target.value)}
            options={[
              { value: "new", label: "Registrar otro vehículo" },
              ...customerVehicles.map((vehicle) => ({
                value: vehicle.id,
                label: vehicle.label,
              })),
            ]}
            helpText={
              customerSelection === "new"
                ? "Un cliente nuevo necesita registrar su vehículo."
                : customerVehicles.length === 0
                  ? "Este cliente todavía no tiene vehículos relacionados."
                  : "Puedes usar uno existente o registrar otro."
            }
          />
          {vehicleSelection === "new" ? (
            <Input name="plate" label="Placa" maxLength={16} autoCapitalize="characters" />
          ) : (
            <div className="flex items-end pb-2 text-sm text-[var(--color-muted-400)]">
              El caso quedará ligado al mismo pasaporte técnico del vehículo.
            </div>
          )}
          {vehicleSelection === "new" ? (
            <>
              <Input
                name="vin"
                label="VIN"
                helpText="La placa o el VIN es obligatorio; no necesitas ambos."
                minLength={5}
                maxLength={17}
                autoCapitalize="characters"
              />
              <Input name="make" label="Marca" maxLength={60} autoComplete="off" />
              <Input name="model" label="Modelo" maxLength={60} autoComplete="off" />
              <Input
                name="year"
                label="Año"
                inputMode="numeric"
                min={1900}
                max={new Date().getFullYear() + 1}
                type="number"
              />
            </>
          ) : (
            <>
              <input type="hidden" name="plate" value="" />
              <input type="hidden" name="vin" value="" />
              <input type="hidden" name="make" value="" />
              <input type="hidden" name="model" value="" />
              <input type="hidden" name="year" value="" />
            </>
          )}
        </Panel>

        <Panel className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--color-brand-400)] uppercase">
              3 · Motivo
            </p>
          </div>
          <Select
            name="intakeChannel"
            label="¿Cómo llegó la solicitud?"
            defaultValue="whatsapp_manual"
            options={[
              { value: "whatsapp_manual", label: "WhatsApp" },
              { value: "phone_manual", label: "Llamada" },
              { value: "walk_in", label: "Llegó al taller" },
              { value: "email_manual", label: "Correo" },
            ]}
          />
          <div className="hidden md:block" />
          <div className="md:col-span-2">
            <Textarea
              name="reportedText"
              label="¿Qué reporta el cliente?"
              helpText="Guárdalo con sus palabras; después el taller podrá convertirlo en hallazgos técnicos."
              placeholder="Ejemplo: al frenar en bajada siente vibración y escucha un ruido adelante."
              minLength={8}
              maxLength={800}
              required
            />
          </div>
        </Panel>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <LinkButton href={`/pro/o/${orgSlug}/cases`} variant="ghost">
            Cancelar
          </LinkButton>
          <Button type="submit" loading={pending}>
            Abrir caso
          </Button>
        </div>
      </Card>
    </form>
  );
}
