"use client";

import { useActionState } from "react";
import { Button, Card, InlineAlert, LinkButton } from "@datatek/ui";
import {
  prepareAndSendAuthorizationRequest,
  type PrepareAuthorizationRequestActionState,
} from "./actions";

// Declared here, not in `actions.ts` — a `"use server"` file may only
// export async functions, never a plain constant value.
const INITIAL_STATE: PrepareAuthorizationRequestActionState = { status: "idle" };

/** Client wrapper around the `prepareAndSendAuthorizationRequest` Server
 * Action — never imports or touches the command engine itself, only calls
 * the one action `actions.ts` exposes (sección "no expongas el motor de
 * comandos completo al cliente"). Shows the resulting one-time link inline
 * instead of redirecting, so the plaintext token never appears in a URL a
 * browser/server would log (sección "nunca imprime el token en la URL"). */
export function PrepareAuthorizationRequestForm({
  orgSlug,
  caseId,
  quoteVersionId,
  audienceCustomerId,
  canPrepareRequest,
  liveRequestStatus,
}: {
  orgSlug: string;
  caseId: string;
  quoteVersionId: string;
  audienceCustomerId: string;
  /** `true` only when the server-rendered parent found a frozen version
   * with no live request yet. `false` after a live request already exists
   * (including right after THIS component's own successful submit) — the
   * component still renders in that case, it just stops offering the
   * button. */
  canPrepareRequest: boolean;
  liveRequestStatus: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    PrepareAuthorizationRequestActionState,
    FormData
  >(prepareAndSendAuthorizationRequest, INITIAL_STATE);

  // Local success always wins, even after the parent's next server render
  // (triggered by this same submit's `revalidatePath`) recomputes
  // `canPrepareRequest` as `false` — this is the ONE place the plaintext
  // token/link is ever shown, so it must survive that refresh instead of
  // disappearing the instant the request it describes becomes "already
  // live".
  if (state.status === "success" && state.link) {
    return (
      <Card>
        <p className="text-sm font-medium">Solicitud preparada y enviada (simulado)</p>
        <p className="mt-1 text-xs text-[var(--color-muted-400)]">
          Ningún mensaje real fue despachado — copia este enlace y compártelo manualmente con el
          cliente, o ábrelo para probar la decisión.
        </p>
        <code className="mt-3 block break-all rounded-[var(--radius-control)] border border-white/10 bg-[var(--color-surface-800)] p-2 text-xs">
          {state.link}
        </code>
        <LinkButton href={state.link} size="sm" className="mt-3">
          Abrir enlace de decisión
        </LinkButton>
      </Card>
    );
  }

  if (!canPrepareRequest) {
    return liveRequestStatus ? (
      <p className="text-xs text-[var(--color-muted-400)]">
        Ya existe una solicitud de autorización vigente (estado: {liveRequestStatus}).
      </p>
    ) : null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="quoteVersionId" value={quoteVersionId} />
      <input type="hidden" name="audienceCustomerId" value={audienceCustomerId} />
      {state.status === "error" ? (
        <InlineAlert
          tone="danger"
          title="No se pudo preparar la solicitud"
          description={state.message}
        />
      ) : null}
      <Button type="submit" loading={pending}>
        Preparar y enviar solicitud (simulado)
      </Button>
    </form>
  );
}
