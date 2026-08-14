"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@datatek/ui";
import {
  confirmAppointmentFromCalendar,
  cancelAppointmentFromCalendar,
  type AppointmentActionState,
} from "./actions";

const initialState: AppointmentActionState = { status: "idle" };

export function AppointmentActions({
  orgSlug,
  appointmentId,
  canConfirm,
}: {
  orgSlug: string;
  appointmentId: string;
  canConfirm: boolean;
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState<
    AppointmentActionState,
    FormData
  >(confirmAppointmentFromCalendar, initialState);
  const [cancelState, cancelAction, cancelPending] = useActionState<
    AppointmentActionState,
    FormData
  >(cancelAppointmentFromCalendar, initialState);
  const [cancelling, setCancelling] = useState(false);

  if (cancelling) {
    return (
      <form action={cancelAction} className="flex items-center gap-2">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <Input
          name="reason"
          label="Motivo"
          required
          maxLength={300}
          className="h-9 min-h-9 w-40"
          placeholder="Motivo de cancelación"
        />
        <Button type="submit" variant="danger" size="sm" loading={cancelPending}>
          Confirmar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(false)}>
          Volver
        </Button>
        {cancelState.status === "error" ? (
          <span className="text-xs text-[var(--color-danger-400)]">{cancelState.message}</span>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {canConfirm ? (
        <form action={confirmAction}>
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <Button type="submit" variant="secondary" size="sm" loading={confirmPending}>
            Confirmar
          </Button>
        </form>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(true)}>
        Cancelar
      </Button>
      {confirmState.status === "error" ? (
        <span className="text-xs text-[var(--color-danger-400)]">{confirmState.message}</span>
      ) : null}
    </div>
  );
}
