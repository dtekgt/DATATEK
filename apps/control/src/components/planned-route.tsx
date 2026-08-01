import { findRouteById } from "@datatek/domain";
import { PlannedFeatureState } from "@datatek/ui";

export function PlannedRoute({ routeId }: { routeId: string }) {
  const route = findRouteById(routeId);
  if (!route?.planned) return null;
  return <PlannedFeatureState title={route.label} detail={route.planned} />;
}
