import type { ReactNode } from "react";
import { routesForSurface, isHiddenForRole, type ActorRole } from "@datatek/domain";
import { RouteIcon } from "../lib/icon";

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
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/8">
        <nav
          aria-label="Navegación de Market"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3"
        >
          <a href="/market" className="text-sm font-semibold">
            Datatek Market
          </a>
          <ul className="flex flex-wrap items-center gap-3 text-sm">
            {routes.map((r) => (
              <li key={r.id}>
                <a
                  href={r.path}
                  className="focus-ring inline-flex items-center gap-1 rounded-[var(--radius-input)] px-2 py-1 text-[var(--color-muted-400)] hover:text-[var(--color-paper-50)]"
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
    </div>
  );
}
