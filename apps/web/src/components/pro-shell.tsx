"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Sidebar,
  Topbar,
  BottomNav,
  OrganizationSwitcher,
  BranchSwitcher,
  AccessBoundary,
  type NavItem,
  type BottomNavItem,
} from "@datatek/ui";
import { RouteIcon } from "../lib/icon";
import { routesForSurface, findRouteById } from "@datatek/domain";
import type { WebSessionResolution } from "../lib/fixture-session";

const BOTTOM_NAV_IDS = ["pro.dashboard", "pro.cases", "pro.calendar", "pro.shop"];

function matchRouteId(pathname: string, orgSlug: string): string {
  const routes = routesForSurface("pro");
  const staticMatch = routes.find((r) => r.path.replace("[orgSlug]", orgSlug) === pathname);
  if (staticMatch) return staticMatch.id;
  const dynamicMatch = routes.find((r) => {
    const pattern =
      "^" + r.path.replace("[orgSlug]", orgSlug).replace(/\[[^\]]+\]/g, "[^/]+") + "$";
    return new RegExp(pattern).test(pathname);
  });
  return dynamicMatch?.id ?? "pro.dashboard";
}

export interface ProShellProps {
  orgSlug: string;
  session: WebSessionResolution;
  children: ReactNode;
}

export function ProShell({ orgSlug, session, children }: ProShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [branch, setBranch] = useState<string>(session.availableBranches[0]?.id ?? "");
  const router = useRouter();
  const pathname = usePathname();

  const activeRouteId = matchRouteId(pathname, orgSlug);
  const title = findRouteById(activeRouteId)?.label ?? "Datatek Pro";

  const routes = routesForSurface("pro");
  const navItems: NavItem[] = routes
    .filter((r) => r.navVisible)
    .map((r) => ({
      id: r.id,
      label: r.label,
      href: r.path.replace("[orgSlug]", orgSlug),
      icon: <RouteIcon name={r.icon} className="h-5 w-5" />,
      active: r.id === activeRouteId,
    }));

  const bottomItems: BottomNavItem[] = [
    ...routes
      .filter((r) => BOTTOM_NAV_IDS.includes(r.id))
      .map((r) => ({
        id: r.id,
        label: r.label,
        href: r.path.replace("[orgSlug]", orgSlug),
        icon: <RouteIcon name={r.icon} className="h-5 w-5" />,
        active: r.id === activeRouteId,
      })),
    {
      id: "pro.more",
      label: "Más",
      href: `/pro/o/${orgSlug}/settings`,
      icon: <RouteIcon name="MoreHorizontal" className="h-5 w-5" />,
      active: activeRouteId === "pro.settings",
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        items={navItems}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        brand={<span className="text-sm font-semibold">Datatek Pro</span>}
      />
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <Topbar
          title={title}
          actions={
            <div className="hidden items-center gap-2 md:flex">
              {/* Only organizations this actor has an active membership in
                  — never the full fixture org list (sección 5.3). */}
              <OrganizationSwitcher
                label="Organización"
                options={session.availableOrganizations.map((o) => ({
                  id: o.id,
                  label: o.label,
                  meta: o.meta,
                }))}
                value={session.organizationId ?? ""}
                onChange={(id) => {
                  const target = session.availableOrganizations.find((o) => o.id === id);
                  if (target) router.push(`/pro/o/${target.slug}/dashboard`);
                }}
              />
              {/* Branch selector only shows scopes this membership is
                  allowed to act on (sección 5.3). */}
              <BranchSwitcher
                label="Sucursal"
                options={session.availableBranches}
                value={branch}
                onChange={setBranch}
              />
            </div>
          }
        />
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6">
          <AccessBoundary state={session.accessState}>{children}</AccessBoundary>
        </main>
      </div>
      <BottomNav items={bottomItems} />
    </div>
  );
}
