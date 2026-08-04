"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { routesForSurface } from "@datatek/domain";
import { PassShell } from "./pass-shell";

export interface PassVehicleRail {
  vehicleLabel: string;
  statusHeadline: string;
  statusSource: string;
  statusObservedAt: string | null;
}

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

export function PassShellLayout({
  children,
  vehicleRail,
}: {
  children: ReactNode;
  vehicleRail?: PassVehicleRail;
}) {
  const pathname = usePathname();
  const activeRouteId = matchRouteId(pathname);

  return (
    <PassShell activeRouteId={activeRouteId} vehicleRail={vehicleRail}>
      {children}
    </PassShell>
  );
}
