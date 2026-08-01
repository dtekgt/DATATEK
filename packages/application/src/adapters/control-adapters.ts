import type { ControlStatusViewModel } from "../viewmodels/control";

export function getControlStatusViewModel(): ControlStatusViewModel {
  return {
    demo: true,
    generatedAt: "2026-08-01T08:00:00-06:00",
    checks: [
      {
        id: "chk-1",
        label: "Toolchain instala y compila",
        status: "demo",
        detail: "pnpm install, build y typecheck verdes.",
      },
      {
        id: "chk-2",
        label: "Domain spec sin drift",
        status: "demo",
        detail: "pnpm spec:check compara contra el YAML normativo.",
      },
      {
        id: "chk-3",
        label: "Aislamiento de sesión Control",
        status: "demo",
        detail: "Control corre en app y puerto separados, sin cookie compartida.",
      },
      {
        id: "chk-4",
        label: "Base local Supabase",
        status: "planned",
        detail: "Migración 0000 pendiente de Docker Desktop en este entorno.",
      },
      {
        id: "chk-5",
        label: "Autenticación real",
        status: "planned",
        detail: "Se conecta en R0-C.",
      },
    ],
  };
}
