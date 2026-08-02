"use client";

import { useActionState } from "react";
import { Button, Card, Checkbox, InlineAlert, Textarea } from "@datatek/ui";
import { submitAuthorizationDecision, type AuthorizationDecisionActionState } from "./actions";

export interface DecisionFormItem {
  id: string;
  label: string;
}

// Declared here, not in `actions.ts` — a `"use server"` file may only
// export async functions, never a plain constant value.
const INITIAL_STATE: AuthorizationDecisionActionState = { status: "idle" };

/** Client wrapper around the `submitAuthorizationDecision` Server Action —
 * the only authorization command this page exposes to the browser. Three
 * explicit submit buttons (never a single ambiguous "confirmar") name the
 * decision directly via each button's own `name="decision"` — the standard
 * HTML "which submitter fired" mechanism, so no hidden state is needed to
 * know which one the customer chose. */
export function DecisionForm({
  token,
  quoteVersionId,
  quoteVersionHash,
  items,
}: {
  token: string;
  quoteVersionId: string;
  quoteVersionHash: string;
  items: DecisionFormItem[];
}) {
  const [state, formAction, pending] = useActionState<AuthorizationDecisionActionState, FormData>(
    submitAuthorizationDecision,
    INITIAL_STATE,
  );

  if (state.status === "success") {
    return (
      <Card>
        <p className="text-sm font-medium">Decisión registrada</p>
        <p className="mt-1 text-sm text-[var(--color-muted-400)]">
          Gracias — tu decisión quedó registrada. Puedes cerrar esta página; el taller ya la puede
          ver.
        </p>
      </Card>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="quoteVersionId" value={quoteVersionId} />
      <input type="hidden" name="quoteVersionHash" value={quoteVersionHash} />

      {state.status === "error" ? (
        <InlineAlert
          tone="danger"
          title="No se pudo registrar tu decisión"
          description={state.message}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Elige qué autorizas</p>
        {items.map((item) => (
          <Checkbox
            key={item.id}
            name="acceptedQuoteItemIds"
            value={item.id}
            label={item.label}
            defaultChecked
          />
        ))}
        <p className="text-xs text-[var(--color-muted-400)]">
          Para autorizar solo algunas líneas, desmarca las que no quieres y usa &quot;Autorizar
          seleccionadas&quot;.
        </p>
      </div>

      <Textarea
        name="rejectionReason"
        label="Motivo (solo si rechazas)"
        helpText="Opcional — ayuda al taller a entender tu decisión."
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="accept_all" disabled={pending}>
          Autorizar todo
        </Button>
        <Button
          type="submit"
          name="decision"
          value="partial"
          variant="secondary"
          disabled={pending}
        >
          Autorizar seleccionadas
        </Button>
        <Button type="submit" name="decision" value="reject" variant="danger" disabled={pending}>
          Rechazar
        </Button>
      </div>
    </form>
  );
}
