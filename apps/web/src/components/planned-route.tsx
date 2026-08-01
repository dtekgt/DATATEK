import { findRouteById } from "@datatek/domain";
import { PlannedFeatureState, Badge } from "@datatek/ui";
import { Breadcrumbs } from "./breadcrumbs";

/** Renders the honest planned state for a registered route that has no real
 * implementation yet. Never simulates success (ley 29). */
export function PlannedRoute({ routeId }: { routeId: string }) {
  const route = findRouteById(routeId);
  if (!route) {
    return (
      <PlannedFeatureState
        title="Ruta no encontrada"
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
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={route.breadcrumbs} />
      <PlannedFeatureState title={route.label} detail={route.planned} />
    </div>
  );
}
