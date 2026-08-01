import type { ReactNode } from "react";
import { routesForSurface } from "@datatek/domain";
import { RouteIcon } from "../lib/icon";

export function PublicShell({ children }: { children: ReactNode }) {
  const routes = routesForSurface("public").filter((r) => r.navVisible);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/8">
        <nav
          aria-label="Navegación principal"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3"
        >
          <a href="/" className="text-sm font-semibold">
            Datatek
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
      <footer className="border-t border-white/8 px-4 py-6 text-xs text-[var(--color-muted-400)]">
        <div className="mx-auto max-w-6xl">
          Datatek · Foundation Release R0-B · datos de demostración rotulados, sin conexión a
          producción.
        </div>
      </footer>
    </div>
  );
}
