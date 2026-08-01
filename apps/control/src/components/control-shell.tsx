"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar, Topbar, ElevatedAccessBanner, AccessBoundary, type NavItem } from "@datatek/ui";
import type { AccessBoundaryState } from "@datatek/auth";
import { routesForSurface, findRouteById } from "@datatek/domain";
import { RouteIcon } from "../lib/icon";
import { useState } from "react";
import type { ActiveElevationBanner } from "../lib/fixture-session";

function matchRouteId(pathname: string): string {
  const routes = routesForSurface("control");
  const staticMatch = routes.find((r) => r.path === pathname);
  if (staticMatch) return staticMatch.id;
  const dynamicMatch = routes.find((r) => {
    const pattern = "^" + r.path.replace(/\[[^\]]+\]/g, "[^/]+") + "$";
    return new RegExp(pattern).test(pathname);
  });
  return dynamicMatch?.id ?? "control.home";
}

export interface ControlShellProps {
  children: ReactNode;
  actorDisplayName: string;
  accessState: AccessBoundaryState;
  elevation: ActiveElevationBanner | null;
}

/** Runs in a fully separate app/port and never shares the public session
 * cookie (R0-A frontera: "Control y las superficies públicas no comparten
 * cookie de sesión"). */
export function ControlShell({
  children,
  actorDisplayName,
  accessState,
  elevation,
}: ControlShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const activeRouteId = matchRouteId(pathname);
  const title = findRouteById(activeRouteId)?.label ?? "Datatek Control";
  const routes = routesForSurface("control").filter((r) => r.navVisible);

  const navItems: NavItem[] = routes.map((r) => ({
    id: r.id,
    label: r.label,
    href: r.path,
    icon: <RouteIcon name={r.icon} className="h-5 w-5" />,
    active: r.id === activeRouteId,
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar
        items={navItems}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        brand={<span className="text-sm font-semibold">Datatek Control</span>}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ElevatedAccessBanner
          active={elevation !== null}
          actorLabel={actorDisplayName}
          organizationLabel={elevation?.organizationLabel}
          ticket={elevation?.ticket}
          reason={elevation?.reason}
          expiresAt={elevation?.expiresAt}
        />
        <Topbar title={title} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-6">
          <AccessBoundary state={accessState}>{children}</AccessBoundary>
        </main>
      </div>
    </div>
  );
}
