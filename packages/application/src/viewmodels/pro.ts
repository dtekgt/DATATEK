import type { CaseStatus } from "@datatek/domain";
import type {
  CaseBlocker,
  DemoMarker,
  Money,
  OperationalNextAction,
  StageRailStage,
} from "./shared";

export interface DashboardCaseSummary {
  id: string;
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: CaseStatus;
  nextAction: string;
  updatedAt: string;
}

export interface DashboardViewModel extends DemoMarker {
  organizationName: string;
  branchName: string;
  openCasesCount: number;
  casesWaitingAuthorization: number;
  casesReadyForDelivery: number;
  recentCases: DashboardCaseSummary[];
}

export interface CaseListItem {
  id: string;
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: CaseStatus;
  nextAction: string;
  updatedAt: string;
}

export interface CaseListViewModel extends DemoMarker {
  items: CaseListItem[];
  total: number;
}

export interface CaseWorkspaceViewModel extends DemoMarker {
  caseId: string;
  code: string;
  customerName: string;
  vehicleLabel: string;
  status: CaseStatus;
  stages: StageRailStage[];
  nextAction: OperationalNextAction;
  blockers: CaseBlocker[];
  quoteTotal: Money | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  caseId: string | null;
}

export interface CalendarViewModel extends DemoMarker {
  events: CalendarEvent[];
}
