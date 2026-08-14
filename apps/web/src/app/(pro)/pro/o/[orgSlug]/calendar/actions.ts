"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { buildStaffCommandContext } from "../../../../../../lib/command-context";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

const ID_MAX = 128;

const scheduleSchema = z
  .object({
    orgSlug: z.string().min(1).max(ID_MAX).regex(/^[a-z0-9-]+$/),
    caseId: z.string().min(1).max(ID_MAX),
    resourceId: z.string().min(1).max(ID_MAX),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    purpose: z.string().trim().max(200),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startsAt).getTime();
    const end = new Date(value.endsAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Fechas inválidas." });
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La hora de fin debe ser posterior a la de inicio." });
    }
  });

export interface ScheduleAppointmentActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function scheduleAppointmentFromCalendar(
  _previous: ScheduleAppointmentActionState,
  formData: FormData,
): Promise<ScheduleAppointmentActionState> {
  const parsed = scheduleSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    caseId: String(formData.get("caseId") ?? ""),
    resourceId: String(formData.get("resourceId") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    purpose: String(formData.get("purpose") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revisa los datos antes de agendar.",
    };
  }

  const data = parsed.data;
  const session = await getWebSession(data.orgSlug, "agenda.manage");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return { status: "error", message: "Tu acceso no permite agendar citas en este taller." };
  }

  const ctx = await buildStaffCommandContext({
    actorId: session.actorId,
    orgSlug: data.orgSlug,
    branchId: session.availableBranches[0]?.id ?? null,
  });
  if (!ctx) return { status: "error", message: "No encontramos el espacio de este taller." };

  const outcome = getCommandsEngine().scheduleAppointment(ctx, {
    caseId: data.caseId,
    startsAt: new Date(data.startsAt).toISOString(),
    endsAt: new Date(data.endsAt).toISOString(),
    purpose: data.purpose || null,
    resourceIds: [data.resourceId],
  });

  if (!outcome.ok) {
    return { status: "error", message: outcome.error.message };
  }

  revalidatePath(`/pro/o/${data.orgSlug}/calendar`);
  return { status: "success", message: "Cita agendada." };
}

const idSchema = z.object({
  orgSlug: z.string().min(1).max(ID_MAX).regex(/^[a-z0-9-]+$/),
  appointmentId: z.string().min(1).max(ID_MAX),
});

export interface AppointmentActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function confirmAppointmentFromCalendar(
  _previous: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const parsed = idSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    appointmentId: String(formData.get("appointmentId") ?? ""),
  });
  if (!parsed.success) return { status: "error", message: "Solicitud inválida." };

  const session = await getWebSession(parsed.data.orgSlug, "agenda.manage");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return { status: "error", message: "Tu acceso no permite confirmar citas en este taller." };
  }
  const ctx = await buildStaffCommandContext({
    actorId: session.actorId,
    orgSlug: parsed.data.orgSlug,
    branchId: session.availableBranches[0]?.id ?? null,
  });
  if (!ctx) return { status: "error", message: "No encontramos el espacio de este taller." };

  const outcome = getCommandsEngine().confirmAppointment(ctx, {
    appointmentId: parsed.data.appointmentId,
  });
  if (!outcome.ok) return { status: "error", message: outcome.error.message };

  revalidatePath(`/pro/o/${parsed.data.orgSlug}/calendar`);
  return { status: "success", message: "Cita confirmada." };
}

const cancelSchema = idSchema.extend({
  reason: z.string().trim().min(1).max(300),
});

export async function cancelAppointmentFromCalendar(
  _previous: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const parsed = cancelSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    appointmentId: String(formData.get("appointmentId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Escribe un motivo de cancelación.",
    };
  }

  const session = await getWebSession(parsed.data.orgSlug, "agenda.manage");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return { status: "error", message: "Tu acceso no permite cancelar citas en este taller." };
  }
  const ctx = await buildStaffCommandContext({
    actorId: session.actorId,
    orgSlug: parsed.data.orgSlug,
    branchId: session.availableBranches[0]?.id ?? null,
  });
  if (!ctx) return { status: "error", message: "No encontramos el espacio de este taller." };

  const outcome = getCommandsEngine().cancelAppointment(ctx, {
    appointmentId: parsed.data.appointmentId,
    reason: parsed.data.reason,
  });
  if (!outcome.ok) return { status: "error", message: outcome.error.message };

  revalidatePath(`/pro/o/${parsed.data.orgSlug}/calendar`);
  return { status: "success", message: "Cita cancelada; recursos liberados." };
}
