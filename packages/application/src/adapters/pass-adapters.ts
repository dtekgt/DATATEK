import type {
  PassCaseViewModel,
  PassHomeViewModel,
  VehiclePassportViewModel,
} from "../viewmodels/pass";
import type {
  ImmediateDecisionViewModel,
  NextServiceViewModel,
  VehicleNowViewModel,
} from "../viewmodels/experience";
import {
  FIXTURE_BRAKES,
  FIXTURE_MAINTENANCE,
  FIXTURE_VEHICLES,
  FIXTURE_VEHICLE_NOW,
} from "../fixtures/vehicles.ts";
import { FIXTURE_DECISIONS_FOUR } from "../fixtures/decisions.ts";
import { DEMO_CASE_CODE, DEMO_CASE_ID, friendlyCaseStatus } from "../fixtures/cases.ts";

export function getPassHomeViewModel(): PassHomeViewModel {
  const vehicles = Object.values(FIXTURE_VEHICLES);
  return {
    demo: true,
    customerFirstName: "Cliente",
    selectedVehicleId: FIXTURE_VEHICLES.brakesDemo.id,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      label: v.label,
      plate: v.plate,
      now: FIXTURE_VEHICLE_NOW[v.id]!,
    })),
  };
}

export function getVehicleNowViewModel(vehicleId: string): VehicleNowViewModel {
  const fact =
    FIXTURE_VEHICLE_NOW[vehicleId] ?? FIXTURE_VEHICLE_NOW[FIXTURE_VEHICLES.brakesDemo.id]!;
  return {
    demo: true,
    vehicleId,
    status: fact.status,
    headline: fact.headline,
    detail: fact.detail,
    source: fact.source,
    observedAt: fact.observedAt,
    noFindingsIsNotHealthy: true,
    globalHealthScore: null,
  };
}

export function getNextServiceViewModel(vehicleId: string): NextServiceViewModel {
  const item = FIXTURE_MAINTENANCE[0]!;
  return {
    demo: true,
    vehicleId,
    label: item.label,
    triggerKind: item.trigger,
    dueDate: item.dueDate,
    dueOdometerKm: item.dueOdometerKm,
    condition: null,
    basis: item.basis,
  };
}

export function getImmediateDecisionsViewModel(vehicleId: string): ImmediateDecisionViewModel {
  return { demo: true, vehicleId, decisions: FIXTURE_DECISIONS_FOUR };
}

export function getVehiclePassportViewModel(vehicleId: string): VehiclePassportViewModel {
  const vehicle =
    Object.values(FIXTURE_VEHICLES).find((v) => v.id === vehicleId) ?? FIXTURE_VEHICLES.brakesDemo;
  const now = FIXTURE_VEHICLE_NOW[vehicle.id]!;
  return {
    demo: true,
    vehicleId: vehicle.id,
    label: vehicle.label,
    plate: vehicle.plate,
    odometerKm: vehicle.odometerKm,
    odometerReadAt: vehicle.odometerReadAt,
    now,
    timeline: [
      {
        id: "tl-1",
        date: "2026-07-30",
        title: "Inspección de frenos",
        description: "Se detectó desgaste en pastillas delanteras.",
        provenance: "measured",
      },
      {
        id: "tl-2",
        date: "2026-05-12",
        title: "Cambio de aceite",
        description: "Servicio de mantenimiento preventivo completado.",
        provenance: "observed",
      },
    ],
    maintenance: FIXTURE_MAINTENANCE,
    brakes: FIXTURE_BRAKES,
    documentsCount: 3,
  };
}

export function getPassCaseViewModel(caseId: string): PassCaseViewModel {
  const status = caseId === DEMO_CASE_ID ? "waiting_authorization" : "inspection";
  return {
    demo: true,
    caseId,
    code: caseId === DEMO_CASE_ID ? DEMO_CASE_CODE : "DTEK-2026-0139",
    vehicleLabel: FIXTURE_VEHICLES.brakesDemo.label,
    status,
    friendlyStatus: friendlyCaseStatus(status),
    proofSummaryId: caseId,
    updatedAt: "2026-07-30T14:20:00-06:00",
  };
}
