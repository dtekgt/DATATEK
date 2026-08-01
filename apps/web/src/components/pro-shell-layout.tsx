import type { ReactNode } from "react";
import { getWebSession } from "../lib/fixture-session";
import { FixtureLoginForm } from "./fixture-login-form";
import { ProShell } from "./pro-shell";

/** Server component: resolves the real access decision (fixture-backed
 * while Supabase local is unreachable in this sandbox) before any Pro
 * content renders. "El servidor decide" — DATATEK_R0_C sección 9.
 *
 * `FixtureLoginForm` uses `next/headers` (server-only) inside a Server
 * Action, so it is returned directly from this server component instead of
 * being imported into the client-side `ProShell` — a Client Component may
 * never import a module that touches `next/headers`. */
export async function ProShellLayout({
  orgSlug,
  children,
}: {
  orgSlug: string;
  children: ReactNode;
}) {
  const session = await getWebSession(orgSlug, "organization.read");

  if (session.accessState.kind === "unauthenticated") {
    return <FixtureLoginForm />;
  }

  return (
    <ProShell orgSlug={orgSlug} session={session}>
      {children}
    </ProShell>
  );
}
