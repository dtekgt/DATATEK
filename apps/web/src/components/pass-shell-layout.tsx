"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { routesForSurface } from "@datatek/domain";
import { PassShell } from "./pass-shell";
import { getPassHomeViewModel } from "@datatek/application";

function matchRouteId(pathname: string): string {
  const routes = routesForSurface("pass");
  const passToken = routesForSurface("limited-auth");
  const all = [...routes, ...passToken];
  const staticMatch = all.find((r) => r.path === pathname);
  if (staticMatch) return staticMatch.id;
  const dynamicMatch = all.find((r) => {
    const pattern = "^" + r.path.replace(/\[[^\]]+\]/g, "[^/]+") + "$";
    return new RegExp(pattern).test(pathname);
  });
  return dynamicMatch?.id ?? "pass.home";
}

export function PassShellLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeRouteId = matchRouteId(pathname);
  const home = getPassHomeViewModel();
  const selected = home.vehicles.find((v) => v.id === home.selectedVehicleId) ?? home.vehicles[0];

  return (
    <PassShell
      activeRouteId={activeRouteId}
      vehicleRail={
        selected
          ? {
              vehicleLabel: selected.label,
              statusHeadline: selected.now.headline,
              statusSource: selected.now.source,
              statusObservedAt: selected.now.observedAt,
            }
          : undefined
      }
    >
      {children}
    </PassShell>
  );
}
