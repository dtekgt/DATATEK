import type { ReactNode } from "react";
import { routesForSurface } from "@datatek/domain";
import { LinkButton } from "@datatek/ui";
import { Menu } from "lucide-react";
import { RouteIcon } from "../lib/icon";

export function PublicShell({ children }: { children: ReactNode }) {
  const routes = routesForSurface("public").filter((r) => r.navVisible);
  const primaryIds = new Set([
    "public.home",
    "public.pro",
    "public.pass",
    "public.market",
    "public.trust",
  ]);
  const primaryRoutes = routes.filter((route) => primaryIds.has(route.id));
  const secondaryRoutes = routes.filter((route) => !primaryIds.has(route.id));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[var(--surface-app)]/94 backdrop-blur-xl">
        <nav
          aria-label="Navegación principal"
          className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4"
        >
          <a
            href="/"
            className="focus-ring rounded-[var(--radius-input)] text-sm font-bold tracking-[0.18em]"
          >
            DATATEK
          </a>
          <ul className="ml-auto hidden items-center gap-1 text-sm md:flex">
            {primaryRoutes.map((r) => (
              <li key={r.id}>
                <a
                  href={r.path}
                  className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[var(--color-muted-400)] transition-colors hover:bg-white/5 hover:text-[var(--color-paper-50)]"
                >
                  <RouteIcon name={r.icon} className="h-4 w-4" />
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
          <LinkButton href="/pass" size="sm" className="ml-auto hidden md:inline-flex">
            Ver la experiencia
          </LinkButton>

          <details className="relative ml-auto md:hidden">
            <summary className="focus-ring tap-target flex cursor-pointer list-none items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-panel)] shadow-[var(--neu-raised-sm)]">
              <span className="sr-only">Abrir navegación</span>
              <Menu className="h-5 w-5" aria-hidden />
            </summary>
            <div className="absolute right-0 mt-3 w-64 rounded-[var(--radius-card)] bg-[var(--surface-panel)] p-2 shadow-[var(--neu-raised-lg)]">
              {primaryRoutes.map((route) => (
                <a
                  key={route.id}
                  href={route.path}
                  className="focus-ring flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm text-[var(--color-muted-400)] hover:bg-white/5 hover:text-white"
                >
                  <RouteIcon name={route.icon} className="h-4 w-4" />
                  {route.label}
                </a>
              ))}
            </div>
          </details>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:py-12">{children}</main>
      <footer className="mt-12 border-t border-white/8 px-4 py-8 text-xs text-[var(--color-muted-400)]">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="font-bold tracking-[0.18em] text-[var(--color-paper-50)]">DATATEK</p>
            <p className="mt-2 max-w-xs leading-relaxed">
              Claridad para quien conduce. Control para quien repara. Evidencia para ambos.
            </p>
          </div>
          <nav
            aria-label="Enlaces secundarios"
            className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3"
          >
            {secondaryRoutes.map((route) => (
              <a key={route.id} href={route.path} className="hover:text-white">
                {route.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5">
          <span>© 2026 Datatek · Ciudad de Guatemala</span>
          <span>Entorno de demostración rotulado · sin conexión a producción</span>
        </div>
      </footer>
    </div>
  );
}
