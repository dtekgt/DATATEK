"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { routesForSurface, isHiddenForRole, type ActorRole } from "@datatek/domain";
import { BottomNav, type BottomNavItem } from "@datatek/ui";
import { RouteIcon } from "../lib/icon";
import { BrandMark } from "./brand-mark";

export function MarketShell({
  children,
  actorRole = "conductor",
}: {
  children: ReactNode;
  actorRole?: ActorRole;
}) {
  const routes = routesForSurface("market").filter(
    (r) => r.navVisible && !isHiddenForRole(r, actorRole),
  );
  const pathname = usePathname();
  const bottomItems: BottomNavItem[] = routes.slice(0, 5).map((route) => ({
    id: route.id,
    label: route.label,
    href: route.path,
    icon: <RouteIcon name={route.icon} className="h-5 w-5" />,
    active: route.path === pathname,
  }));

  return (
    <div className="flex min-h-screen flex-col pb-24 md:pb-0">
      <div aria-hidden className="dtek-grid-bg" />
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[var(--surface-app)]/94 backdrop-blur-xl">
        <nav
          aria-label="Navegación de Market"
          className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4"
        >
          <a href="/market" className="focus-ring rounded-[var(--radius-control)]">
            <BrandMark subtitle="Encuentra un taller de confianza" />
          </a>
          <ul className="ml-auto hidden items-center gap-1 text-sm md:flex">
            {routes.map((r) => (
              <li key={r.id}>
                <a
                  href={r.path}
                  aria-current={r.path === pathname ? "page" : undefined}
                  className={`focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-3 transition-colors ${
                    r.path === pathname
                      ? "bg-[var(--surface-well)] text-[var(--color-brand-400)] shadow-[var(--neu-inset)]"
                      : "text-[var(--color-muted-400)] hover:bg-white/5 hover:text-[var(--color-paper-50)]"
                  }`}
                >
                  <RouteIcon name={r.icon} className="h-4 w-4" />
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <BottomNav items={bottomItems} />
    </div>
  );
}
