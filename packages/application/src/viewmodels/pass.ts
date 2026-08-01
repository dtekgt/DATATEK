import type { CaseStatus } from "@datatek/domain";
import type {
  BrakeMeasurement,
  DemoMarker,
  EvidenceItem,
  MaintenanceItem,
  VehicleNowFact,
} from "./shared";

export interface PassVehicleSummary {
  id: string;
  label: string;
  plate: string;
  now: VehicleNowFact;
}

export interface PassHomeViewModel extends DemoMarker {
  customerFirstName: string;
  vehicles: PassVehicleSummary[];
  selectedVehicleId: string | null;
}

export interface TimelineEntry {
  id: string;
  date: string;
  title: string;
  description: string;
  provenance: EvidenceItem["provenance"];
}

export interface VehiclePassportViewModel extends DemoMarker {
  vehicleId: string;
  label: string;
  plate: string;
  odometerKm: number | null;
  odometerReadAt: string | null;
  now: VehicleNowFact;
  timeline: TimelineEntry[];
  maintenance: MaintenanceItem[];
  brakes: BrakeMeasurement[];
  documentsCount: number;
}

export interface PassCaseSummary {
  id: string;
  code: string;
  vehicleLabel: string;
  status: CaseStatus;
  friendlyStatus: string;
  updatedAt: string;
}

export interface PassCaseViewModel extends DemoMarker {
  caseId: string;
  code: string;
  vehicleLabel: string;
  status: CaseStatus;
  friendlyStatus: string;
  proofSummaryId: string;
  updatedAt: string;
}
