"use client";

import { useActionState } from "react";
import { Badge, Button, Card, PageTitle, Input, InlineAlert } from "@datatek/ui";
import { requestMagicLinkAction, type MagicLinkActionState } from "./supabase-login-actions";

const INITIAL_STATE: MagicLinkActionState = { status: "idle" };

/** Reemplaza a `FixtureLoginForm` cuando `DATATEK_PERSISTENCE=postgres` está
 * activo — mismo punto de montaje (`ProShellLayout`, cuando `accessState.
 * kind === "unauthenticated"`), mismo "nunca es una ruta dedicada" (ver la
 * nota en `fixture-login-form.tsx`). Sin contraseña: un enlace de un solo
 * uso a `/auth/callback`, que intercambia el código por una sesión real de
 * Supabase Auth. */
export function SupabaseLoginForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState<MagicLinkActionState, FormData>(
    requestMagicLinkAction,
    INITIAL_STATE,
  );

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <div>
        <Badge tone="brand">PRO · SOLO PERSONAL DEL TALLER</Badge>
        <PageTitle className="mt-3">Entrar a Pro</PageTitle>
        <p className="mt-2 text-sm text-[var(--color-muted-400)]">
          Escribe tu correo de trabajo. Te enviamos un enlace de acceso de un solo uso — sin
          contraseña.
        </p>
      </div>
      <Card>
        {state.status === "success" ? (
          <InlineAlert tone="success" title="Revisa tu correo" description={state.message} />
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <Input
              name="email"
              type="email"
              label="Correo de trabajo"
              placeholder="tu.nombre@datatek.local"
              autoComplete="email"
              required
            />
            {state.status === "error" ? (
              <InlineAlert
                tone="danger"
                title="No se pudo enviar el enlace"
                description={state.message}
              />
            ) : null}
            <Button type="submit" loading={pending}>
              Enviar enlace de acceso
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
