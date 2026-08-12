"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContactChannel, IntakeChannel } from "@datatek/application/commands";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { buildStaffCommandContext } from "../../../../../../lib/command-context";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";

const ID_MAX = 128;
const TEXT_MAX = 800;
const currentYear = new Date().getFullYear();

const formSchema = z
  .object({
    orgSlug: z
      .string()
      .min(1)
      .max(ID_MAX)
      .regex(/^[a-z0-9-]+$/),
    customerSelection: z.string().min(1).max(ID_MAX),
    customerName: z.string().trim().max(120),
    contactChannel: z.enum(["whatsapp", "phone", "email"]),
    contactValue: z.string().trim().max(160),
    vehicleSelection: z.string().min(1).max(ID_MAX),
    plate: z.string().trim().max(16),
    vin: z.string().trim().max(17),
    make: z.string().trim().max(60),
    model: z.string().trim().max(60),
    year: z.string().trim().max(4),
    intakeChannel: z.enum(["whatsapp_manual", "phone_manual", "walk_in", "email_manual"]),
    reportedText: z.string().trim().min(8).max(TEXT_MAX),
  })
  .superRefine((value, ctx) => {
    if (value.customerSelection === "new" && value.customerName.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Escribe el nombre del cliente.",
      });
    }
    if (value.vehicleSelection === "new" && !value.plate && !value.vin) {
      ctx.addIssue({
        code: "custom",
        path: ["plate"],
        message: "Escribe la placa o el VIN.",
      });
    }
    if (value.year) {
      const year = Number(value.year);
      if (!Number.isInteger(year) || year < 1900 || year > currentYear + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["year"],
          message: "El año del vehículo no es válido.",
        });
      }
    }
  });

export interface OpenCaseActionState {
  status: "idle" | "success" | "error";
  message?: string;
  casePath?: string;
}

export async function openCaseFromPro(
  _previous: OpenCaseActionState,
  formData: FormData,
): Promise<OpenCaseActionState> {
  const parsed = formSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    customerSelection: String(formData.get("customerSelection") ?? "new"),
    customerName: String(formData.get("customerName") ?? ""),
    contactChannel: String(formData.get("contactChannel") ?? "whatsapp"),
    contactValue: String(formData.get("contactValue") ?? ""),
    vehicleSelection: String(formData.get("vehicleSelection") ?? "new"),
    plate: String(formData.get("plate") ?? ""),
    vin: String(formData.get("vin") ?? ""),
    make: String(formData.get("make") ?? ""),
    model: String(formData.get("model") ?? ""),
    year: String(formData.get("year") ?? ""),
    intakeChannel: String(formData.get("intakeChannel") ?? "whatsapp_manual"),
    reportedText: String(formData.get("reportedText") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revisa los datos antes de abrir el caso.",
    };
  }

  const data = parsed.data;
  const session = await getWebSession(data.orgSlug, "intake.manage");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return {
      status: "error",
      message: "Tu acceso no permite abrir casos en este taller.",
    };
  }

  const ctx = await buildStaffCommandContext({
    actorId: session.actorId,
    orgSlug: data.orgSlug,
    branchId: session.availableBranches[0]?.id ?? null,
  });
  if (!ctx) return { status: "error", message: "No encontramos el espacio de este taller." };

  const contact = data.contactValue
    ? { channel: data.contactChannel as ContactChannel, value: data.contactValue }
    : null;
  const customer =
    data.customerSelection === "new"
      ? ({ kind: "new", displayName: data.customerName, contact } as const)
      : ({ kind: "existing", customerId: data.customerSelection } as const);
  const vehicle =
    data.vehicleSelection === "new"
      ? ({
          kind: "new",
          ...(data.plate ? { plate: data.plate } : {}),
          ...(data.vin ? { vin: data.vin } : {}),
          ...(data.make ? { make: data.make } : {}),
          ...(data.model ? { model: data.model } : {}),
          ...(data.year ? { year: Number(data.year) } : {}),
        } as const)
      : ({ kind: "existing", vehicleId: data.vehicleSelection } as const);

  const opened = await getCommandsEngine().openCaseFromRequest(ctx, {
    customer,
    vehicle,
    channel: data.intakeChannel as IntakeChannel,
    reportedText: data.reportedText,
    branchId: session.availableBranches[0]?.id ?? null,
  });

  if (!opened.ok) {
    return {
      status: "error",
      message: `${opened.error.message} No se guardó una captura incompleta.`,
    };
  }

  const base = `/pro/o/${data.orgSlug}`;
  revalidatePath(`${base}/dashboard`);
  revalidatePath(`${base}/cases`);
  revalidatePath(`${base}/customers`);
  revalidatePath(`${base}/vehicles`);

  return {
    status: "success",
    message: `Caso ${opened.data.case.folioCode} abierto correctamente.`,
    casePath: `${base}/cases/${opened.data.case.id}`,
  };
}
