"use client";

import { useActionState, useState } from "react";
import { Button, Card, Checkbox, InlineAlert, Textarea } from "@datatek/ui";
import { submitAuthorizationDecision, type AuthorizationDecisionActionState } from "./actions";

export interface DecisionFormItem {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
}

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(
      amountMinor / 100,
    );
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
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

  // Los checkboxes pasaron de `defaultChecked` (no controlados) a
  // controlados: el total sólo puede seguir a la selección si React sabe qué
  // está marcado. El estado inicial es "todo marcado", igual que antes.
  const [seleccionados, setSeleccionados] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id)),
  );
  const alternar = (id: string, marcado: boolean) =>
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (marcado) next.add(id);
      else next.delete(id);
      return next;
    });

  const totalSeleccionado = items
    .filter((i) => seleccionados.has(i.id))
    .reduce((suma, i) => suma + i.amountMinor, 0);
  const totalCompleto = items.reduce((suma, i) => suma + i.amountMinor, 0);
  // Todas las líneas de una cotización comparten moneda (la fija la versión
  // congelada); se toma la primera y se cae a GTQ sólo si no hay líneas.
  const moneda = items[0]?.currency ?? "GTQ";

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
            checked={seleccionados.has(item.id)}
            onChange={(e) => alternar(item.id, e.currentTarget.checked)}
          />
        ))}
        <p className="text-xs text-[var(--color-muted-400)]">
          Para autorizar solo algunas líneas, desmarca las que no quieres y usa &quot;Autorizar
          seleccionadas&quot;.
        </p>
      </div>

      {/* R0-E Fase 4 — esta pantalla mostraba el precio de cada renglón pero
          NUNCA su suma: ni el monto total ni la palabra "total" aparecían en
          ninguna parte del DOM. El cliente autorizaba un gasto sin ver cuánto
          era.

          El total es EN VIVO y no un valor fijo, porque la autorización es
          por renglón: un total estático dejaría de ser cierto en cuanto
          alguien desmarca una línea, y un número equivocado en la pantalla
          donde se aprueba un gasto es peor que ningún número.

          `aria-live="polite"` para que un lector de pantalla anuncie el
          cambio al marcar o desmarcar, sin interrumpir.

          Sin JavaScript no se degrada: el SSR emite los checkboxes con el
          atributo `checked` y el total ya calculado sobre la selección
          completa, así que la pantalla sigue siendo correcta y el navegador
          alterna los checkboxes de forma nativa. Verificado sobre el HTML
          servido, no supuesto. */}
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">Total de lo seleccionado</p>
          <p className="text-lg font-semibold tabular-nums" aria-live="polite">
            {formatMoney(totalSeleccionado, moneda)}
          </p>
        </div>
        {seleccionados.size !== items.length ? (
          <p className="mt-1 text-xs text-[var(--color-muted-400)]">
            {seleccionados.size} de {items.length} renglones · el total de la cotización completa es{" "}
            {formatMoney(totalCompleto, moneda)}
          </p>
        ) : null}
      </Card>

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
