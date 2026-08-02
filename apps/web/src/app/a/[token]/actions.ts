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
import { buildGuestCommandContext } from "../../../lib/guest-authorization";
import { getCommandsEngine } from "../../../lib/commands-engine";

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
  const token = String(formData.get("token") ?? "");
  const quoteVersionId = String(formData.get("quoteVersionId") ?? "");
  const quoteVersionHash = String(formData.get("quoteVersionHash") ?? "");
  const decisionRaw = String(formData.get("decision") ?? "");
  const acceptedQuoteItemIds = formData.getAll("acceptedQuoteItemIds").map(String);
  const rejectionReason = formData.get("rejectionReason");

  if (!token || !quoteVersionId || !quoteVersionHash) {
    return { status: "error", message: "Falta información de la solicitud." };
  }
  if (decisionRaw !== "accept_all" && decisionRaw !== "partial" && decisionRaw !== "reject") {
    return { status: "error", message: "Elige una opción de decisión." };
  }
  if (decisionRaw === "partial" && acceptedQuoteItemIds.length === 0) {
    return { status: "error", message: "Selecciona al menos una línea para una decisión parcial." };
  }

  const ctx = buildGuestCommandContext(token);
  const result = getCommandsEngine().recordAuthorization(ctx, {
    method: "secure_link",
    token,
    quoteVersionId,
    quoteVersionHash,
    decision: decisionRaw,
    acceptedQuoteItemIds: decisionRaw === "partial" ? acceptedQuoteItemIds : undefined,
    rejectionReason:
      decisionRaw === "reject" && typeof rejectionReason === "string" && rejectionReason.trim()
        ? rejectionReason.trim()
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
