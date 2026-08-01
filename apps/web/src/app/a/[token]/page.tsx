import { AuthorizationCard, Button, Card, ErrorState, InlineAlert } from "@datatek/ui";
import { resolveLimitedAuthState } from "../../../lib/limited-auth";

export default async function LimitedAuthorizationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = resolveLimitedAuthState(token);

  if (state === "invalid") {
    return (
      <ErrorState
        title="Este enlace no es válido"
        description="No se registró ninguna decisión. Pide al taller que te envíe un enlace nuevo."
      />
    );
  }

  if (state === "expired") {
    return (
      <ErrorState
        title="Este enlace expiró"
        description="No se registró ninguna decisión. Pide al taller que te envíe un enlace nuevo."
      />
    );
  }

  if (state === "context") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Tienes una solicitud de autorización</h1>
        <p className="text-sm text-[var(--color-muted-400)]">
          DTEK Servicios preparó una cotización para tu vehículo. No necesitas instalar una app.
          Este enlace permite revisar únicamente esta solicitud.
        </p>
        <Button disabled>Continuar (R0-D)</Button>
        <p className="text-xs text-[var(--color-muted-400)]">
          La verificación y decisión reales se conectan en R0-D. Este shell solo muestra el estado.
        </p>
      </div>
    );
  }

  if (state === "verification") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Verifiquemos que eres tú</h1>
        <p className="text-sm text-[var(--color-muted-400)]">
          En R0-D se enviará un código corto. Aquí solo se muestra el estado, sin verificación real.
        </p>
        <InlineAlert
          tone="info"
          title="Sin cuenta requerida"
          description="Nunca se te pedirá crear una cuenta para revisar esta solicitud."
        />
      </div>
    );
  }

  if (state === "review") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Revisa la solicitud</h1>
        <AuthorizationCard
          requestStatus="viewed"
          versionLabel="Cotización v2"
          hash="a3f9c7e21b8d4f0012ab"
          lines={["Cambio de pastillas delanteras", "Revisión de disco delantero"]}
          expiresAt="2026-08-05T17:00:00-06:00"
        />
      </div>
    );
  }

  if (state === "decision") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Tu decisión</h1>
        <Card>
          <p className="text-sm text-[var(--color-muted-400)]">
            La decisión real se habilita en R0-D. Este shell nunca simula un envío exitoso.
          </p>
          <div className="mt-3 flex gap-2">
            <Button disabled>Autorizar (deshabilitado)</Button>
            <Button variant="secondary" disabled>
              Rechazar (deshabilitado)
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (state === "confirmation") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Confirmación</h1>
        <p className="text-sm text-[var(--color-muted-400)]">
          Este es un estado de ejemplo. Ninguna decisión real fue enviada porque R0-B no ejecuta
          autorizaciones.
        </p>
      </div>
    );
  }

  // receipt
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Constancia</h1>
      <p className="text-sm text-[var(--color-muted-400)]">
        Vista de ejemplo de la constancia de decisión. El contenido real llega con R0-D.
      </p>
    </div>
  );
}
