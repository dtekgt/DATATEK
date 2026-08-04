"use client";

import type { ReactNode } from "react";
import { BottomNav, VehicleContextRail, type BottomNavItem } from "@datatek/ui";
import { RouteIcon } from "../lib/icon";
import { routesForSurface } from "@datatek/domain";

export interface PassShellProps {
  activeRouteId: string;
  children: ReactNode;
  vehicleRail?: {
    vehicleLabel: string;
    statusHeadline: string;
    statusSource: string;
    statusObservedAt: string | null;
  };
}

const NAV_IDS = ["pass.home", "pass.garage", "pass.cases", "pass.appointments", "pass.account"];

export function PassShell({ activeRouteId, children, vehicleRail }: PassShellProps) {
  const routes = routesForSurface("pass");
  const bottomItems: BottomNavItem[] = NAV_IDS.map((id) => {
    const r = routes.find((route) => route.id === id)!;
    return {
      id: r.id,
      label: r.label,
      href: r.path,
      icon: <RouteIcon name={r.icon} className="h-5 w-5" />,
      active: r.id === activeRouteId,
    };
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col pb-24">
      <header className="flex items-center gap-2 px-4 py-4">
        <span className="text-sm font-bold tracking-[0.12em]">DATATEK PASS</span>
      </header>
      {vehicleRail ? (
        <div className="sticky top-0 z-20 bg-[var(--surface-app)]/95 px-4 py-2 backdrop-blur">
          <VehicleContextRail
            vehicleLabel={vehicleRail.vehicleLabel}
            statusHeadline={vehicleRail.statusHeadline}
            statusSource={vehicleRail.statusSource}
            statusObservedAt={vehicleRail.statusObservedAt}
            compact
          />
        </div>
      ) : null}
      <main className="flex-1 p-4">{children}</main>
      <BottomNav items={bottomItems} />
    </div>
  );
}
