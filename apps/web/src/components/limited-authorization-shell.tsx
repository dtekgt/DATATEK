import type { ReactNode } from "react";

/** Minimal, isolated shell for `/a/[token]`. No navigation to unrelated
 * data, no account requirement, no token printed anywhere in the DOM. */
export function LimitedAuthorizationShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-ink-950)]">
      <header className="border-b border-white/8 px-4 py-4 text-center">
        <p className="text-sm font-semibold">Datatek</p>
        <p className="text-xs text-[var(--color-muted-400)]">Enlace de autorización</p>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
        {children}
      </main>
      <footer className="px-4 py-4 text-center text-xs text-[var(--color-muted-400)]">
        No necesitas instalar una app. Este enlace permite revisar únicamente esta solicitud.
      </footer>
    </div>
  );
}
