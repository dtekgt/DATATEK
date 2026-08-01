import type { ImmediateDecision } from "../viewmodels/experience";

// Four fixture decisions on purpose: `ImmediateDecisionStack` must prove it
// only ever renders the first three (ley 33 / R0-B sección 8).
export const FIXTURE_DECISIONS_FOUR: ImmediateDecision[] = [
  {
    id: "dec-1",
    title: "Autorizar cambio de pastillas delanteras",
    description: "Cotización congelada v2 esperando tu decisión.",
    dueBy: "2026-08-03T17:00:00-06:00",
    href: "/pass/cases/case-demo-brakes",
  },
  {
    id: "dec-2",
    title: "Confirmar cita de revisión de circulación",
    description: "La fecha límite regulatoria venció el 30 de junio.",
    dueBy: "2026-08-05T17:00:00-06:00",
    href: "/pass/appointments",
  },
  {
    id: "dec-3",
    title: "Revisar fuga menor reportada",
    description: "Tu reporte quedó registrado; falta verificación en taller.",
    dueBy: null,
    href: "/pass/garage/veh-demo-attention",
  },
  {
    id: "dec-4",
    title: "Actualizar kilometraje del Kia Rio",
    description: "Sin lectura reciente; el próximo servicio no se puede calcular con precisión.",
    dueBy: null,
    href: "/pass/garage/veh-demo-stale",
  },
];
