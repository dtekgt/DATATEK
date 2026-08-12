import type { ReactNode } from "react";
import { getWebSession } from "../lib/fixture-session";
import { isPostgresEnabled } from "../lib/commands-engine";
import { FixtureLoginForm } from "./fixture-login-form";
import { SupabaseLoginForm } from "./supabase-login-form";
import { ProShell } from "./pro-shell";

/** Server component: resolves the real access decision — Supabase Auth
 * real cuando `DATATEK_PERSISTENCE=postgres` está activo, fixture-backed
 * si no — antes de que renderice cualquier contenido de Pro. "El servidor
 * decide" — DATATEK_R0_C sección 9.
 *
 * Ambos formularios de login usan `next/headers`/cookies (server-only)
 * dentro de una Server Action, así que se devuelven directo desde este
 * server component en vez de importarse en el `ProShell` cliente — un
 * Client Component nunca puede importar un módulo que toque
 * `next/headers`. */
export async function ProShellLayout({
  orgSlug,
  children,
}: {
  orgSlug: string;
  children: ReactNode;
}) {
  const session = await getWebSession(orgSlug, "organization.read");

  if (session.accessState.kind === "unauthenticated") {
    return isPostgresEnabled() ? (
      <SupabaseLoginForm orgSlug={orgSlug} />
    ) : (
      <FixtureLoginForm />
    );
  }

  return (
    <ProShell orgSlug={orgSlug} session={session}>
      {children}
    </ProShell>
  );
}
