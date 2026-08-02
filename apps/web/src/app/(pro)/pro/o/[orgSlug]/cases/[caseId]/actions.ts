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
import { getWebSession } from "../../../../../../../lib/fixture-session";
import { buildStaffCommandContext } from "../../../../../../../lib/command-context";
import { getCommandsEngine } from "../../../../../../../lib/commands-engine";

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
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  const quoteVersionId = String(formData.get("quoteVersionId") ?? "");
  const audienceCustomerId = String(formData.get("audienceCustomerId") ?? "");

  if (!orgSlug || !caseId || !quoteVersionId || !audienceCustomerId) {
    return { status: "error", message: "Faltan datos del caso o de la versión congelada." };
  }

  const session = await getWebSession(orgSlug, "authorization.request");
  if (session.accessState.kind !== "allowed" || !session.actorId) {
    return {
      status: "error",
      message: "No tienes permiso para preparar solicitudes de autorización en esta organización.",
    };
  }

  const ctx = buildStaffCommandContext({ actorId: session.actorId, orgSlug });
  if (!ctx) return { status: "error", message: "Organización no encontrada." };

  const engine = getCommandsEngine();

  const prepared = engine.prepareAuthorizationRequest(ctx, {
    quoteVersionId,
    audienceCustomerId,
  });
  if (!prepared.ok) {
    return { status: "error", message: prepared.error.message };
  }

  const sendCtx = buildStaffCommandContext({ actorId: session.actorId, orgSlug });
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
