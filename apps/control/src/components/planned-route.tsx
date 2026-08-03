import { findRouteById } from "@datatek/domain";
import { PlannedFeatureState, Badge } from "@datatek/ui";

/** Renders the honest planned state for a registered route that has no real
 * implementation yet. Never simulates success (ley 29).
 *
 * Esta implementación devolvía `null` en sus dos ramas de fallo, es decir
 * una pantalla en blanco: el usuario no podía distinguir "esta ruta aún no
 * existe" de "la página se rompió". La gemela de `apps/web` sí declaraba
 * ambos casos, así que las dos apps divergían justo donde importa — en cómo
 * fallan. Se alinean aquí. */
export function PlannedRoute({ routeId }: { routeId: string }) {
  const route = findRouteById(routeId);
  if (!route) {
    return (
      <PlannedFeatureState
        title="Ruta no encontrada"
        titleAs="h1"
        detail={{
          purpose: "N/A",
          dependency: "N/A",
          release: "r0-b",
          dataToBeUsed: "N/A",
          whyDisabled: `No existe una entrada de registro para "${routeId}".`,
        }}
      />
    );
  }
  if (!route.planned) {
    return (
      <Badge tone="warning">Esta ruta ya tiene datos demo; falta conectar el estado planned.</Badge>
    );
  }
  // `titleAs="h1"` — ver el gemelo de apps/web.
  return <PlannedFeatureState title={route.label} detail={route.planned} titleAs="h1" />;
}
