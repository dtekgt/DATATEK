"use client";

import { useActionState, useState } from "react";
import { Button, Card, InlineAlert, Input, Panel, Select, SectionTitle } from "@datatek/ui";
import {
  scheduleAppointmentFromCalendar,
  type ScheduleAppointmentActionState,
} from "./actions";

const initialState: ScheduleAppointmentActionState = { status: "idle" };

export function NewAppointmentForm({
  orgSlug,
  resources,
  cases,
}: {
  orgSlug: string;
  resources: { value: string; label: string }[];
  cases: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ScheduleAppointmentActionState, FormData>(
    scheduleAppointmentFromCalendar,
    initialState,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        Agendar cita
      </Button>
    );
  }

  return (
    <form action={action} className="w-full max-w-2xl">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Card className="flex flex-col gap-5" accent="brand">
        <SectionTitle>Nueva cita</SectionTitle>

        {state.status === "error" ? (
          <InlineAlert tone="danger" title="No pudimos agendar la cita" description={state.message} />
        ) : null}
        {state.status === "success" ? (
          <InlineAlert tone="success" title="Cita agendada" description={state.message} />
        ) : null}

        <Panel className="grid gap-4 md:grid-cols-2">
          <Select
            name="caseId"
            label="Caso"
            required
            defaultValue=""
            options={[{ value: "", label: "Selecciona un caso" }, ...cases]}
          />
          <Select
            name="resourceId"
            label="Recurso"
            required
            defaultValue=""
            options={[{ value: "", label: "Selecciona una bahía o técnico" }, ...resources]}
          />
          <Input name="startsAt" label="Inicio" type="datetime-local" required />
          <Input name="endsAt" label="Fin" type="datetime-local" required />
          <Input
            name="purpose"
            label="Motivo (opcional)"
            maxLength={200}
            placeholder="Diagnóstico, entrega..."
            className="md:col-span-2"
          />
        </Panel>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Agendar
          </Button>
        </div>
      </Card>
    </form>
  );
}
