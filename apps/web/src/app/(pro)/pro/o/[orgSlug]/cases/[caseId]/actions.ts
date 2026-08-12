"use server";

// Server Action — DATATEK_R0_D Fase 4b, punto 5: "Prepara la solicitud
// desde Pro". Invokes the real `PrepareAuthorizationRequest` +
// `MarkAuthorizationRequestSent` commands against the shared command
// engine, exactly like `apps/web/src/app/api/dev/commands/route.ts` does
// for curl — the difference is identity: here `actorId`/`organizationId`
// come from the real fixture session cookie (`getWebSession`), never from
// client-supplied form fields, and the command engine is never exposed to
// the client — only this one narrow action is.
//
// "El envío es simulado/local, nunca real" (R0-D sección 12: "no envía un
// mensaje real") — `channel: "simulado_local"` documents that on the
// `authorization_events`/`authorization_requests` row itself, and the
// plaintext token is returned to the CALLER of this action only (never
// persisted, never put in a URL/log — see `PrepareAuthorizationRequestOutput
// .plainToken`'s own comment) so a human can copy it into `/a/[token]`.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWebSession } from "../../../../../../../lib/fixture-session";
import { buildStaffCommandContext } from "../../../../../../../lib/command-context";
import { getCommandsEngine } from "../../../../../../../lib/commands-engine";

// DATATEK_R0_E sección 9: "Zod en límites", "payload limits", "Server
// Actions revalidan como endpoints públicos". Antes de esta fase la
// validación era `if (!orgSlug || !caseId || ...)` — solo presencia, sin
// límite de tamaño ni de forma.
//
// Lo que NO cambia (y ya era correcto): la identidad y el permiso vienen
// de `getWebSession(orgSlug, "authorization.request")`, nunca del
// formulario, y `prepareAuthorizationRequest` vuelve a resolver
// `quoteVersionId`/`audienceCustomerId` dentro de la organización del
// contexto. Es decir, un `orgSlug` que el emisor no controla no le sirve
// de nada: la sesión decide. La validación de abajo cierra el vector
// restante, que es de tamaño/forma, no de autorización.
const MAX_ID_LENGTH = 128;
const MAX_SLUG_LENGTH = 128;

const prepareRequestSchema = z.object({
  // Un slug es `[a-z0-9-]` por construcción en las fixtures; restringirlo
  // impide además que un valor arbitrario llegue a `revalidatePath()`.
  orgSlug: z
    .string()
    .min(1)
    .max(MAX_SLUG_LENGTH)
    .regex(/^[a-z0-9-]+$/),
  caseId: z.string().min(1).max(MAX_ID_LENGTH),
  quoteVersionId: z.string().min(1).max(MAX_ID_LENGTH),
  audienceCustomerId: z.string().min(1).max(MAX_ID_LENGTH),
});

const reissueRequestSchema = z.object({
  orgSlug: z
    .string()
    .min(1)
    .max(MAX_SLUG_LENGTH)
    .regex(/^[a-z0-9-]+$/),
  caseId: z.string().min(1).max(MAX_ID_LENGTH),
  authorizationRequestId: z.string().min(1).max(MAX_ID_LENGTH),
  reason: z.string().trim().min(5).max(240),
});

// `"use server"` files may only export async functions — a plain constant
// (even a `{status:"idle"}` initial-state object) is not allowed, so the
// initial value for `useActionState` is declared directly in
// `prepare-authorization-form.tsx` instead. Only the TYPE below is exported
// from here — type-only exports are erased at compile time and never
// become a runtime binding, so they do not trip that restriction.
export interface PrepareAuthorizationRequestActionState {
  status: "idle" | "success" | "error";
  message?: string;
  plainToken?: string;
  link?: string;
}

