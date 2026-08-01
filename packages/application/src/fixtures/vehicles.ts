import type {
  VehicleNowFact,
  MaintenanceItem,
  BrakeMeasurement,
  EvidenceItem,
} from "../viewmodels/shared";

// Fixture vehicles cover the mandated Now-status set: attention, unknown, stale
// plus a healthy "no_current_alerts" baseline (R0-B sección 8).
export const FIXTURE_VEHICLES = {
  brakesDemo: {
    id: "veh-demo-brakes",
    label: "Toyota Corolla 2018",
    plate: "P-123ABC",
    odometerKm: 84210,
    odometerReadAt: "2026-07-20T15:00:00-06:00",
  },
  attention: {
    id: "veh-demo-attention",
    label: "Mazda 3 2020",
    plate: "P-456DEF",
    odometerKm: 51230,
    odometerReadAt: "2026-07-28T09:00:00-06:00",
  },
  unknown: {
    id: "veh-demo-unknown",
    label: "Hyundai Tucson 2016",
    plate: "P-789GHI",
    odometerKm: null,
    odometerReadAt: null,
  },
  stale: {
    id: "veh-demo-stale",
    label: "Kia Rio 2015",
    plate: "P-321JKL",
    odometerKm: 112500,
    odometerReadAt: "2025-11-02T10:00:00-06:00",
  },
} as const;

export const FIXTURE_VEHICLE_NOW: Record<string, VehicleNowFact> = {
  [FIXTURE_VEHICLES.brakesDemo.id]: {
    status: "action_required",
    headline: "Autorización pendiente para frenos delanteros",
    detail: "Medición reciente marca desgaste por debajo del límite seguro.",
    source: "Inspección de taller (DTEK Servicios)",
    observedAt: "2026-07-30T14:20:00-06:00",
  },
  [FIXTURE_VEHICLES.attention.id]: {
    status: "attention",
    headline: "Fuga menor de refrigerante reportada",
    detail: "Reportado por el conductor; pendiente de verificación en taller.",
    source: "Reporte del conductor",
    observedAt: "2026-07-27T18:00:00-06:00",
  },
  [FIXTURE_VEHICLES.unknown.id]: {
    status: "unknown",
    headline: "Sin datos suficientes para evaluar el estado actual",
    detail: "Este vehículo todavía no tiene una inspección o reporte reciente.",
    source: "Sin fuente registrada",
    observedAt: null,
  },
  [FIXTURE_VEHICLES.stale.id]: {
    status: "stale",
    headline: "Último dato disponible tiene más de 8 meses",
    detail: "La última lectura de odómetro es de noviembre de 2025.",
    source: "Recepción de taller (visita anterior)",
    observedAt: "2025-11-02T10:00:00-06:00",
  },
};

// All four maintenance trigger kinds represented, per sección 8.
export const FIXTURE_MAINTENANCE: MaintenanceItem[] = [
  {
    id: "maint-oil",
    label: "Cambio de aceite y filtro",
    trigger: "whichever_first",
    status: "due_soon",
    dueDate: "2026-09-15",
    dueOdometerKm: 90000,
    basis: "Lo que ocurra primero: fecha o kilometraje, según manual del fabricante.",
  },
  {
    id: "maint-timing-belt",
    label: "Banda de distribución",
    trigger: "odometer",
    status: "upcoming",
    dueDate: null,
    dueOdometerKm: 100000,
    basis: "Recomendación por kilometraje del fabricante.",
  },
  {
    id: "maint-registration",
    label: "Revisión de circulación",
    trigger: "date",
    status: "overdue",
    dueDate: "2026-06-30",
    dueOdometerKm: null,
    basis: "Fecha límite regulatoria.",
  },
  {
    id: "maint-brakes",
    label: "Revisión de frenos",
    trigger: "condition",
    status: "due",
    dueDate: null,
    dueOdometerKm: null,
    basis: "Condición observada en la última inspección: desgaste avanzado.",
  },
];

export const FIXTURE_BRAKES: BrakeMeasurement[] = [
  { axle: "front", condition: "attention", padMm: 3.1, note: "Cerca del límite mínimo de 3mm." },
  { axle: "rear", condition: "pass", padMm: 6.4, note: null },
];

export const FIXTURE_EVIDENCE: EvidenceItem[] = [
  {
    id: "ev-1",
    label: "Foto de pastilla delantera izquierda",
    kind: "photo",
    provenance: "observed",
    visibility: "customer",
    capturedAt: "2026-07-30T14:10:00-06:00",
  },
  {
    id: "ev-2",
    label: "Medición de espesor de disco",
    kind: "measurement",
    provenance: "measured",
    visibility: "shared_case",
    capturedAt: "2026-07-30T14:15:00-06:00",
  },
  {
    id: "ev-3",
    label: "Nota interna de diagnóstico",
    kind: "document",
    provenance: "derived",
    visibility: "internal",
    capturedAt: "2026-07-30T14:25:00-06:00",
  },
];
