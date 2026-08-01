import type { Metadata } from "next";
import "./globals.css";
import { ControlShell } from "../components/control-shell";
import { FixtureLoginForm } from "../components/fixture-login-form";
import { getControlEnv } from "../lib/env";
import { getControlSession, getActiveElevationBanner } from "../lib/fixture-session";

getControlEnv();

export const metadata: Metadata = {
  title: "Datatek Control",
  description: "Gobierno interno de la red Datatek. Aplicación separada, sin cookie compartida.",
};

export default async function ControlRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getControlSession("platform.control.enter");
  const elevation =
    session.accessState.kind === "allowed" ? await getActiveElevationBanner() : null;

  return (
    <html lang="es">
      <body>
        {session.accessState.kind === "unauthenticated" ? (
          <FixtureLoginForm />
        ) : (
          <ControlShell
            actorDisplayName={session.actorDisplayName}
            accessState={session.accessState}
            elevation={elevation}
          >
            {children}
          </ControlShell>
        )}
      </body>
    </html>
  );
}