export async function prepareAndSendAuthorizationRequest(
  _prev: PrepareAuthorizationRequestActionState,
  formData: FormData,
): Promise<PrepareAuthorizationRequestActionState> {
  const parsed = prepareRequestSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    caseId: String(formData.get("caseId") ?? ""),
    quoteVersionId: String(formData.get("quoteVersionId") ?? ""),
    audienceCustomerId: String(formData.get("audienceCustomerId") ?? ""),
  });

  if (!parsed.success) {
    // Sin detalle de Zod en la respuesta — ver la nota equivalente en
    // `apps/web/src/app/a/[token]/actions.ts`.
    return { status: "error", message: "Faltan datos del caso o de la versión congelada." };
  }

  const { orgSlug, caseId, quoteVersionId, audienceCustomerId } = parsed.data;

  const session = await getWebSession(orgSlug, "authorization.request");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return {
      status: "error",
      message: "No tienes permiso para preparar solicitudes de autorización en esta organización.",
    };
  }

  const ctx = await buildStaffCommandContext({ actorId: session.actorId, orgSlug });
  if (!ctx) return { status: "error", message: "Organización no encontrada." };

  const engine = getCommandsEngine();

  const prepared = engine.prepareAuthorizationRequest(ctx, {
    quoteVersionId,
    audienceCustomerId,
  });
  if (!prepared.ok) {
    return { status: "error", message: prepared.error.message };
  }

  const sendCtx = await buildStaffCommandContext({ actorId: session.actorId, orgSlug });
  if (!sendCtx) return { status: "error", message: "Organización no encontrada." };
  const sent = engine.markAuthorizationRequestSent(sendCtx, {
    authorizationRequestId: prepared.data.request.id,
    channel: "simulado_local",
    result: "sent",
  });
  if (!sent.ok) {
    return {
      status: "error",
      message: `La solicitud se preparó, pero registrar el envío simulado falló: ${sent.error.message}`,
    };
  }

  revalidatePath(`/pro/o/${orgSlug}/cases/${caseId}`);

  return {
    status: "success",
    plainToken: prepared.data.plainToken,
    link: `/a/${prepared.data.plainToken}`,
  };
}

/** Revokes the current live request and creates a fresh one-time link. This
 * is the staff-facing seam that was missing from R0-D: the domain command
 * existed, but a workshop advisor had no clickable way to use it. */
export async function reissueAndSendAuthorizationRequest(
  _prev: PrepareAuthorizationRequestActionState,
  formData: FormData,
): Promise<PrepareAuthorizationRequestActionState> {
  const parsed = reissueRequestSchema.safeParse({
    orgSlug: String(formData.get("orgSlug") ?? ""),
    caseId: String(formData.get("caseId") ?? ""),
    authorizationRequestId: String(formData.get("authorizationRequestId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Escribe un motivo breve para generar un enlace nuevo.",
    };
  }

  const { orgSlug, caseId, authorizationRequestId, reason } = parsed.data;
  const session = await getWebSession(orgSlug, "authorization.request");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return {
      status: "error",
      message: "No tienes permiso para reenviar solicitudes en esta organización.",
    };
  }

  const ctx = await buildStaffCommandContext({ actorId: session.actorId, orgSlug });
  if (!ctx) return { status: "error", message: "Organización no encontrada." };

  const engine = getCommandsEngine();
  const reissued = engine.revokeAndReprepareAuthorizationRequest(ctx, {
    authorizationRequestId,
    reason,
  });
  if (!reissued.ok) {
    return { status: "error", message: reissued.error.message };
  }

  const sendCtx = await buildStaffCommandContext({ actorId: session.actorId, orgSlug });
  if (!sendCtx) return { status: "error", message: "Organización no encontrada." };
  const sent = engine.markAuthorizationRequestSent(sendCtx, {
    authorizationRequestId: reissued.data.request.id,
    channel: "simulado_local",
    result: "sent",
    note: "Enlace regenerado desde el espacio de trabajo del caso.",
  });
  if (!sent.ok) {
    return {
      status: "error",
      message: `El enlace se regeneró, pero no pudo registrarse el envío: ${sent.error.message}`,
    };
  }

  revalidatePath(`/pro/o/${orgSlug}/cases/${caseId}`);
  return {
    status: "success",
    plainToken: reissued.data.plainToken,
    link: `/a/${reissued.data.plainToken}`,
  };
}
