"use server";

// Server Action — DATATEK_R0_D Fase 4b, punto 4: the real `/a/[token]`
// decision flow. Invokes `RecordAuthorization` (method: "secure_link")
// against the shared command engine — the ONLY authorization command this
// file exposes to the client, never the engine itself (sección "nunca
// expongas el motor de comandos completo al cliente"). Re-validates the
// token itself on every submit (never trusts an earlier
// `VerifyAuthorizationAccess` call from the same visit — see
// `docs/domain/authorization-security.md`, "consumo atómico").
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildGuestCommandContext } from "../../../lib/guest-authorization";
import { getCommandsEngine } from "../../../lib/commands-engine";

// DATATEK_R0_E sección 9: "Zod en límites" y "payload limits".
//
// Este Server Action es el ÚNICO punto en el que un invitado no
// autenticado escribe en el sistema, así que es literalmente un endpoint
// público y se valida como tal. Antes de esta fase la validación era una
// serie de `if` sobre `String(formData.get(...))`: comprobaba presencia y
// el valor del enum, pero NINGÚN límite de tamaño. Un POST directo al
// Server Action (sin pasar por el formulario) podía mandar un
// `rejectionReason` de megabytes o un `acceptedQuoteItemIds` con cientos de
// miles de entradas, y el motor los habría procesado.
//
// Los topes son deliberadamente holgados para uso legítimo y estrechos
// frente a abuso. El token NO se valida por formato aquí a propósito: su
// única autoridad es `RecordAuthorization`, que lo re-resuelve, cuenta
// intentos y devuelve un error neutral. Rechazarlo antes por "forma
// inválida" produciría un error DISTINTO al de un token válido pero
// equivocado, y eso es exactamente la distinción pública que la sección
// 10.2 prohíbe.
const MAX_TOKEN_LENGTH = 512;
const MAX_ID_LENGTH = 128;
const MAX_REJECTION_REASON_LENGTH = 1_000;
const MAX_ACCEPTED_ITEMS = 200;

const decisionFormSchema = z
  .object({
    token: z.string().min(1).max(MAX_TOKEN_LENGTH),
    quoteVersionId: z.string().min(1).max(MAX_ID_LENGTH),
    quoteVersionHash: z.string().min(1).max(MAX_ID_LENGTH),
    decision: z.enum(["accept_all", "partial", "reject"]),
    acceptedQuoteItemIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)).max(MAX_ACCEPTED_ITEMS),
    rejectionReason: z.string().max(MAX_REJECTION_REASON_LENGTH).nullable(),
  })
  .refine((v) => v.decision !== "partial" || v.acceptedQuoteItemIds.length > 0, {
    message: "partial_requires_items",
  });

// `"use server"` files may only export async functions — a plain constant
// (even a `{status:"idle"}` initial-state object) is not allowed, so the
// initial value for `useActionState` is declared directly in
// `decision-form.tsx` instead. Only the TYPE below is exported from here —
// type-only exports are erased at compile time and never become a runtime
// binding, so they do not trip that restriction.
export interface AuthorizationDecisionActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function submitAuthorizationDecision(
  _prev: AuthorizationDecisionActionState,
  formData: FormData,
): Promise<AuthorizationDecisionActionState> {
  const rawRejectionReason = formData.get("rejectionReason");
  const parsed = decisionFormSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    quoteVersionId: String(formData.get("quoteVersionId") ?? ""),
    quoteVersionHash: String(formData.get("quoteVersionHash") ?? ""),
    decision: String(formData.get("decision") ?? ""),
    acceptedQuoteItemIds: formData.getAll("acceptedQuoteItemIds").map(String),
    rejectionReason: typeof rawRejectionReason === "string" ? rawRejectionReason : null,
  });

  if (!parsed.success) {
    // Mensaje genérico y estable. NUNCA se devuelve el detalle de Zod: sus
    // `issues` incluyen el `path` y a veces el valor recibido, que aquí
    // sería el token del cliente (sección 9: "errores sin stack/PII").
    const isPartialWithoutItems = parsed.error.issues.some(
      (i) => i.message === "partial_requires_items",
    );
    return {
      status: "error",
      message: isPartialWithoutItems
        ? "Selecciona al menos una línea para una decisión parcial."
        : "Falta información de la solicitud o el formato no es válido.",
    };
  }

  const { token, quoteVersionId, quoteVersionHash, decision, acceptedQuoteItemIds } = parsed.data;

  const ctx = buildGuestCommandContext(token);
  const result = getCommandsEngine().recordAuthorization(ctx, {
    method: "secure_link",
    token,
    quoteVersionId,
    quoteVersionHash,
    decision,
    acceptedQuoteItemIds: decision === "partial" ? acceptedQuoteItemIds : undefined,
    rejectionReason:
      decision === "reject" && parsed.data.rejectionReason?.trim()
        ? parsed.data.rejectionReason.trim()
        : null,
  });

  if (!result.ok) {
    return { status: "error", message: result.error.message };
  }

  // Never puts the token in a query string or logs it — only revalidates
  // the SAME opaque path this Server Action was already invoked from.
  revalidatePath(`/a/${token}`);
  return { status: "success" };
}
