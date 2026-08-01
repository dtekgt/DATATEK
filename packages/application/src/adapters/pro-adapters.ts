// Fixture adapters. R0-B never fetches; R0-C/R0-D replace these functions
// with real reads behind the same ViewModel contracts, without touching UI.
import type {
  CalendarViewModel,
  CaseListViewModel,
  CaseWorkspaceViewModel,
  DashboardViewModel,
} from "../viewmodels/pro";
import {
  DEMO_BLOCKERS,
  DEMO_CASE_CODE,
  DEMO_CASE_ID,
  DEMO_NEXT_ACTION,
  buildDemoStageRail,
} from "../fixtures/cases.ts";

export function getDashboardViewModel(orgSlug: string): DashboardViewModel {
  return {
    demo: true,
    organizationName: orgSlug === "dtek-servicios" ? "DTEK Servicios (taller fundador)" : orgSlug,
    branchName: "Sucursal Central",
    openCasesCount: 6,
    casesWaitingAuthorization: 2,
    casesReadyForDelivery: 1,
    recentCases: [
      {
        id: DEMO_CASE_ID,
        code: DEMO_CASE_CODE,
        customerName: "Cliente Demo",
        vehicleLabel: "Toyota Corolla 2018",
        status: "waiting_authorization",
        nextAction: DEMO_NEXT_ACTION.primaryAction,
        updatedAt: "2026-07-30T14:20:00-06:00",
      },
      {
        id: "case-demo-inspection",
        code: "DTEK-2026-0139",
        customerName: "Cliente Demo 2",
        vehicleLabel: "Mazda 3 2020",
        status: "inspection",
        nextAction: "Completar checklist de inspección",
        updatedAt: "2026-07-29T11:00:00-06:00",
      },
    ],
  };
}

export function getCaseListViewModel(_orgSlug: string): CaseListViewModel {
  return {
    demo: true,
    total: 2,
    items: [
      {
        id: DEMO_CASE_ID,
        code: DEMO_CASE_CODE,
        customerName: "Cliente Demo",
        vehicleLabel: "Toyota Corolla 2018",
        status: "waiting_authorization",
        nextAction: DEMO_NEXT_ACTION.primaryAction,
        updatedAt: "2026-07-30T14:20:00-06:00",
      },
      {
        id: "case-demo-inspection",
        code: "DTEK-2026-0139",
        customerName: "Cliente Demo 2",
        vehicleLabel: "Mazda 3 2020",
        status: "inspection",
        nextAction: "Completar checklist de inspección",
        updatedAt: "2026-07-29T11:00:00-06:00",
      },
    ],
  };
}

export function getCaseWorkspaceViewModel(
  _orgSlug: string,
  caseId: string,
): CaseWorkspaceViewModel {
  const status = caseId === DEMO_CASE_ID ? "waiting_authorization" : "inspection";
  return {
    demo: true,
    caseId,
    code: caseId === DEMO_CASE_ID ? DEMO_CASE_CODE : "DTEK-2026-0139",
    customerName: "Cliente Demo",
    vehicleLabel: "Toyota Corolla 2018",
    status,
    stages: buildDemoStageRail(status),
    nextAction: DEMO_NEXT_ACTION,
    blockers: DEMO_BLOCKERS,
    quoteTotal: { amount: 1180, currency: "GTQ" },
    createdAt: "2026-07-20T09:00:00-06:00",
  };
}

export function getCalendarViewModel(_orgSlug: string): CalendarViewModel {
  return { demo: true, events: [] };
}
